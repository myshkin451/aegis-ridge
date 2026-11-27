import { chromium } from 'playwright'
import { preview } from 'vite'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { comparePhotographs, makeContactSheet } from './photograph-review.mjs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const milestone = process.argv[2] ?? 'm2.5c'
if (!/^m\d+(?:\.\d+[a-z]?)?$/.test(milestone)) throw Error('无效里程碑名称')
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
const baseline = join(root, 'docs/shots/m2.5b/pilot')
await mkdir(join(directory, 'pilot'), { recursive: true })
const staging = await mkdtemp(join(directory, '.capture-'))
let server
let browser
try {
  const captures = []
  const cameraSettings = new Map()
  await mkdir(join(staging, 'pilot'))
  for (const [name, , , expected] of pilots) {
    const file = 'pilot/r0-' + name + '.png'
    const bytes = await readFile(join(baseline, 'r0-' + name + '.png'))
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error('ebbe617 基线失配 ' + name)
    await writeFile(join(staging, file), bytes)
    captures.push(file)
  }
  server = await preview({ root, preview: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
  const executablePath = process.env.CHROME_PATH
  const channel = existsSync(chromium.executablePath()) ? 'chromium' : 'chrome'
  browser = await chromium.launch({
    executablePath,
    channel: executablePath ? undefined : channel,
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  await page.addInitScript(() => sessionStorage.setItem('ars-keys', '1'))
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
  async function openStage(stage) {
    await page.goto(base + '/?quality=2&pilot=' + stage, { waitUntil: 'networkidle' })
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
        .filter((path) => /\.(glb|webp)$/.test(path)),
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
  for (const stage of ['r3', 'r2', 'r1']) {
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
  if (errors.length) throw Error(errors.join('\n').slice(0, 4000))
  await page.close()
  const review = await browser.newPage()
  for (const [id] of shots) {
    const result = await comparePhotographs(
      review,
      join(root, 'docs/shots/m2.5b', id + '.png'),
      join(staging, id + '.png'),
    )
    console.log(id, '较签收图', result)
    // The first four show the survey; the fifth also sees the new cleanroom surfaces and reflections.
    if (result.mean > (id === 'shot-05' ? 10 : 1.5)) throw Error(id + ' 超过签收画面色差范围')
  }
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
  for (const file of captures) await rename(join(staging, file), join(directory, file))
  console.log('五个固定机位、洁具近看、十二张样板及对照总图已保存至 docs/shots/' + milestone + '/。')
} finally {
  await browser?.close()
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  await rm(staging, { recursive: true, force: true })
}
