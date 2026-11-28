import { chromium } from 'playwright'
import { preview } from 'vite'
import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const signed = { ready: 3017.8, peak: 367, bytes: 2528888 }
// Enumerate deployed assets independently of the loader. A silently missing fetch is a failure.
async function publishedAssets(directory, url = '/assets/') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await publishedAssets(path, url + entry.name + '/')))
    else if (/\.(?:glb|webp)$/.test(entry.name)) files.push([url + entry.name, (await stat(path)).size])
  }
  return files
}
const published = new Map(await publishedAssets(join(root, 'dist/assets')))
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
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
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
      assets: performance
        .getEntriesByType('resource')
        .filter((e) => /\.(webp|glb)(?:\?|$)/.test(e.name))
        .map((e) => ({ path: new URL(e.name).pathname, bytes: e.encodedBodySize, end: e.responseEnd })),
      assetState: { ...document.querySelector('canvas').dataset },
      paint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      agent: navigator.userAgent,
    }
  })
  console.log('首屏', JSON.stringify(env))
  if (!/ANGLE.*Metal/i.test(env.gpu) || /SwiftShader|llvmpipe|software/i.test(env.gpu))
    throw Error('实测需要硬件 ANGLE Metal')
  if (!(env.ready <= 8000 && env.paint <= 3000)) failures.push('首屏描线/材质时间超限')
  if (env.ready - signed.ready > 500) failures.push('GPU 就绪较 M3 增加超过 500 ms')
  const textureBytes = Number(env.assetState.pilotTextureBytes)
  const environmentBytes = Number(env.assetState.interiorEnvironmentBytes)
  if (!(textureBytes > 0 && environmentBytes > 0 && textureBytes + environmentBytes <= 64000000))
    failures.push('内容纹理与室内反射不符合 64 MB 预算')
  if (
    env.assetState.pilotFinishes !== '4' ||
    env.assetState.pilotArt !== '1' ||
    env.assetState.pilotChair !== 'glb' ||
    env.assetState.pilotDomestic !== '7'
  )
    failures.push('首屏资源虽已请求，但未完整安装')
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
  // Exercise the M2 selection and authored camera route on the same warmed WebGL context.
  for (const [room, reflection] of [
    ['l2_observatory', 'station'],
    ['l1_garage', 'station'],
    ['b1_workshop', 'service'],
    ['b2_commons', 'living'],
    ['b3_aquaponics', 'farm'],
    ['b4_switchgear', 'service'],
  ]) {
    await measure('室内 ' + room, async () => {
      await view('1', site)()
      await page.getByRole('button', { name: '机位与图幅' }).click()
      await page.getByLabel('房间索引').selectOption(room)
      await page
        .getByLabel('房间数据表')
        .getByRole('button', { name: /进入漫游/ })
        .click()
      await page.waitForSelector('canvas[data-view=walkthrough][data-ready=settled]')
      await wait(250)
    })
    if ((await read('interior-environment')) !== reflection) failures.push(room + ' 室内反射不符')
  }
  async function selectPilot(name) {
    const before = await read('revision')
    await page.getByRole('button', { name: '机位与图幅' }).click()
    await page.getByRole('combobox', { name: '固定摄影机位' }).selectOption('pilot-' + name)
    await page.waitForFunction((revision) => {
      const d = document.querySelector('canvas').dataset
      return d.revision !== revision && d.ready === 'settled' && d.view === 'walkthrough'
    }, before)
    await cycle()
  }
  for (const name of ['bedroom', 'commons', 'bath']) {
    await measure('漫游进入样板 ' + name, () => selectPilot(name))
    await measure('样板稳态 ' + name, () => wait(2500))
  }
  await measure('切房阴影更新', async () => {
    for (const [name, room] of [
      ['bedroom', 'b2-single-1'],
      ['commons', 'b2_commons'],
      ['bath', 'b2_bath_laundry'],
    ]) {
      const previous = Number(await read('interior-shadow-updates'))
      const csm = await read('csm-shadow-updates')
      await selectPilot(name)
      // A nearby leaf may still be sliding after the camera settles.
      await wait(750)
      const next = Number(await read('interior-shadow-updates'))
      if (!Number.isFinite(next) || next <= previous || room !== (await read('interior-shadow-room')))
        failures.push('未实际刷新房间阴影 ' + name)
      if (csm === null || csm !== (await read('csm-shadow-updates')))
        failures.push('切房时 CSM 状态异常 ' + name)
      await wait(300)
      if (next !== Number(await read('interior-shadow-updates')))
        failures.push('静止时重复刷新室内阴影 ' + name)
    }
  })
  await view('3', ['plan', 'cutaway'])()
  const valveTable = page.getByRole('region', { name: '阀门数据表' })
  const traceTable = page.getByRole('region', { name: '水路追踪' })
  await measure('M3 图例与夹层', async () => {
    const legend = page.locator('.legend')
    for (const [system, label] of [
      ['power', '强电'],
      ['data', '弱电与智控'],
      ['water', '给排水'],
      ['air', '三防新风'],
      ['freight', '重载物流'],
      ['structure', '结构与防护'],
    ]) {
      const check = legend.getByRole('checkbox', { name: label, exact: true })
      for (const enabled of [false, true]) {
        await check.setChecked(enabled)
        await page.waitForFunction(
          ([id, on]) => {
            const d = document.querySelector('canvas').dataset
            return d.view === 'plan' && d.mode === 'cutaway' && d.mepLayers?.split(',').includes(id) === on
          },
          [system, enabled],
        )
      }
    }
    const plenum = legend.getByRole('checkbox', { name: /机电夹层/ })
    await plenum.uncheck()
    await page.waitForSelector('canvas[data-mep-plenum=off]')
    await plenum.check()
    await page.waitForSelector('canvas[data-mep-plenum=on]')
  })
  // Move focus out of the form using the actual view control.
  await page.getByRole('button', { name: /^漫游\s*5$/ }).click()
  await page.waitForSelector('canvas[data-view=walkthrough][data-ready=settled]')
  await measure('M3 漫游 Alt 透镜', async () => {
    await page.mouse.move(1030, 610)
    await page.keyboard.down('Alt')
    await page.waitForSelector('canvas[data-mep-lens=on]')
    const ring = page.locator('#mep-lens-ring')
    const bounds = await ring.boundingBox()
    if (!bounds || Math.hypot(bounds.x + bounds.width / 2 - 1030, bounds.y + bounds.height / 2 - 610) > 2)
      throw Error('透镜准环未对准画布中的鼠标')
    await wait(2200)
    await page.keyboard.up('Alt')
    await ring.waitFor({ state: 'hidden' })
    await page.waitForSelector('canvas[data-mep-lens=off]')
  })
  await measure('M3 走廊仰视夹层', async () => {
    await drag(0, -285)
    await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.plenumReveal) > 0.7)
    await wait(2200)
    await drag(0, 285)
    await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.plenumReveal) < 0.02)
  })
  await page.getByRole('button', { name: '机位与图幅' }).click()
  await page.getByRole('combobox', { name: '固定摄影机位' }).selectOption('shot-04')
  await page.waitForSelector('canvas[data-view=site][data-mode=xray][data-ready=settled]')
  // Ask only for projected hit locations. Selection and highlighting must result from actual mouse input.
  const targets = await page.locator('canvas').evaluate((canvas) => {
    let found = []
    canvas.dispatchEvent(
      new CustomEvent('ars-mep-targets', {
        detail: {
          callback: (items) => {
            found = items
          },
        },
      }),
    )
    return found.filter(({ x, y }) => document.elementFromPoint(x, y) === canvas)
  })
  for (const kind of ['pipe', 'valve'])
    if (!targets.some((t) => t.kind === kind)) throw Error('X 光视口未找到可拾取的 ' + kind)
  await measure('M3 点水管追踪', async () => {
    const hit = targets.find((t) => t.kind === 'pipe')
    await page.mouse.click(hit.x, hit.y)
    await page.mouse.move(centre[0], 100)
    await traceTable.waitFor()
    if ((await traceTable.getAttribute('data-edge')) !== hit.id || Number(await read('mep-trace-count')) < 2)
      throw Error('点击的管段和实际高亮不符')
    await wait(400)
  })
  await measure('M3 悬停阀门', async () => {
    const hit = targets.find((t) => t.kind === 'valve')
    await page.mouse.move(hit.x, hit.y)
    await valveTable.waitFor()
    if ((await valveTable.getAttribute('data-valve')) !== hit.id || !(await read('mep-affected-rooms')))
      throw Error('阀牌或下游房间描红缺失')
    await wait(400)
    await page.mouse.move(centre[0], 100)
    await valveTable.waitFor({ state: 'hidden' })
  })
  await view('1', site)()
  if (await read('mep-layers')) failures.push('现场室外仍绘制地下管网')
  // Drive the same visible controls the operator uses. Keep the whole 30-second sequence inside Chrome Trace.
  const button = (name) => page.getByRole('button', { name, exact: true })
  const scenario = page.getByLabel('工况', { exact: true })
  await measure('M4 打开工程体检', () => button('工程体检').click())
  for (const id of ['cryo', 'bio', 'normal']) {
    await measure('M4 切工况 ' + id, async () => {
      await scenario.selectOption(id)
      await page.waitForSelector('.hud[data-scenario="' + id + '"]')
      await wait(1050)
    })
  }
  await measure('M4 入住 10 → 14', async () => {
    const before = await page.locator('[data-diagnostic=oxygen] strong').textContent()
    const slider = page.getByRole('slider', { name: '入住人数' })
    const bounds = await slider.boundingBox()
    await page.mouse.move(bounds.x + (bounds.width * 5) / 9, bounds.y + bounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width - 1, bounds.y + bounds.height / 2, { steps: 12 })
    await page.mouse.up()
    await page.waitForSelector('.hud[data-people="14"]')
    const after = await page.locator('[data-diagnostic=oxygen] strong').textContent()
    if (before === after) throw Error('人数已改变，供氧余量未更新')
  })
  await measure('M4 尘埃封锁 30 s', async () => {
    await scenario.selectOption('fallout')
    await page.waitForSelector('.hud[data-scenario=fallout][data-lockdown=running]')
    await button('跟拍封锁编排').click()
    const started = performance.now()
    await page.waitForSelector('.hud[data-lockdown=sealed]', { timeout: 36000 })
    if (performance.now() - started < 29000) throw Error('封锁在第 30 秒之前完成')
    if (Number(await read('decon-pressure-pa')) <= 0) throw Error('B1 压差未升高')
    await page.waitForSelector('canvas[data-view=walkthrough][data-ready=settled]')
    const [, level] = (await read('feet')).split(',').map(Number)
    if (Math.abs(level + 10.2) > 0.1) throw Error('封锁跟拍没有抵达 B1')
    await page.waitForSelector(
      'canvas[data-lighting-circuit=emergency][data-command-screen^="fallout/14/30/"]',
    )
    if (
      !(await page
        .locator('.condition')
        .textContent()
        .then((t) => t.includes('封锁 · 第 1 天')))
    )
      throw Error('全密闭工程图签未更新')
  })
  await measure('M4 封锁稳态', () => wait(2500))
  await measure('M4 B2 中控室', async () => {
    await button('进入 B2 中控室').click()
    await page.waitForSelector('canvas[data-view=walkthrough][data-ready=settled]')
    await wait(700)
  })
  await measure('M4 模拟隔离与接管', async () => {
    await button('模拟隔离检修').click()
    await page.getByLabel('检修目标').selectOption('HV-B2-001')
    await button('隔离所选目标').click()
    await page.waitForSelector('.hud[data-isolation="HV-B2-001"]')
    await page.waitForSelector('canvas[data-ready=settled]')
    await wait(400)
    const paths = (await read('maintenance-routes')).split('/').map(Number)
    if (paths.length !== 3 || !paths.every((n) => n > 0) || Number(await read('maintenance-segments')) < 3)
      throw Error('隔离、接管与搬运路径未同时进入 3D 图层')
    const report = page.locator('.maintenance-result')
    await report.waitFor()
    if (!(await report.innerText()).includes('HV-B2-001')) throw Error('检修表缺少隔离段')
    await button('查看全程搬运').click()
    await page.waitForSelector('canvas[data-view=sectionBox][data-mode=xray][data-ready=settled]')
    if (
      (await read('route-overview')) !== 'true' ||
      (await read('mep-layers')) ||
      Number(await read('maintenance-segments')) < 3 ||
      (await page.getByLabel('剖切面位置').isVisible())
    )
      throw Error('全程图的检修路线、背景管线或剖切控制状态错误')
  })
  await measure('M4 搬运全景稳态', () => wait(2500))
  await measure('M4 解除隔离', async () => {
    await button('结束隔离检修').click()
    await page.waitForSelector('.hud[data-isolation=""]')
  })
  await measure('M4 重播、快进与复位', async () => {
    await button('重播封锁').click()
    await page.waitForSelector('.hud[data-lockdown=running]')
    await button('快进封锁').click()
    await page.waitForSelector('.hud[data-lockdown=sealed]')
    await button('重置封锁').click()
    await page.waitForSelector('.hud[data-scenario=normal][data-lockdown=open]')
    await page.waitForSelector('canvas[data-lighting-circuit=normal]')
    await button('关闭工程面板').click()
  })
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
    if (row.draws > 392 || row.triangles > 4000000) failures.push(row.label + ' 超出几何绘制预算')
    if (
      (['现场静止 8 s', '步行 4 s', '连续环绕'].includes(row.label) ||
        row.label.startsWith('样板稳态') ||
        row.label === 'M4 封锁稳态' ||
        row.label === 'M4 搬运全景稳态') &&
      (row.fps < 58 || row.p95 > 20)
    )
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
  const peak = Math.max(...reports.map((r) => r.draws))
  const download = env.assets.reduce((sum, a) => sum + a.bytes, 0)
  if (download - signed.bytes > 4000000) failures.push('新增资产下载超过 4 MB')
  console.log(
    '全程峰值绘制',
    peak,
    '较 M3 增量',
    peak - signed.peak,
    '首屏 GPU 就绪变化 ms',
    (env.ready - signed.ready).toFixed(1),
    '资产总下载 / 本轮增量 B',
    download,
    download - signed.bytes,
    '内容纹理及室内反射 B',
    textureBytes + environmentBytes,
  )
  const loaded = env.marks.filter(([name]) => name === 'ars-open-pilot-assets')
  const start = env.marks.find(([name]) => name === 'ars-open-scene')
  if (loaded.length !== 1 || !start || loaded[0][1] >= start[1]) failures.push('资产未在预编译前单次完成')
  if (
    env.assets.length !== published.size ||
    new Set(env.assets.map((a) => a.path)).size !== published.size ||
    env.assets.some((a) => !a.bytes || published.get(a.path) !== a.bytes || a.end > start?.[1])
  )
    failures.push('启动资产下载缺失或重复')

  // A new WebGL context deliberately opens with the procedural chair. Swap the real array and mesh
  // while the commons is on screen, after the ordinary warm-up and without another compile survey.
  await page.goto(origin + '/?pilot=r3&pilotLate=1', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(
    'canvas[data-rendered=true][data-pilot-chair=procedural][data-pilot-texture=procedural]',
  )
  await selectPilot('commons')
  await wait(500)
  const proceduralTriangles = Number(await read('triangles'))
  const beforeLate = await page.evaluate(() => window.surveyPerf.links)
  await page.evaluate(() => window.dispatchEvent(new Event('ars-load-late-assets')))
  await page.waitForSelector(
    'canvas[data-pilot-chair=glb][data-pilot-finishes="4"][data-pilot-domestic="7"][data-pilot-art="1"]',
  )
  await cycle()
  await cycle()
  const glbTriangles = Number(await read('triangles'))
  for (const name of ['bedroom', 'bath']) await selectPilot(name)
  const late = await page.evaluate(() => ({
    links: window.surveyPerf.links,
    ready: window.surveyPerf.coldLinks,
  }))
  console.log(
    '迟到资产，挂载后新增链接',
    late.links - beforeLate,
    '就绪后新增链接',
    late.links - late.ready,
    '共餐厅三角形',
    proceduralTriangles,
    '→',
    glbTriangles,
  )
  if (glbTriangles <= proceduralTriangles) failures.push('迟到餐椅未进入实际绘制批次')
  if (late.links !== beforeLate || late.links !== late.ready) failures.push('迟到资产触发新增链接')
  console.log('浏览器错误及警告', errors.length)
  if (errors.length || failures.length) throw Error([...failures, ...errors].join('\n'))
} finally {
  await browser?.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
