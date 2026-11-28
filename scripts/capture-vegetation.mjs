import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { preview } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const measure = process.argv.includes('--steady')
const output = join(root, 'docs/shots/v3/ab')
await mkdir(output, { recursive: true })
const staging = await mkdtemp(join(output, '.capture-'))
const server = await preview({ root, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
let browser
try {
  const base = 'http://127.0.0.1:' + server.httpServer.address().port
  browser = await chromium.launch({
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    executablePath: process.env.CHROME_PATH,
    args: ['--use-angle=metal'],
  })
  const baseSettings = new Map()
  const captures = []
  for (const variant of measure ? ['v3'] : ['v2', 'v3']) {
    const page = await browser.newPage({
      viewport: measure ? { width: 2560, height: 1440 } : { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: measure ? 'no-preference' : 'reduce',
    })
    page.setDefaultTimeout(60000)
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (['warning', 'error'].includes(m.type())) errors.push(m.text())
    })
    page.on('requestfailed', (r) => errors.push(r.url() + ' ' + r.failure()?.errorText))
    page.on('response', (r) => {
      if (r.status() >= 400) errors.push(r.status() + ' ' + r.url())
    })
    await page.addInitScript(() => {
      sessionStorage.setItem('ars-keys', '1')
      const observer = (window.__THREE_DEVTOOLS__ = new EventTarget())
      let scene
      observer.addEventListener('observe', (e) => {
        if (e.detail.isScene && !scene) scene = e.detail
      })
      let linked = 0,
        atReady
      const link = WebGL2RenderingContext.prototype.linkProgram
      WebGL2RenderingContext.prototype.linkProgram = function (program) {
        linked++
        return link.call(this, program)
      }
      window.addEventListener('ars-ready', () => {
        atReady = linked
      })
      window.readFoliageDraws = () => {
        let cropBatches = 0,
          groundBatches = 0
        scene.traverse((o) => {
          if (o.userData.shape?.startsWith('crop-')) {
            if (!o.material.map || o.material.alphaTest <= 0 || o.material.clippingPlanes?.length !== 6)
              throw Error('作物叶片未接入纹理、透明裁切或建筑剖切')
            cropBatches++
          }
          if (o.name === 'meadow-grass' || o.name === 'meadow-shrub') {
            if (o.castShadow) throw Error('地被进入阴影通道')
            groundBatches++
          }
        })
        return { cropBatches, groundBatches }
      }
      window.readVegPhoto = () => {
        const { camera, gl } = scene.__r3f.root.getState()
        const ext = gl.getContext().getExtension('WEBGL_debug_renderer_info')
        return {
          settings: {
            world: camera.matrixWorld.toArray(),
            projection: camera.projectionMatrix.toArray(),
            exposure: gl.toneMappingExposure,
            dpr: gl.getPixelRatio(),
          },
          gpu: gl.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL),
          compiled: atReady,
          linked: linked - atReady,
        }
      }
    })
    await page.goto(base + '/?quality=2&veg=' + variant, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas[data-rendered=true][data-ready=settled]')
    const installed = await page.evaluate(() => window.readFoliageDraws())
    assert.equal(installed.groundBatches, variant === 'v2' ? 0 : 2)
    assert.equal(installed.cropBatches > 0, variant === 'v3')
    const preload = await page.evaluate(() => {
      const resources = performance
        .getEntriesByType('resource')
        .filter((e) => e.name.includes('/assets/vegetation/'))
      const opening = performance.getEntriesByName('ars-open-scene')[0].startTime
      return {
        files: resources.map((e) => e.name.split('/').at(-1)).sort(),
        beforeScene: resources.every((e) => e.responseEnd <= opening),
      }
    })
    assert.deepEqual(
      preload.files,
      variant === 'v2'
        ? []
        : [
            'alpine-grass.webp',
            'alpine-shrub.webp',
            'boulder-lods.glb',
            'crop-leaves.webp',
            'fir-bough.webp',
            'fir-octa.webp',
          ],
    )
    assert(preload.beforeScene, '植被资产在场景预编译后才完成下载')
    async function plate(id, time, room, feet) {
      const canvas = page.locator('canvas')
      const before = await canvas.getAttribute('data-revision')
      await page.getByRole('button', { name: '机位与图幅' }).click()
      if (room) {
        await page.getByLabel('房间索引').selectOption(room)
        const sheet = page.getByRole('region', { name: '房间数据表' })
        await sheet.getByLabel('室内机位').selectOption('0')
        await sheet.getByRole('button', { name: /进入漫游/ }).click()
      } else {
        await page.getByLabel('固定摄影机位').selectOption(id)
      }
      await canvas.dispatchEvent('pointerleave')
      await page.waitForFunction(
        ({ before, time, room }) => {
          const d = document.querySelector('canvas').dataset
          return (
            d.ready === 'settled' &&
            d.revision !== before &&
            d.instrumentRevision === d.revision &&
            (room ? d.view === 'walkthrough' : d.photoRevision === d.revision) &&
            document.querySelector('.condition')?.textContent.includes(time)
          )
        },
        { before, time, room },
      )
      await page.waitForTimeout(950) // Let the scenario LUT and the interior lights reach the selected shot.
      const data = await canvas.evaluate((c) => ({ ...c.dataset }))
      assert.equal(data.veg, variant)
      if (feet) {
        const actual = data.feet.split(',').map(Number)
        assert(Math.hypot(...actual.map((n, i) => n - feet[i])) < 0.025, id + ' 相机落点 ' + data.feet)
      }
      const { settings, gpu, compiled, linked } = await page.evaluate(() => window.readVegPhoto())
      assert.match(gpu, /ANGLE.*Metal/i)
      assert.equal(settings.dpr, 1)
      assert.equal(linked, 0, id + ' 就绪后链接')
      if (variant === 'v2') baseSettings.set(id, settings)
      else if (!measure) assert.deepEqual(settings, baseSettings.get(id), id + ' 实际相机、投影或曝光不同')
      let steady
      if (measure) {
        steady = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const dt = []
              let first, previous
              function sample(t) {
                if (previous !== undefined) dt.push(t - previous)
                first ??= t
                previous = t
                if (t - first < 6000) return requestAnimationFrame(sample)
                dt.sort((a, b) => a - b)
                resolve({ fps: (1000 * dt.length) / (t - first), p95: dt[Math.ceil(dt.length * 0.95) - 1] })
              }
              requestAnimationFrame(sample)
            }),
        )
        assert.equal((await page.evaluate(() => window.readVegPhoto())).linked, 0)
        console.log(id, '稳态', steady)
        assert(steady.fps >= 58 && steady.p95 <= 20, id + ' 未达到项目的 60 FPS 验收区间')
      } else {
        await page.screenshot({ path: join(staging, variant + '-' + id + '.png') })
      }
      captures.push({
        variant,
        id,
        time,
        settings,
        gpu,
        compiled,
        linked,
        steady,
        calls: +data.calls,
        triangles: +data.triangles,
      })
      assert.deepEqual(errors, [])
      console.log(variant, id, '曝光', settings.exposure, '绘制', data.calls, '三角形', data.triangles)
    }
    await plate('shot-02', '06:15')
    await plate('shot-03', '15:00')
    await plate('shot-05', '21:30')
    await plate('b3-aquaponics', '21:30', 'b3_aquaponics', [8.8, -18.6, 2])
    // Daytime greenhouse. Restore the daylight preset after the night-time B3 tour.
    await page.getByRole('button', { name: '机位与图幅' }).click()
    await page.getByLabel('固定摄影机位').selectOption('pilot-commons')
    await page.waitForSelector('canvas[data-view=walkthrough][data-ready=settled]')
    await plate('l2-greenhouse', '10:30', 'l2_greenhouse', [7.5, 4.4, 0.1])
    assert.deepEqual(errors, [])
    await page.close()
  }
  const summary = measure ? 'steady.json' : 'cameras.json'
  await writeFile(join(staging, summary), JSON.stringify(captures, null, 2) + '\n')
  const photographs = measure ? [] : captures.map((c) => c.variant + '-' + c.id + '.png')
  for (const file of [...photographs, summary]) await rename(join(staging, file), join(output, file))
} finally {
  await browser?.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
  await rm(staging, { recursive: true, force: true })
}
