if (process.argv[2] === 'v2') {
  await import('./capture-terrain.mjs')
  process.exit(0)
}
if (process.argv[2] === 'v3') {
  await import('./capture-vegetation.mjs')
  process.exit(0)
}

import { reviewM6 } from './review-m6.mjs'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { comparePhotographs, makeContactSheet } from './photograph-review.mjs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const milestone = process.argv[2] ?? 'm6'
const m6 = milestone === 'm6'
const m5 = milestone === 'm5-v1lite' || milestone === 'wave1'
if (!m5 && !/^m\d+(?:\.\d+[a-z]?)?$/.test(milestone)) throw Error('无效里程碑名称')
if (!existsSync(join(root, 'dist/index.html'))) throw Error('请先运行 npm run build')
const directory = resolve(root, 'docs/shots', milestone)
const shots = [
  ['shot-01', 'section', 'orthographic', '19:30'],
  ['shot-02', 'site', 'perspective', '06:15'],
  ['shot-03', 'site', 'perspective', '15:00'],
  ['shot-04', 'site', 'perspective', '22:00'],
  ['shot-05', 'walkthrough', 'perspective', '21:30'],
]
const pilots = [
  [
    'bedroom',
    '19:30',
    [0.46, -14.4, 7.64],
    '40ac055508e726bd1f6e852d0aeeb4b2aca58c9f19b3a131cbc3e6b0a5871fa7',
  ],
  [
    'commons',
    '10:30',
    [-14.75, -14.4, 2],
    '2ea8ec8125500d434229e98e612894c1d22b351337f5f6920d73bad9c6511b8c',
  ],
  ['bath', '19:30', [-3.04, -14.4, 4.3], 'c006b2fe93030a82b90a6f18de173654af23ffcb12f18ceaa18791aba1014587'],
]
const operationsStudy = milestone === 'm4'
const baseline = join(root, 'docs/shots/m2.5b/pilot')
const materialStudy = ['m2.5b', 'm2.5c'].includes(milestone)
await mkdir(materialStudy ? join(directory, 'pilot') : directory, { recursive: true })
if (m5) for (const folder of ['reflection', 'opening']) await mkdir(join(directory, folder), { recursive: true })
const staging = await mkdtemp(join(directory, '.capture-'))
let server
let browser
try {
  const captures = []
  const controlRects = new Map()
  const cameraSettings = new Map()
  await mkdir(join(staging, 'pilot'))
  if (m5) for (const folder of ['reflection', 'opening']) await mkdir(join(staging, folder))
  for (const [name, , , expected] of materialStudy ? pilots : []) {
    const file = 'pilot/r0-' + name + '.png'
    const bytes = await readFile(join(baseline, 'r0-' + name + '.png'))
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error('ebbe617 基线失配 ' + name)
    await writeFile(join(staging, file), bytes)
    captures.push(file)
  }
  server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
  const executablePath = process.env.CHROME_PATH
  const channel = m5 || m6 ? 'chrome' : existsSync(chromium.executablePath()) ? 'chromium' : 'chrome'
  browser = await chromium.launch({
    executablePath,
    channel: executablePath ? undefined : channel,
    headless: true,
    args: m5 || m6 ? ['--use-angle=metal'] : ['--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  await page.addInitScript(() => sessionStorage.setItem('ars-keys', '1'))
  if (['m1.5b', 'm2', 'm2.5a', 'm2.5b', 'm2.5c', 'm3', 'm4'].includes(milestone)) {
    await page.addInitScript(() => {
      const url = new URL(location.href)
      if (url.protocol === 'http:' && !url.searchParams.has('terrain')) {
        url.searchParams.set('terrain', 'v1')
        history.replaceState(history.state, '', url)
      }
    })
  }
  page.setDefaultTimeout(90000)
  const errors = []
  page.on('pageerror', (e) => {
    errors.push(e.message)
    console.error(e.message)
  })
  page.on('console', (m) => {
    if (['warning', 'error'].includes(m.type())) {
      errors.push(m.text())
      console.error(m.type(), m.text().slice(0, 2000))
    }
  })
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(r.status() + ' ' + new URL(r.url()).pathname)
  })
  page.on('requestfailed', (r) => errors.push(new URL(r.url()).pathname + ' ' + r.failure()?.errorText))
  const base = 'http://127.0.0.1:' + server.httpServer.address().port
  async function openStage(stage, extra = '') {
    const legacy = !m5 && !m6 ? '&veg=v2' : ''
    await page.goto(base + '/?quality=' + (m5 || m6 ? 3 : 2) + legacy + '&pilot=' + stage + extra, {
      waitUntil: 'networkidle',
    })
    await page.waitForSelector('canvas[data-ready="settled"][data-rendered="true"]')
    const data = await page.locator('canvas').evaluate((c) => ({ ...c.dataset }))
    if (
      data.pilot !== stage ||
      data.pilotTexture !== (stage === 'r1' ? 'procedural' : 'finish-array') ||
      data.pilotFinishes !== (stage === 'r1' ? '0' : '4') ||
      data.pilotChair !== (stage === 'r3' ? 'glb' : 'procedural') ||
      data.pilotArt !== (stage === 'r3' ? '1' : '0') ||
      data.pilotDomestic !== (stage === 'r3' ? '7' : '0')
    )
      throw Error('样板资产状态失配 ' + JSON.stringify(data))
    const files = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .filter((path) => /\/assets\/(pilot|finishes|art)\/.*\.(glb|webp)$/.test(path)),
    )
    const count = { r1: 0, r2: 12, r3: 17 }[stage]
    if (
      files.length !== count ||
      new Set(files).size !== count ||
      (stage === 'r2' && files.some((path) => path.endsWith('.glb') || path.includes('/art/')))
    )
      throw Error('对照档位下载的资产不符 ' + stage + ' ' + files.join(', '))
  }
  async function capture(id, view, projection, time, file, expectedFeet) {
    const revision = await page.locator('canvas').getAttribute('data-revision')
    await page.getByRole('button', { name: '机位与图幅' }).click()
    await page.getByRole('combobox', { name: '固定摄影机位' }).selectOption(id)
    // selectOption need not move a physical mouse. Leave the canvas as a user picking from the menu would.
    await page.locator('canvas').dispatchEvent('pointerleave')
    await page.waitForFunction(
      ([v, p, rev]) => {
        const c = document.querySelector('canvas')?.dataset
        return (
          c?.view === v &&
          c.projection === p &&
          c.ready === 'settled' &&
          c.revision !== rev &&
          c.photoRevision === c.revision &&
          c.instrumentRevision === c.revision &&
          Number(c.calls) > 0
        )
      },
      [view, projection, revision],
    )
    await page.waitForFunction((t) => document.querySelector('.condition')?.textContent?.includes(t), time)
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    if ((await page.getByRole('alert').count()) || errors.length)
      throw Error('浏览器验收失败 ' + errors.join('\n').slice(0, 3500))
    if (view !== 'walkthrough')
      await page.waitForFunction(() => document.querySelector('#cursor-coords')?.textContent?.includes('X —'))
    if (expectedFeet) {
      const feet = (await page.locator('canvas').getAttribute('data-feet')).split(',').map(Number)
      if (Math.hypot(...feet.map((n, i) => n - expectedFeet[i])) > 0.025)
        throw Error(id + ' 落点偏离 ' + feet)
      const settings = await page.locator('canvas').getAttribute('data-photo-settings')
      const { dpr, exposure } = JSON.parse(settings)
      if (dpr !== 1 || Math.abs(exposure - 1.2) > 0.00001) throw Error(id + ' 曝光或 DPR 失配')
      if (cameraSettings.has(id) && cameraSettings.get(id) !== settings)
        throw Error(id + ' 与其他档位的实际相机矩阵、投影或曝光不一致')
      cameraSettings.set(id, settings)
    }
    if (operationsStudy || m6) {
      // M4 changes the scenario field in the title block and adds two actions to the tool row.
      // Keep the full-frame difference for review; apply the existing visual tolerance to the model.
      controlRects.set(
        id,
        await page.locator('.title-block, .view-tools').evaluateAll((items) =>
          items.map((el) => {
            const { left, top, right, bottom } = el.getBoundingClientRect()
            return {
              left: Math.floor(left),
              top: Math.floor(top),
              right: Math.ceil(right),
              bottom: Math.ceil(bottom),
            }
          }),
        ),
      )
    }
    if (m5 && expectedFeet) await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.reflectionMix) === 1)
    await page.screenshot({ path: join(staging, file), timeout: 90000 })
    captures.push(file)
    const { calls, triangles, feet } = await page.locator('canvas').evaluate((c) => ({ ...c.dataset }))
    console.log(
      id,
      view,
      projection,
      time,
      '·',
      calls,
      'draw calls ·',
      triangles,
      'triangles',
      feet && view === 'walkthrough' ? '· feet ' + feet : '',
    )
  }
  await openStage('r3')
  for (const [id, view, projection, time] of shots) await capture(id, view, projection, time, id + '.png')
  if (materialStudy) {
    await mkdir(join(staging, 'details'))
    await mkdir(join(directory, 'details'), { recursive: true })
    await capture(
      'detail-sanitary',
      'walkthrough',
      'perspective',
      '19:30',
      'details/public-sanitary.png',
      [-4, -14.4, 0.05],
    )
  }
  if (m5) {
    await capture('station-low', 'site', 'perspective', '07:40', 'station-low.png')
    for (const state of ['on', 'off']) {
      if (state === 'off') await openStage('r3', '&roomReflections=off')
      for (const [name, time, feet] of pilots)
        await capture('pilot-' + name, 'walkthrough', 'perspective', time, 'reflection/' + name + '-' + state + '.png', feet)
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    for (const [cue, filename, settle] of [[0, 'dawn', 900], [1, 'approach', 1400], [2, 'section', 1800], [3, 'shaft', 4600],
      [4, 'commons', 1600], [5, 'lens', 1800], [6, 'closing', 1700], [7, 'lockdown', 900], [8, 'site', 1550]]) {
      await page.waitForSelector('canvas[data-tour=opening][data-tour-cue="' + cue + '"]')
      if (cue === 3) {
        await page.waitForFunction(() => {
          const [x, y, z] = document.querySelector('canvas').dataset.eye.split(',').map(Number)
          return x >= -6 && x <= -2 && z >= -6 && z <= -2 && y < -1 && y > -12
        }, null, { timeout: 7500 })
      } else await page.waitForTimeout(settle)
      const file = 'opening/' + filename + '.png'
      await page.screenshot({ path: join(staging, file) })
      captures.push(file)
    }
    await page.waitForSelector('canvas[data-tour=idle]')
    if (!await page.evaluate(() => localStorage.getItem('ars-opening-seen'))) throw Error('首次开场未记住')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas[data-rendered=true][data-tour=idle][data-ready=settled]')
  }
  if (m6) await reviewM6(page, async name => {
    await page.screenshot({ path: join(staging, name) })
    captures.push(name)
  })
  for (const stage of m5 || m6 ? [] : materialStudy ? ['r3', 'r2', 'r1'] : ['r3']) {
    if (stage !== 'r3') await openStage(stage)
    for (const [name, time, feet] of pilots)
      await capture(
        'pilot-' + name,
        'walkthrough',
        'perspective',
        time,
        'pilot/' + stage + '-' + name + '.png',
        feet,
      )
  }
  if (operationsStudy) {
    const button = (name) => page.getByRole('button', { name, exact: true })
    async function plate(name) {
      await page.locator('canvas').dispatchEvent('pointerleave')
      await page.waitForSelector('canvas[data-ready=settled]')
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      await page.screenshot({ path: join(staging, name), timeout: 90000 })
      captures.push(name)
    }
    await page.keyboard.press('1')
    await page.waitForSelector('canvas[data-view=site][data-mode=exterior][data-ready=settled]')
    await button('工程体检').click()
    await page.getByRole('slider', { name: '入住人数' }).press('End')
    await page.getByLabel('工况', { exact: true }).selectOption('fallout')
    await button('快进封锁').click()
    await page.waitForSelector('.hud[data-lockdown=sealed][data-people="14"]')
    await page.waitForSelector('canvas[data-lighting-circuit=emergency]')
    await page.waitForTimeout(950) // Let the display-referred LUT reach its final weights.
    await button('关闭工程面板').click()
    await plate('lockdown.png')
    await button('工程体检').click()
    await page.locator('[data-diagnostic=oxygen]').click()
    await page.locator('.diagnostic-detail').filter({ hasText: '11.76' }).waitFor()
    await plate('health.png')
    await button('进入 B2 中控室').click()
    await page.waitForSelector(
      'canvas[data-view=walkthrough][data-command-screen^="fallout/14/30/"][data-ready=settled]',
    )
    await plate('command.png')
    await page.getByRole('button', { name: '机位与图幅' }).click()
    await page.getByLabel('房间索引').selectOption('b1_decon')
    const room = page.getByRole('region', { name: '房间数据表' })
    await room.getByRole('combobox', { name: '室内机位' }).selectOption({ label: '门旁压差表' })
    await room.getByRole('button', { name: /进入漫游/ }).click()
    await page.waitForSelector(
      'canvas[data-decon-pressure-pa="30.0"][data-view=walkthrough][data-ready=settled]',
    )
    await plate('decon.png')
    await page.getByLabel('工况', { exact: true }).selectOption('normal')
    await button('模拟隔离检修').click()
    await page.getByLabel('检修目标').selectOption('HV-B2-001')
    await button('隔离所选目标').click()
    await page.waitForSelector('.hud[data-isolation="HV-B2-001"]')
    await button('查看全程搬运').click()
    await page.waitForSelector('canvas[data-view=sectionBox][data-mode=xray][data-ready=settled]')
    await plate('maintenance.png')
    await button('结束隔离检修').click()
    await button('关闭工程面板').click()
    await page.getByRole('button', { name: '机位与图幅' }).click()
    await page.getByLabel('固定摄影机位').selectOption('pilot-bath')
    await page.waitForSelector('canvas[data-view=walkthrough][data-ready=settled]')
  }
  if (!materialStudy && !m5 && !m6) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true })
    await page.setViewportSize({ width: 390, height: 844 })
    const legend = page.locator('.walk-legend')
    await legend.getByRole('button', { name: /线型图例/ }).click()
    const water = legend.getByRole('checkbox', { name: '给排水' })
    await water.uncheck()
    await water.check()
    const fits = await legend.evaluate((element) => {
      const panel = element.getBoundingClientRect()
      const controls = ['.walk-map', '.joystick'].map((selector) =>
        document.querySelector(selector).getBoundingClientRect(),
      )
      return (
        panel.left >= 0 &&
        panel.right <= innerWidth &&
        document.documentElement.scrollWidth === innerWidth &&
        controls.every(
          (rect) =>
            !rect.width ||
            panel.left >= rect.right ||
            panel.bottom <= rect.top ||
            panel.right <= rect.left ||
            panel.top >= rect.bottom,
        )
      )
    })
    if (!fits) throw Error('手机漫游图例溢出或遮住小地图、摇杆')
    if (operationsStudy) {
      await page.getByRole('button', { name: '工程体检', exact: true }).click()
      const sheet = page.getByTestId('operations-sheet')
      await sheet.getByRole('slider', { name: '入住人数' }).press('Home')
      await page.waitForSelector('.hud[data-people="5"]')
      const fitsPhone = await sheet.evaluate((element) => {
        const r = element.getBoundingClientRect()
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          r.bottom <= innerHeight &&
          document.documentElement.scrollWidth === innerWidth &&
          element.scrollWidth <= element.clientWidth + 1
        )
      })
      if (!fitsPhone) throw Error('工程体检超出手机视口')
    }
  }
  if (errors.length) throw Error(errors.join('\n').slice(0, 4000))
  await page.close()
  const review = await browser.newPage()
  for (const [id] of shots) {
    const before = join(
      root,
      'docs/shots',
      m6 ? 'wave1' : m5 ? 'm4' : materialStudy ? 'm2.5b' : operationsStudy ? 'm3' : 'm2.5c',
      id + '.png',
    )
    const after = join(staging, id + '.png')
    const full = await comparePhotographs(review, before, after)
    const result = operationsStudy || m6
      ? await comparePhotographs(review, before, after, controlRects.get(id), m6)
      : full
    console.log(id, '全幅较签收图', full, '模型画面', result)
    if (m6) {
      // Unchanged Wave 1 recaptures vary with exposure and moving crops (SSIM 0.963–1).
      if (result.mean > 4 || result.ssim < 0.94) throw Error(id + ' 的模型结构或曝光偏离 Wave 1')
      continue
    }
    if (m5) continue // Sky brightness, room light and the controls intentionally change these views.
    if (operationsStudy && id === 'shot-03') {
      if (result.changed < 1) throw Error('极寒实拍缺少工况色彩与天气变化')
    } else if (!m6 && !materialStudy && !operationsStudy && id === 'shot-04') {
      if (result.changed < 0.3) throw Error('X 光夜景未呈现新管网')
    } else if (result.mean > (materialStudy && id === 'shot-05' ? 10 : 1.5)) {
      throw Error(id + ' 超过签收画面色差范围')
    }
  }
  if (materialStudy) {
    for (const [name] of pilots) {
      for (const [before, after] of [
        ['r1', 'r2'],
        ['r2', 'r3'],
      ]) {
        const file = (stage) => join(staging, 'pilot', stage + '-' + name + '.png')
        const result = await comparePhotographs(review, file(before), file(after))
        console.log(name, before, '→', after, result)
        if (result.changed < 0.1) throw Error(name + ' 截图没有出现对应资产的可见变化')
      }
    }
    const board = 'pilot/comparison.webp'
    await makeContactSheet(review, join(staging, 'pilot'), pilots, join(staging, board))
    captures.push(board)
  } else if (m5) {
    for (const [name] of pilots) {
      const path = state => join(staging, 'reflection', name + '-' + state + '.png')
      const delta = await comparePhotographs(review, path('off'), path('on'))
      console.log(name, '同机位室内反射差异', delta)
      if (!delta.changed) throw Error(name + ' 的反射未改变任何可辨像素')
    }
  } else if (!m6) {
    for (const [name] of pilots) {
      const file = 'pilot/r3-' + name + '.png'
      const result = await comparePhotographs(
        review,
        join(root, 'docs/shots/m2.5c', file),
        join(staging, file),
        controlRects.get('pilot-' + name),
      )
      console.log(name, '较 M2.5c 签收样板', result)
      if (result.mean > 1.5) throw Error(name + ' 室内画面偏离签收基线')
    }
  }
  for (const file of captures)
    if (materialStudy || !file.startsWith('pilot/')) await rename(join(staging, file), join(directory, file))
  console.log('摄影验收通过，结果保存至 docs/shots/' + milestone + '/。')
} finally {
  await browser?.close()
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  await rm(staging, { recursive: true, force: true })
}
