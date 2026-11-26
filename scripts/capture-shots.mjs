import { chromium } from 'playwright'
import { preview } from 'vite'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const milestone = process.argv[2] ?? 'm2'
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
await mkdir(directory, { recursive: true })
const staging = await mkdtemp(join(directory, '.capture-'))
let server
let browser
try {
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
  await page.goto(base + '/?quality=2', { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas[data-ready="settled"][data-rendered="true"]')
  for (const [id, view, projection, time] of shots) {
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
    await page.screenshot({ path: join(staging, id + '.png'), timeout: 90000 })
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
  if (errors.length) throw Error(errors.join('\n').slice(0, 4000))
  for (const [id] of shots) {
    const name = id + '.png'
    await rename(join(staging, name), join(directory, name))
  }
  console.log('5 张截图已保存至 docs/shots/' + milestone + '/')
} finally {
  await browser?.close()
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  await rm(staging, { recursive: true, force: true })
}
