import { exerciseFortress } from './perf-fortress.mjs'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { installTextureAudit } from './texture-storage-audit.mjs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const signed = { ready: 2991.3, peak: 366, bytes: 2528888 }
const viewport = { width: 1728, height: 1117 }
const deviceScaleFactor = 1.5
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
    viewport,
    deviceScaleFactor,
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
      if (perf.ready && c) perf.minDpr = Math.min(perf.minDpr, c.width / c.clientWidth)
      if (perf.running && c) {
        const data = c.dataset
        perf.frames.push([t - perf.prev, c.width, data.eye, Number(data.calls), Number(data.triangles),
          data.tour === 'opening' ? data.tourCue : undefined])
      }
      perf.prev = t
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    window.addEventListener('ars-ready', () => {
      perf.ready = performance.now()
      const canvas = document.querySelector('canvas')
      perf.minDpr = canvas.width / canvas.clientWidth
      perf.coldLinks = perf.links
    })
  }, process.argv.includes('--diagnose'))
  if (process.argv.includes('--diagnose'))
    page.on('console', (m) => {
      if (m.type() === 'info') console.log(m.text())
    })
  page.setDefaultTimeout(30000)
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port
  // Start tracing before navigation so profiler startup does not interrupt the ready scene.
  const cdp = await page.context().newCDPSession(page)
  cdp.on('Tracing.dataCollected', ({ value }) => {
    for (const e of value) if (e.name === 'thread_name' || e.name.endsWith('RunTask') || e.name.startsWith('ars-') || e.dur >= 10000) events.push(e)
  })
  await cdp.send('Tracing.start', {
    // All top-level renderer tasks and User Timing boundaries remain in both modes.
    // Request nested DevTools events only when diagnosing the work inside a long task.
    categories: process.argv.includes('--diagnose')
      ? 'toplevel,disabled-by-default-devtools.timeline,devtools.timeline,blink.user_timing'
      : 'toplevel,blink.user_timing',
    transferMode: 'ReportEvents',
  })
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
      transferred: performance.getEntriesByType('resource').reduce((n, r) => n + r.transferSize, 0),
    }
  })
  console.log('首屏', JSON.stringify(env))
  if (!/ANGLE.*Metal.*Apple M1 Pro/i.test(env.gpu) || /SwiftShader|llvmpipe|software/i.test(env.gpu))
    throw Error('实测需要 Apple M1 Pro / Chrome ANGLE Metal')
  if (!(env.ready <= 10000)) failures.push('首屏 GPU 交互就绪超过 10 s')
  if (env.assetState.aoOutput !== 'composer') failures.push('环境遮蔽合成未写入 HDR 输出目标')
  const textureBytes = Number(env.assetState.pilotTextureBytes)
  const environmentBytes = Number(env.assetState.interiorEnvironmentBytes)
  if (!(textureBytes > 0 && environmentBytes > 0 && textureBytes + environmentBytes <= 1_000_000_000))
    failures.push('内容纹理与环境图计量缺失或超过 1 GB')
  if (
    env.assetState.pilotFinishes !== '4' ||
    env.assetState.pilotArt !== '1' ||
    env.assetState.pilotChair !== 'glb' ||
    env.assetState.pilotDomestic !== '7'
  )
    failures.push('首屏资源虽已请求，但未完整安装')
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
    if (label === 'M5 开场全程') {
      const cues = new Map()
      for (const [dt, , , , , cue] of frames) {
        if (cue == null) continue
        const sample = cues.get(cue) ?? { frames: 0, ms: 0 }
        sample.frames++
        sample.ms += dt
        cues.set(cue, sample)
      }
      console.log('开场分镜 FPS', [...cues].map(([cue, s]) => cue + '=' + (1000 * s.frames / s.ms).toFixed(1)).join(' '))
    }
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
  const centre = [viewport.width / 2, viewport.height / 2]
  const position = (x, y) => [x * viewport.width / 2560, y * viewport.height / 1440]
  async function drag(dx, dy, steps = 18) {
    await page.mouse.move(...centre)
    await page.mouse.down()
    await page.mouse.move(centre[0] + dx * viewport.height / 1440, centre[1] + dy * viewport.height / 1440, { steps })
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
    ['现场', '1', site],
    ['漫游', '4', ['walkthrough', 'cutaway']],
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
    // Sample sustained pointer motion for approximately eight seconds at Retina/60 Hz.
    // Retain the initial audio unlock, all five press/release pairs and the low orbit path.
    for (let j = 0; j < 5; j++) await drag(123, j === 0 ? -96 : 0, 96)
    await wait(450)
  })
  checkClearance('低位环绕', orbit)
  for (let round = 1; round <= 2; round++)
    for (const [name, key, target] of steps) {
      const action = key === ']'
        ? async () => {
            await view('1', site)()
            await page.getByRole('button', { name: /^B2 / }).click()
          } : view(key, target)
      await measure(round + '·' + name, action, target)
      if (round === 2 && name === '漫游') {
        const before = (await read('feet')).split(',').map(Number)
        await measure('步行 4 s', async () => {
          await page.keyboard.down('a')
          await wait(4000)
          await page.keyboard.up('a')
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
    await push(...position(2060, 1090))
  })
  if (checkClearance('山坡推近', terrain).min > 1.1) failures.push('山坡滚轮路径未触及地表约束')
  await view('1', site)()
  const station = await measure('站房滚轮', () => push(...position(1280, 860)))
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
  const moveAndDrag = await measure('3D 移动后拖拽中心', async () => {
    await view('1', site)()
    // Fly closer toward the station with W, then left-drag to orbit around it.
    await page.keyboard.down('w')
    await wait(1200)
    await page.keyboard.up('w')
    await cycle()
    const beforeDrag = (await read('eye')).split(',').map(Number)
    await drag(160, 0, 24)
    await wait(300)
    const afterDrag = (await read('eye')).split(',').map(Number)
    const beforeDist = Math.hypot(beforeDrag[0], beforeDrag[2])
    const afterDist = Math.hypot(afterDrag[0], afterDrag[2])
    // Orbiting after flying close must stay centered near the station rather than swinging on a 100 m ghost radius.
    if (Math.abs(afterDist - beforeDist) > 35 || afterDist > beforeDist + 25)
      failures.push(`移动后拖拽中心漂移 before=${beforeDist.toFixed(1)} after=${afterDist.toFixed(1)}`)
  })
  checkClearance('3D 移动后拖拽中心', moveAndDrag)
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
        await page.mouse.move(...position(1300, 860))
        await page.mouse.up()
      } else await page.keyboard.press(key)
      await cycle()
      if ((await read('ready')) !== 'settled') failures.push(name + ' 未交还控制')
      await view('1', site)()
    })
  }
  await measure('漫游转场中切回平面', async () => {
    await view('1', site)()
    await page.keyboard.press('4')
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
      await page.getByRole('button', { name: '房间直达' }).click()
      await page.getByRole('combobox', { name: '固定摄影机位' }).selectOption(name)
      await page.waitForFunction((revision) => {
        const c = document.querySelector('canvas').dataset
        return c.revision !== revision && c.ready === 'settled'
      }, previous)
    })
  }
  // Exercise the M2 selection and authored camera route on the same warmed WebGL context.
  for (const room of ['l2_observatory', 'l1_garage', 'b1_workshop', 'b2_commons', 'b3_aquaponics', 'b4_switchgear']) {
    await measure('室内 ' + room, async () => {
      await view('1', site)()
      await page.getByRole('button', { name: '房间直达' }).click()
      await page.getByLabel('房间索引').selectOption(room)
      await page.waitForSelector('canvas[data-view=walkthrough][data-ready=settled]')
      await wait(250)
    })
    if ((await read('interior-environment')) !== room) failures.push(room + ' 室内反射不符')
  }
  async function selectPilot(name) {
    const before = await read('revision')
    await page.getByRole('button', { name: '房间直达' }).click()
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
    await measure('室内拖动 ' + name, async () => {
      const before = await read('feet')
      await drag(210, 25, 36)
      await drag(-210, -25, 36)
      if (await read('feet') !== before) throw Error('转头改变了站立位置')
    })
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
  const button = (name) => page.getByRole('button', { name, exact: true })
  await exerciseFortress(page, measure)
  await measure('M5 时间轴拖动与延时', async () => {
    const slider = page.getByRole('slider', { name: '24 小时时间轴' })
    const box = await slider.boundingBox()
    await page.mouse.move(box.x + 5, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 32 })
    await page.mouse.up()
    await slider.press('End')
    await slider.evaluate(e => e.blur())
    if (await slider.inputValue() !== '1439') throw Error('时间轴未到午夜前')
    await button('延时播放').click()
    await page.waitForFunction(() => Number(document.querySelector('.day-clock input').value) < 10)
    await button('延时播放').click()
  })
  await measure('M5 真实房间反射切换', async () => {
    if (Number(await read('probe-count')) < 16) throw Error('缺少房间反射')
    for (const [name, room] of [['bedroom', 'b2-single-1'], ['commons', 'b2_commons'], ['bath', 'b2_bath_laundry']]) {
      await selectPilot(name)
      if (await read('active-shadow-spots') !== '2') throw Error(room + ' 的双投影光源未同时点亮')
      await page.waitForFunction(room => {
        const d = document.querySelector('canvas').dataset
        return d.interiorEnvironment === room && Number(d.reflectionMix) === 1
      }, room)
    }
  })
  await measure('M5 照片模式与画幅', async () => {
    await button('拍照').click()
    await page.waitForSelector('canvas[data-photo-mode=on]')
    for (const frame of ['4:5', '2.39:1', '16:9']) await page.getByLabel('取景画幅').selectOption(frame)
    await page.getByLabel('垂直校正').uncheck()
    await page.getByLabel('垂直校正').check()
    await page.keyboard.press('Tab') // Leave the checkbox before using the global HUD shortcut.
    await page.keyboard.press('h')
    await page.locator('.hud').waitFor({ state: 'hidden' })
    await page.keyboard.press('h')
    await button('拍照').click()
    await page.waitForSelector('canvas[data-photo-mode=off]')
  })
  await measure('M5 开场全程', async () => {
    await page.keyboard.press('o')
    for (let cue = 0; cue < 9; cue++)
      await page.waitForSelector('canvas[data-tour=opening][data-tour-cue="' + cue + '"]')
    await page.waitForSelector('canvas[data-tour=idle][data-view=site][data-ready=settled]')
  })
  await measure('M5 开场键盘接管', async () => {
    await page.keyboard.press('o')
    await page.waitForSelector('canvas[data-tour=opening]')
    await page.keyboard.press('w')
    await page.waitForSelector('canvas[data-tour=idle]')
  })
  async function checkDpr() {
    const min = await page.evaluate(() => window.surveyPerf.minDpr)
    console.log('自动画质最低 DPR', min, '目标', deviceScaleFactor)
    if (!(min >= deviceScaleFactor - 0.0001)) failures.push('自动画质在验收期间降低 DPR')
  }
  await checkDpr()
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
    if (row.draws > 600 || row.triangles > 8_000_000) console.warn(row.label, '几何规模提醒', row.draws, row.triangles)
    if (
      (['现场静止 8 s', '步行 4 s', '连续环绕'].includes(row.label) ||
        row.label.startsWith('样板稳态') ||
        row.label === '堡垒封锁稳态' ||
        row.label === 'M4 搬运全景稳态' || row.label === 'M5 开场全程') &&
      (row.fps < 59.4 || row.p95 > 18)
    )
      failures.push(row.label + ' 未达到稳态帧率预算')
    if (row.task > 50) {
      const detail = events.filter(e => e !== longest && e.pid === longest.pid && e.tid === longest.tid &&
        e.dur >= 10000 && e.ts >= longest.ts && e.ts + e.dur <= longest.ts + longest.dur)
        .sort((a, b) => b.dur - a.dur).slice(0, 6)
        .map(e => e.name + ' ' + (e.dur / 1000).toFixed(1) + ' ms').join(', ')
      failures.push(row.label + ' 主线程 ' + row.task.toFixed(2) + ' ms' + (detail ? '（' + detail + '）' : ''))
    }
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
  if (peak > 400) failures.push('M6 绘制调用峰值超过 400：' + peak)
  const download = env.assets.reduce((sum, a) => sum + a.bytes, 0)
  console.log('首屏资源总传输 B', env.transferred, '内容纹理 B', textureBytes, '环境图 B', environmentBytes)
  console.log(
    '全程峰值绘制',
    peak,
    '较 M4 增量',
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
  // Track allocations on the full-resolution second pass without instrumenting binds during the timing trace.
  await page.addInitScript(installTextureAudit)
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
  await button('拍照').click()
  await page.waitForSelector('canvas[data-photo-mode=on]')
  const storageBefore = await page.evaluate(() => window.arsTextureAudit())
  const downloadReady = page.waitForEvent('download', { timeout: 120000 })
  await button('导出 PNG').click()
  const png = await readFile(await (await downloadReady).path())
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
  const photoStatus = await page.locator('.photo-controls output').innerText()
  if (!png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
      width !== viewport.width * deviceScaleFactor * 2 || height !== Math.round(width * 9 / 16) || !photoStatus.includes('16 帧'))
    failures.push('照片导出未得到原画布两倍的 16 帧 PNG')
  const storage = await page.evaluate(() => window.arsTextureAudit())
  const exportLinks = await page.evaluate(() => window.surveyPerf.links) - late.links
  console.log('Retina 照片', JSON.stringify({ width, height, bytes: png.length, links: exportLinks, status: photoStatus }))
  console.log('WebGL 存储', JSON.stringify(storage))
  if (storage.unknownFormats.length || !storage.texture.peakBytes || storage.texture.peakBytes > 1_000_000_000)
    failures.push('全部 WebGL 纹理峰值超过 1 GB 或格式计量不完整')
  if (storage.liveBytes > storageBefore.liveBytes || exportLinks !== 0)
    failures.push('导出后离屏资源未释放或新增了程序链接')
  await checkDpr()
  console.log('浏览器错误及警告', errors.length)
  if (errors.length || failures.length) throw Error([...failures, ...errors].join('\n'))
} finally {
  await browser?.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
