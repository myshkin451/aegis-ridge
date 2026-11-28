import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { comparePhotographs } from './photograph-review.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = join(root, 'docs/shots/v2/ab')
const shots = ['shot-01', 'shot-02', 'shot-03', 'station-low', 'east-portal']
await mkdir(out, { recursive: true })
const stage = await mkdtemp(join(out, '.capture-'))
let server
let browser
try {
  server = await preview({ root, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  const url = 'http://127.0.0.1:' + server.httpServer.address().port
  browser = await chromium.launch({
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ['--use-angle=metal'],
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  page.setDefaultTimeout(60000)
  const errors = [],
    plates = {},
    renders = {}
  page.on('pageerror', (e) => {
    errors.push(e.message)
    console.error(e.message)
  })
  page.on('console', (m) => {
    if (['warning', 'error'].includes(m.type())) {
      errors.push(m.text())
      console.error(m.text())
    }
  })
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(r.status() + ' ' + r.url())
  })
  page.on('requestfailed', (r) => errors.push(r.url() + ' ' + r.failure()?.errorText))
  await page.addInitScript(() => {
    sessionStorage.setItem('ars-keys', '1')
    const original = WebGL2RenderingContext.prototype.linkProgram
    window.terrainLinks = { count: 0, ready: null }
    WebGL2RenderingContext.prototype.linkProgram = function (program) {
      window.terrainLinks.count++
      return original.call(this, program)
    }
    window.addEventListener('ars-ready', () => {
      window.terrainLinks.ready = window.terrainLinks.count
    })
  })
  for (const version of ['v1', 'v2']) {
    await page.goto(url + '/?quality=2&terrain=' + version)
    const canvas = page.locator('canvas[data-rendered=true][data-ready=settled]')
    await canvas.waitFor()
    if ((await canvas.getAttribute('data-terrain')) !== version) throw Error('地形版本未生效')
    for (const id of shots) {
      const rev = await canvas.getAttribute('data-revision')
      await page.getByRole('button', { name: '机位与图幅' }).click()
      await page.getByLabel('固定摄影机位').selectOption(id)
      await page.mouse.move(0, 0)
      await page.locator('canvas').dispatchEvent('pointerleave')
      await page.waitForFunction((rev) => {
        const c = document.querySelector('canvas').dataset
        return (
          c.ready === 'settled' &&
          c.revision !== rev &&
          c.revision === c.photoRevision &&
          c.revision === c.instrumentRevision &&
          Number(c.calls) > 0
        )
      }, rev)
      // Allow the scenario LUT to reach its endpoint; reduced motion freezes weather advection.
      await page.waitForTimeout(1200)
      const data = await canvas.evaluate((c) => ({
        settings: JSON.parse(c.dataset.photoSettings),
        time: document.querySelector('.condition').textContent.trim().slice(0, 5),
        scenario: document.querySelector('.hud').dataset.scenario,
      }))
      if (version === 'v2' && JSON.stringify(data) !== JSON.stringify(plates[id]))
        throw Error(id + ' A/B 拍摄参数不同')
      plates[id] = data
      await page.screenshot({ path: join(stage, version + '-' + id + '.png') })
      console.log(version, id, data.time, 'exposure', data.settings.exposure)
    }
    // Cycle the remaining weather regimes after the frozen A/B exposures.
    for (const regime of ['bio', 'fallout', 'normal']) {
      await page.getByLabel('工况', { exact: true }).selectOption(regime)
      await page.waitForSelector('.hud[data-scenario="' + regime + '"]')
      await page.waitForTimeout(1100)
    }
    renders[version] = await canvas.evaluate((c) => {
      const gl = c.getContext('webgl2'),
        ext = gl.getExtension('WEBGL_debug_renderer_info')
      return {
        gpu: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
        linksAfterReady: window.terrainLinks.count - window.terrainLinks.ready,
      }
    })
    if (renders[version].linksAfterReady !== 0) throw Error('交互后新增 shader 链接 ' + version)
  }
  if (errors.length) throw Error(errors.join('\n'))
  const review = await browser.newPage()
  for (const id of shots) {
    plates[id].difference = await comparePhotographs(
      review,
      join(stage, 'v1-' + id + '.png'),
      join(stage, 'v2-' + id + '.png'),
    )
    if (!plates[id].difference.changed) throw Error(id + ' A/B 无差异')
  }
  await writeFile(
    join(stage, 'capture.json'),
    JSON.stringify({ viewport: [1440, 900], renders, errors, plates }, null, 2) + '\n',
  )
  for (const file of [...shots.flatMap((id) => ['v1-' + id + '.png', 'v2-' + id + '.png']), 'capture.json'])
    await rename(join(stage, file), join(out, file))
} finally {
  await browser?.close()
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  await rm(stage, { force: true, recursive: true })
}
