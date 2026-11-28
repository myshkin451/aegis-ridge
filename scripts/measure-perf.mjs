import { chromium } from 'playwright'
import { preview } from 'vite'
import { ride } from './perf-fortress.mjs'
import { installTextureAudit } from './texture-storage-audit.mjs'

const viewport = { width: 1728, height: 1117 }
const deviceScaleFactor = 1.5
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
let browser
try {
  browser = await chromium.launch({ channel: process.env.CHROME_PATH ? undefined : 'chrome',
    executablePath: process.env.CHROME_PATH, args: ['--use-angle=metal'] })
  const page = await browser.newPage({ viewport, deviceScaleFactor, reducedMotion: 'no-preference' })
  const failures = [], events = [], rows = []
  page.on('console', m => { if (['warning','error'].includes(m.type())) failures.push(m.type() + ' ' + m.text()) })
  page.on('pageerror', e => failures.push(e.message))
  page.on('response', r => { if (r.status() >= 400) failures.push(r.status() + ' ' + r.url()) })
  page.on('requestfailed', r => failures.push(r.url() + ' ' + r.failure()?.errorText))
  await page.addInitScript(() => {
    sessionStorage.setItem('ars-keys','1')
    const s = window.surveyPerf = { links: 0, readyLinks: null, ready: null, minDpr: Infinity, samples: null }
    const gl = WebGL2RenderingContext.prototype, link = gl.linkProgram
    gl.linkProgram = function (program) { s.links++; return link.call(this, program) }
    let lastTime
    function frame(t) {
      if (s.ready) {
        const c = document.querySelector('canvas')
        s.minDpr = Math.min(s.minDpr, c.width / c.clientWidth)
        if (s.samples && lastTime) s.samples.push([t-lastTime, +c.dataset.calls, +c.dataset.triangles])
      }
      lastTime = t
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    window.addEventListener('ars-ready', () => { s.ready = performance.now(); s.readyLinks = s.links }, { once: true })
  })
  const cdp = await page.context().newCDPSession(page)
  cdp.on('Tracing.dataCollected', ({value}) => {
    for (const e of value) if (e.name.endsWith('RunTask') || e.name.startsWith('fortress-') || e.name === 'thread_name') events.push(e)
  })
  await cdp.send('Tracing.start', { categories: 'toplevel,blink.user_timing', transferMode: 'ReportEvents' })
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port)
  await page.waitForSelector('canvas[data-rendered=true][data-ready=settled]')
  const env = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2')
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return { gpu: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), readyMs: window.surveyPerf.ready,
      startupLinks: window.surveyPerf.readyLinks, agent: navigator.userAgent }
  })
  console.log(JSON.stringify(env))
  if (!/ANGLE.*Metal.*Apple M1 Pro/i.test(env.gpu)) throw Error('需要 Apple M1 Pro / Chrome ANGLE Metal')
  if (!(env.readyMs > 0 && env.readyMs <= 10000)) failures.push('首屏就绪超过 10 秒')
  const wait = ms => page.waitForTimeout(ms)
  async function measure(label, action, steady = false) {
    const id = rows.length
    await page.evaluate(id => { window.surveyPerf.samples = []; performance.mark('fortress-start-' + id) }, id)
    await action()
    const samples = await page.evaluate(async id => {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      performance.mark('fortress-end-' + id)
      const data = window.surveyPerf.samples
      window.surveyPerf.samples = null
      return data
    }, id)
    const ms = samples.map(s => s[0]).sort((a,b) => a-b)
    if (!ms.length) throw Error('采样为空 ' + label)
    const fps = ms.length * 1000 / ms.reduce((a,b) => a+b)
    const p95 = ms[Math.ceil(ms.length*.95)-1]
    rows.push({ id, label, fps, p95, draws: Math.max(...samples.map(s => s[1])),
      triangles: Math.max(...samples.map(s => s[2])) })
    if (steady && (fps < 59.4 || p95 > 18)) failures.push(label + ' 稳态帧率预算未通过')
    console.log(label, fps.toFixed(1), 'FPS', p95.toFixed(1), 'ms P95')
  }
  const canvas = page.locator('canvas').first()
  async function drag(dx, dy) {
    const x = viewport.width / 2, y = viewport.height * .56
    await page.mouse.move(x,y)
    await page.mouse.down()
    try { await page.mouse.move(x+dx,y+dy,{steps:64}) } finally { await page.mouse.up() }
  }
  async function view(key, state) {
    await page.keyboard.press(key)
    await page.waitForSelector('canvas[data-view=' + state + '][data-ready=settled]')
  }
  async function shot(id) {
    const rev = await canvas.getAttribute('data-revision')
    await page.getByRole('button', { name: '房间直达', exact: true }).click()
    await page.getByLabel('固定摄影机位').selectOption(id)
    await page.waitForFunction(prev => {
      const d = document.querySelector('canvas').dataset
      return d.revision !== prev && d.view === 'walkthrough' && d.photoRevision === d.revision && d.ready === 'settled'
    }, rev)
  }
  await measure('外景静止', () => wait(4000), true)
  await measure('外景环绕', async () => { for (let i=0; i<3; i++) await drag(105, i ? 0 : -45) }, true)
  await measure('剖面', () => view('2','section'))
  await measure('平面', () => view('3','plan'))
  await measure('状态与全面封锁', async () => {
    await view('1','site')
    await page.getByRole('button',{name:'堡垒状态',exact:true}).click()
    await page.getByRole('button',{name:'一键全面封锁'}).click()
    await page.waitForSelector('.hud[data-lockdown=running]')
    await page.waitForSelector('.hud[data-lockdown=sealed]',{timeout:36000})
    await page.getByText('电池独立供电',{exact:true}).waitFor()
    if (await canvas.getAttribute('data-lighting-circuit') !== 'emergency') throw Error('封锁照明未就位')
    await page.getByRole('button',{name:'解除封锁'}).click()
    await page.getByRole('button',{name:'关闭堡垒状态'}).click()
  })
  await measure('客梯乘坐', () => ride(page,'passenger'))
  await measure('货梯乘坐', () => ride(page,'freight'))
  await measure('进入 B2 客厅', () => shot('b2-living-dining'))
  await measure('B2 客厅稳态', () => wait(4000), true)
  await measure('B2 客厅拖动', async () => {
    const before = await canvas.getAttribute('data-feet'), bearing = await page.locator('#map-heading').getAttribute('transform')
    await drag(184,17)
    if (bearing === await page.locator('#map-heading').getAttribute('transform')) throw Error('拖动未转动视角')
    await drag(-184,-17)
    if (before !== await canvas.getAttribute('data-feet')) throw Error('拖动改变站位')
  }, true)
  await shot('b2-open-kitchen')
  await measure('B2 厨房稳态', () => wait(3000), true)
  const finished = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
  await cdp.send('Tracing.end')
  await finished
  for (const row of rows) {
    const start = events.find(e => e.name === 'fortress-start-' + row.id)
    const end = events.find(e => e.name === 'fortress-end-' + row.id)
    const renderer = start && events.some(e => e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && e.pid === start.pid && e.tid === start.tid)
    if (!renderer || !end) throw Error('缺少渲染主线程 trace')
    const tasks = events.filter(e => e.name.endsWith('RunTask') && e.tid === start.tid && e.pid === start.pid &&
      e.dur && e.ts < end.ts && e.ts + e.dur > start.ts)
    if (!tasks.length) throw Error('缺少主线程 RunTask ' + row.label)
    row.maxTaskMs = Math.max(...tasks.map(e => e.dur)) / 1000
    if (row.maxTaskMs > 50) failures.push(row.label + ' 主线程超过 50 ms')
    if (row.draws > 800 || row.triangles > 8e6) console.warn(row.label, '几何规模提醒')
  }
  console.table(rows.map(r => ({ ...r, fps: +r.fps.toFixed(1), p95: +r.p95.toFixed(1) })))
  const result = await page.evaluate(() => ({ linksAfterReady: window.surveyPerf.links-window.surveyPerf.readyLinks,
    minDpr: window.surveyPerf.minDpr }))
  if (result.linksAfterReady !== 0 || result.minDpr < deviceScaleFactor) failures.push('就绪后新增链接或降低 DPR')
  await page.close()
  // Allocation wrappers observe every binding. Run them in a fresh context, outside the timing trace.
  const memory = await browser.newPage({ viewport, deviceScaleFactor })
  await memory.addInitScript(installTextureAudit)
  await memory.addInitScript(() => sessionStorage.setItem('ars-keys','1'))
  await memory.goto('http://127.0.0.1:' + server.httpServer.address().port)
  await memory.waitForSelector('canvas[data-rendered=true][data-ready=settled]')
  for (const id of ['shot-01','shot-02','shot-03','shot-04','b2-living-dining','b2-open-kitchen']) {
    const previous = await memory.locator('canvas').getAttribute('data-revision')
    await memory.getByRole('button', { name: '房间直达', exact: true }).click()
    await memory.getByLabel('固定摄影机位').selectOption(id)
    await memory.waitForFunction(previous => {
      const d = document.querySelector('canvas').dataset
      return d.revision !== previous && d.ready === 'settled' && d.photoRevision === d.revision
    }, previous)
  }
  const storage = await memory.evaluate(() => window.arsTextureAudit())
  console.log(JSON.stringify({ ...result, storage }))
  if (!storage.peakBytes || storage.peakBytes > 1e9 || storage.unknownFormats.length)
    failures.push('WebGL 内存计量不完整或超出 1 GB')
  if (failures.length) throw Error(failures.join('\n'))
  console.log('控制台错误及警告 0')
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
