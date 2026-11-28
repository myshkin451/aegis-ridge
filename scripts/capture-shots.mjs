import { chromium } from 'playwright'
import { preview } from 'vite'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const milestone = process.argv[2] ?? 'v3-2'
if (milestone === 'v2' || milestone === 'v3') {
  await import(milestone === 'v2' ? './capture-terrain.mjs' : './capture-vegetation.mjs')
  process.exit(0)
}
if (!/^v3-(?:[2-9]|[1-9]\d+)$/.test(milestone)) throw Error('需要 V3-2 或后续摄影里程碑')
const directory = join(root, 'docs/shots', milestone)
await mkdir(directory, { recursive: true })
const staging = await mkdtemp(join(directory, '.capture-'))
const core = [
  ['shot-01', 'section', 'orthographic', '19:30'], ['shot-02', 'site', 'perspective', '06:15'],
  ['shot-03', 'site', 'perspective', '15:00'], ['shot-04', 'site', 'perspective', '22:00'],
  ['shot-05', 'walkthrough', 'perspective', '21:30'],
]
const studies = [
  ['b2-living-dining', 'ref-a-living-dining', 'B2 客厅与餐桌'],
  ['b2-open-kitchen', 'ref-b-open-kitchen', 'B2 开放厨房'],
]
async function compare(page, reference, actual, title) {
  const paths = [join(root, 'docs/references/b2-living', reference + '.jpg'), join(staging, actual + '.png')]
  const images = await Promise.all(paths.map(async (p, i) =>
    'data:image/' + (i ? 'png' : 'jpeg') + ';base64,' + (await readFile(p)).toString('base64')))
  const data = await page.evaluate(async ({ images, title }) => {
    const canvas = document.createElement('canvas')
    canvas.width = 2016
    canvas.height = 613
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#201e1b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#eee9df'
    ctx.font = '18px system-ui'
    for (const [i, uri] of images.entries()) {
      const img = new Image()
      img.src = uri
      await img.decode()
      const x = 6 + i * 1006
      ctx.fillText(title + (i ? '　/　WebGL 实拍' : '　/　参考图'), x + 6, 30)
      const scale = Math.min(1000 / img.width, 562 / img.height)
      ctx.drawImage(img, x, 43, img.width * scale, img.height * scale)
    }
    return canvas.toDataURL('image/webp', .94).split(',')[1]
  }, { images, title })
  await writeFile(join(staging, actual + '-comparison.webp'), Buffer.from(data, 'base64'))
}
let server, browser
try {
  server = await preview({ root, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  browser = await chromium.launch({ channel: process.env.CHROME_PATH ? undefined : 'chrome',
    executablePath: process.env.CHROME_PATH, args: ['--use-angle=metal'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  page.setDefaultTimeout(35000)
  const errors = []
  page.on('console', m => { if (['warning','error'].includes(m.type())) errors.push(m.text()) })
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()) })
  page.on('requestfailed', r => errors.push(r.url() + ' ' + r.failure()?.errorText))
  await page.addInitScript(() => sessionStorage.setItem('ars-keys','1'))
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/?quality=3')
  const canvas = page.locator('canvas').first()
  await page.waitForSelector('canvas[data-rendered=true][data-ready=settled]')
  if (await canvas.getAttribute('data-commons-models') !== '13') throw Error('B2 资产未全部就绪')
  const shotFiles = []
  async function shoot(id, view, projection, time, clearFrame = false) {
    const rev = await canvas.getAttribute('data-revision')
    await page.getByRole('button', { name: '房间直达', exact: true }).click()
    await page.getByLabel('固定摄影机位').selectOption(id)
    await page.waitForFunction(({rev,view,projection}) => {
      const d = document.querySelector('canvas')?.dataset
      return d?.ready === 'settled' && d.revision !== rev && d.photoRevision === d.revision &&
        d.view === view && d.projection === projection && Number(d.calls) > 0
    }, {rev,view,projection})
    await page.waitForFunction(t => document.querySelector('.day-clock output')?.textContent?.includes(t), time)
    if (clearFrame) {
      await page.keyboard.press('h')
      await page.locator('.hud').waitFor({ state: 'hidden' })
      await page.waitForFunction(() => document.querySelector('canvas').dataset.interiorShadowRoom === 'b2_commons' &&
        document.querySelector('canvas').dataset.reflectionMix === '1')
    }
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
    await page.screenshot({ path: join(staging, id + '.png') })
    shotFiles.push(id + '.png')
    const d = await canvas.evaluate(c => ({ ...c.dataset }))
    console.log(id, d.view, time, d.feet, d.calls, 'draws', d.triangles, 'triangles')
    if (clearFrame) await page.keyboard.press('h')
  }
  for (const shot of core) await shoot(...shot)
  await page.setViewportSize({ width: 1536, height: 864 })
  for (const [id, reference, title] of studies) {
    await shoot(id, 'walkthrough', 'perspective', '19:30', true)
    await compare(page, reference, id, title)
    shotFiles.push(id + '-comparison.webp')
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '堡垒状态', exact: true }).click()
  const fits = await page.getByRole('region', { name: '堡垒状态' }).evaluate(el => {
    const r = el.getBoundingClientRect()
    return r.x >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && el.scrollWidth <= el.clientWidth + 1
  })
  if (!fits) throw Error('手机状态抽屉超出视口')
  if (errors.length) throw Error(errors.join('\n'))
  for (const file of shotFiles) await rename(join(staging, file), join(directory, file))
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.httpServer.close(resolve))
  await rm(staging, { recursive: true, force: true })
}
