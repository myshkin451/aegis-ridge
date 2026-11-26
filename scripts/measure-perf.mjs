import { chromium } from 'playwright'
import { preview } from 'vite'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(new URL('../public/terrain/atlas.json', import.meta.url), 'utf8'))
const tiles = await Promise.all(
  [...manifest.insets, ...manifest.tiles.slice().reverse()].map(async (t) => ({
    ...t,
    bytes: await readFile(new URL('../public/terrain/' + t.file, import.meta.url)),
  })),
)
// Independent reader of the deployed terrain triangles, using their actual binary heights.
function elevation(x, z) {
  const t = tiles.find((t) => Math.max(Math.abs(x - t.cx), Math.abs(z - t.cz)) <= t.span / 2)
  if (!t) throw Error('相机超出测区')
  const u = (x - t.cx + t.span / 2) / t.step,
    v = (z - t.cz + t.span / 2) / t.step
  const i = Math.min(t.n - 2, Math.floor(u)),
    j = Math.min(t.n - 2, Math.floor(v)),
    a = u - i,
    b = v - j
  const h = (dx, dz) => t.bytes.readUInt16LE(6 * ((j + dz) * t.n + i + dx)) / 32 - 512
  return (
    h(0, 0) * (1 - Math.max(a, b)) + h(1, 1) * Math.min(a, b) + (a > b ? h(1, 0) : h(0, 1)) * Math.abs(a - b)
  )
}
const server = await preview({
  root,
  preview: { host: '127.0.0.1', port: 0, open: false },
  logLevel: 'error',
})
let browser
try {
  browser = await chromium.launch({
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ['--use-angle=metal'],
  })
  const page = await browser.newPage({
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  })
  const errors = [],
    reports = [],
    failures = [],
    events = []
  page.on('pageerror', (e) => {
    errors.push(e.message)
    console.error(e.message)
  })
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      errors.push(m.text())
      console.error(m.text().slice(0, 700))
    }
  })
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(r.status() + ' ' + new URL(r.url()).pathname)
  })
  page.on('requestfailed', (r) => errors.push(new URL(r.url()).pathname + ' ' + r.failure()?.errorText))
  await page.addInitScript((debug) => {
    sessionStorage.setItem('ars-keys', '1')
    const webgl = WebGL2RenderingContext.prototype,
      link = webgl.linkProgram
    const perf = (window.surveyPerf = { links: 0, frames: [], running: false, prev: 0, started: 0 })
    webgl.linkProgram = function (program) {
      perf.links++
      if (debug && perf.ready) {
        const shaders = this.getAttachedShaders(program).map((s) => this.getShaderSource(s))
        const vertex = shaders.find((s) => s.includes('gl_Position')) ?? ''
        console.info(
          '首次链接',
          shaders
            .map((s) =>
              [
                ...s.matchAll(
                  /^#define (?:SHADER_TYPE|SHADER_NAME|USE_[A-Z_]+|DOUBLE_SIDED|FLIP_SIDED|ALPHA_TO_COVERAGE|OPAQUE|CSM_CASCADES|[A-Z_]+PACKING).*?$|^#if [0-9]+ > 0/gm,
                ),
              ]
                .slice(0, 28)
                .map((m) => m[0])
                .join(','),
            )
            .join('/'),
          vertex.slice(0, 80),
          shaders.map((s) => s.length).join('/'),
        )
      }
      return link.call(this, program)
    }
    function frame(t) {
      const c = document.querySelector('canvas')
      if (perf.running && c) {
        const data = c.dataset
        perf.frames.push([t - perf.prev, c.width, data.eye, Number(data.calls), Number(data.triangles)])
      }
      perf.prev = t
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    window.addEventListener('ars-ready', () => {
      perf.ready = performance.now()
      perf.coldLinks = perf.links
    })
  }, process.argv.includes('--diagnose'))
  if (process.argv.includes('--diagnose'))
    page.on('console', (m) => {
      if (m.type() === 'info') console.log(m.text())
    })
  page.setDefaultTimeout(30000)
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas[data-rendered=true][data-ready=settled]')
  const env = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2'),
      ext = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      gpu: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
      ready: window.surveyPerf.ready,
      precompiled: window.surveyPerf.coldLinks,
      marks: performance
        .getEntriesByType('mark')
        .filter((e) => e.name.startsWith('ars-open-'))
        .map((e) => [e.name, e.startTime]),
      paint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      agent: navigator.userAgent,
    }
  })
  console.log('首屏', JSON.stringify(env))
  if (!/ANGLE.*Metal/i.test(env.gpu) || /SwiftShader|llvmpipe|software/i.test(env.gpu))
    throw Error('实测需要硬件 ANGLE Metal')
  if (!(env.ready <= 8000 && env.paint <= 3000)) failures.push('首屏描线/材质时间超限')
  const cdp = await page.context().newCDPSession(page)
  cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value))
  await cdp.send('Tracing.start', {
    categories: 'toplevel,disabled-by-default-devtools.timeline,devtools.timeline,blink.user_timing',
    transferMode: 'ReportEvents',
  })
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const cycle = () =>
    page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const read = (key) => page.locator('canvas').getAttribute('data-' + key)
  const measure = async (label, action, expected) => {
    const id = String(reports.length)
    await page.evaluate((id) => {
      const p = window.surveyPerf
      p.frames = []
      p.running = true
      p.started = p.links
      performance.mark('ars-start-' + id)
    }, id)
    await action()
    if (expected)
      await page.waitForFunction((e) => {
        const c = document.querySelector('canvas').dataset
        return c.ready === 'settled' && c.view === e[0] && c.mode === e[1]
      }, expected)
    await cycle()
    const result = await page.evaluate((id) => {
      const p = window.surveyPerf
      p.running = false
      performance.mark('ars-end-' + id)
      return { frames: p.frames, links: p.links - p.started }
    }, id)
    const frames = result.frames,
      ms = frames.map((x) => x[0]).sort((a, b) => a - b)
    if (!frames.length) throw Error(label + ' 无有效动画帧')
    const widths = [...new Set(frames.map((f) => f[1]))],
      eyes = frames.map((f) => f[2]?.split(',').map(Number)).filter(Boolean)
    const row = {
      id,
      label,
      fps: (1000 * ms.length) / ms.reduce((a, b) => a + b, 0),
      p95: ms[Math.ceil(ms.length * 0.95) - 1],
      maxFrame: ms.at(-1),
      links: result.links,
      widths,
      draws: Math.max(...frames.map((f) => f[3])),
      triangles: Math.max(...frames.map((f) => f[4])),
    }
    if (result.links) failures.push(label + ' 新链接 ' + result.links)
    if (label === '现场静止 8 s' && widths.length !== 1) failures.push('静止画布宽度变化')
    reports.push(row)
    console.log(label, 'FPS', row.fps.toFixed(1), 'p95', row.p95.toFixed(1), '链接', row.links)
    return eyes
  }
  const centre = [1280, 720]
  async function drag(dx, dy, steps = 18) {
    await page.mouse.move(...centre)
    await page.mouse.down()
    await page.mouse.move(centre[0] + dx, centre[1] + dy, { steps })
    await page.mouse.up()
  }
  const site = ['site', 'exterior']
  const view = (key, expected) => async () => {
    await page.keyboard.press(key)
    await page.waitForFunction((e) => {
      const d = document.querySelector('canvas').dataset
      return d.view === e[0] && d.mode === e[1] && d.ready === 'settled'
    }, expected)
    await wait(250)
  }
  const steps = [
    ['剖面', '2', ['section', 'cutaway']],
    ['平面', '3', ['plan', 'cutaway']],
    ['楼层俯瞰', ']', ['floorOrbit', 'cutaway']],
    ['剖切盒', 'box', ['sectionBox', 'cutaway']],
    ['X 光', '4', ['site', 'xray']],
    ['现场', '1', site],
    ['漫游', '5', ['walkthrough', 'cutaway']],
    ['返回现场', '1', site],
  ]
  function checkClearance(label, eyes) {
    if (!eyes.length) throw Error('缺少渲染相机样本')
    let min = Infinity,
      building = Infinity
    for (const [x, y, z] of eyes) {
      min = Math.min(min, y - elevation(x, z))
      // Real L1/L2 architectural outlines with roof overhangs; signed distance to their boxes.
      for (const [x0, x1, y0, y1, z0, z1] of [
        [-16.46, 14.46, -0.3, 4.4, -10.46, 8.46],
        [-12.46, 12.46, 4.4, 8.8, -10.46, 6.46],
      ]) {
        const d = [Math.max(x0 - x, x - x1), Math.max(y0 - y, y - y1), Math.max(z0 - z, z - z1)]
        building = Math.min(
          building,
          Math.hypot(...d.map((u) => Math.max(0, u))) + Math.min(0, Math.max(...d)),
        )
      }
    }
    console.log(label, '地表净距', min.toFixed(3), 'm，楼体净距', building.toFixed(3), 'm')
    if (min < 0.8 - 0.0002 || building <= 0) failures.push(label + ' 相机穿模')
    if (Math.max(...eyes.map((p) => Math.hypot(...p.map((v, i) => v - eyes[0][i])))) < 1)
      failures.push(label + ' 相机未推进')
    return { min, building }
  }
  await measure('现场静止 8 s', () => wait(8000))
  const orbit = await measure('连续环绕', async () => {
    for (let j = 0; j < 5; j++) await drag(123, j === 0 ? -96 : 0)
    await wait(450)
  })
  checkClearance('低位环绕', orbit)
  for (let round = 1; round <= 2; round++)
    for (const [name, key, target] of steps) {
      const action =
        key === 'box'
          ? async () => {
              await page.getByRole('button', { name: '机位与图幅' }).click()
              await page.getByRole('button', { name: '剖切盒', exact: true }).click()
            }
          : key === ']'
            ? async () => {
                await page.getByRole('button', { name: '机位与图幅' }).click()
                await page.getByRole('button', { name: '楼层俯瞰', exact: true }).click()
              }
            : view(key, target)
      await measure(round + '·' + name, action, target)
      if (round === 2 && name === '漫游') {
        const before = (await read('feet')).split(',').map(Number)
        await measure('步行 4 s', async () => {
          await page.keyboard.down('w')
          await wait(4000)
          await page.keyboard.up('w')
        })
        const after = (await read('feet')).split(',').map(Number),
          walked = Math.hypot(after[0] - before[0], after[2] - before[2])
        console.log('步行净位移', walked.toFixed(2), 'm')
        if (walked < 1) failures.push('漫游未实际移动')
      }
    }
  const push = async (x, y) => {
    await page.mouse.move(x, y)
    for (let i = 0; i < 16; i++) {
      await page.mouse.wheel(0, -300)
      await wait(65)
    }
    await wait(550)
  }
  const terrain = await measure('山坡推近', async () => {
    await drag(0, -180)
    await push(2060, 1090)
  })
  if (checkClearance('山坡推近', terrain).min > 1.1) failures.push('山坡滚轮路径未触及地表约束')
  await view('1', site)()
  const station = await measure('站房滚轮', () => push(1280, 860))
  const nearWall = checkClearance('站房滚轮', station)
  if (nearWall.building > 2) failures.push('站房滚轮路径未触及外廓')
  const flight = await measure('贴墙自由飞行', async () => {
    await page.keyboard.down('q')
    await wait(1600)
    await page.keyboard.up('q')
    await page.keyboard.down('w')
    await wait(1400)
    await page.keyboard.up('w')
  })
  if (checkClearance('贴墙自由飞行', flight).building > 1) failures.push('自由飞行未抵达站房外墙')
  // Verify that input takes ownership mid-flight, and that the original destination is not resumed.
  for (const [name, key] of [
    ['滚轮打断', 'wheel'],
    ['按键打断', 'e'],
    ['拖动打断', 'drag'],
  ]) {
    await measure(name, async () => {
      await page.keyboard.press('2')
      await page.waitForSelector('canvas[data-ready=moving]')
      if (key === 'wheel') await page.mouse.wheel(0, -60)
      else if (key === 'drag') {
        await page.mouse.down()
        await page.mouse.move(1300, 860)
        await page.mouse.up()
      } else await page.keyboard.press(key)
      await cycle()
      if ((await read('ready')) !== 'settled') failures.push(name + ' 未交还控制')
      await view('1', site)()
    })
  }
  const flyModes = [
    ['现场飞行', site, null],
    ['剖切盒飞行', ['sectionBox', 'cutaway'], '剖切盒'],
    ['楼层俯瞰飞行', ['floorOrbit', 'cutaway'], '楼层俯瞰'],
    ['X 光飞行', null, '4'],
  ]
  for (const [name, expected, select] of flyModes) {
    await measure(name, async () => {
      if (select === '4') await page.keyboard.press('4')
      else if (select) {
        await page.getByRole('button', { name: '机位与图幅' }).click()
        await page.getByRole('button', { name: select, exact: true }).click()
      }
      await page.waitForFunction((expected) => {
        const d = document.querySelector('canvas').dataset
        return (
          d.ready === 'settled' &&
          (expected ? d.view === expected[0] && d.mode === expected[1] : d.mode === 'xray')
        )
      }, expected)
      const eye = async () => (await read('eye')).split(',').map(Number)
      const a = await eye()
      await page.keyboard.down('e')
      await wait(250)
      await page.keyboard.up('e')
      await cycle()
      const b = await eye()
      await page.keyboard.down('w')
      await wait(250)
      await page.keyboard.up('w')
      await cycle()
      const c = await eye()
      if (b[1] - a[1] < 0.55 || Math.hypot(c[0] - b[0], c[2] - b[2]) < 0.55)
        failures.push(name + ' 升降/平移不足')
    })
  }
  await measure('下潜途中直达平面', async () => {
    await view('1', site)()
    await page.keyboard.press('5')
    await page.waitForSelector('canvas[data-view=walkthrough][data-ready=moving]')
    await wait(350)
    await view('3', ['plan', 'cutaway'])()
    const [x, y, z] = (await read('eye')).split(',').map(Number)
    if (Math.hypot(x, z) > 0.03 || y < 130) failures.push('新视图未取得目标机位')
  })
  for (const number of [1, 2, 3, 4, 5]) {
    const name = 'shot-0' + number
    await measure(name, async () => {
      const previous = await read('revision')
      await page.getByRole('button', { name: '机位与图幅' }).click()
      await page.getByRole('combobox', { name: '固定摄影机位' }).selectOption(name)
      await page.waitForFunction((revision) => {
        const c = document.querySelector('canvas').dataset
        return c.revision !== revision && c.ready === 'settled'
      }, previous)
    })
  }
  const total = await page.evaluate(() => window.surveyPerf.links - window.surveyPerf.coldLinks)
  console.log('就绪后全程链接', total)
  if (total !== 0) failures.push('就绪后全程链接 ' + total)
  const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve))
  await cdp.send('Tracing.end')
  await done
  const main = events.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
  for (const row of reports) {
    const start = events.find((e) => e.name === 'ars-start-' + row.id),
      end = events.find((e) => e.name === 'ars-end-' + row.id)
    if (!start || !end || !main.some((e) => e.pid === start.pid && e.tid === start.tid))
      throw Error('无法定位渲染主线程采样区间')
    const tasks = events.filter(
      (e) =>
        ['RunTask', 'ThreadControllerImpl::RunTask'].includes(e.name) &&
        e.pid === start.pid &&
        e.tid === start.tid &&
        e.dur &&
        e.ts < end.ts &&
        e.ts + e.dur > start.ts,
    )
    if (!tasks.length)
      throw Error(
        '未采集到主线程 RunTask ' +
          [
            ...new Set(
              events.filter((e) => e.pid === start.pid && e.tid === start.tid && e.dur).map((e) => e.name),
            ),
          ]
            .slice(0, 60)
            .join('/'),
      )
    const longest = tasks.reduce((a, b) => (a.dur > b.dur ? a : b))
    row.task = longest.dur / 1000
    if (row.draws > 400 || row.triangles > 4000000) failures.push(row.label + ' 超出几何绘制预算')
    if (['现场静止 8 s', '步行 4 s', '连续环绕'].includes(row.label) && (row.fps < 58 || row.p95 > 20))
      failures.push(row.label + ' 未达到稳态帧率预算')
    if (row.task > 50) failures.push(row.label + ' 主线程 ' + row.task.toFixed(2) + ' ms')
    console.log(
      [
        row.label,
        row.fps.toFixed(1),
        row.p95.toFixed(1),
        row.task.toFixed(2),
        row.maxFrame.toFixed(1),
        row.links,
        row.widths.join('/'),
        row.draws,
        row.triangles,
      ].join(' | '),
    )
  }
  console.log('浏览器错误及警告', errors.length)
  if (errors.length || failures.length) throw Error([...failures, ...errors].join('\n'))
} finally {
  await browser?.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
