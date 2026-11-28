import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { reviewMeasurement } from './review-measurement.mjs'

// Exercise the same controls used at the drafting table, including a fresh load from the shared URL.
export async function reviewM6(page, plate) {
  const button = name => page.getByRole('button', { name, exact: true })
  const sheet = page.getByRole('region', { name: '蓝图工具', exact: true })
  const ready = async view => {
    await page.waitForSelector('canvas[data-ready=settled][data-rendered=true]' + (view ? '[data-view=' + view + ']' : ''))
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  }
  async function openTools(tab) {
    if (!await sheet.isVisible()) await button('蓝图工具').click()
    await button(tab).click()
  }
  async function checkRuler(narrow) {
    const floors = [['L2', 4.4], ['L1', 0], ['B1', -10.2], ['B2', -14.4], ['B3', -18.6], ['B4', -22.8]]
    await page.keyboard.press('3')
    await ready('plan')
    for (const [id, elevation] of floors) {
      const mark = page.locator('.floor-mark button').filter({ has: page.locator('b', { hasText: id }) })
      await mark.click()
      await ready('plan')
      assert.equal(await mark.getAttribute('aria-pressed'), 'true')
      const geometry = await mark.evaluate(el => {
        const bounds = el.getBoundingClientRect(), rail = el.closest('.rail').getBoundingClientRect()
        const horizontal = rail.width > rail.height
        const fraction = horizontal ? (bounds.right - rail.left) / rail.width : (bounds.bottom - rail.top) / rail.height
        const visible = Array.from(document.querySelectorAll('.tool-row button,.floor-mark small')).every(node => {
          const r = node.getBoundingClientRect()
          return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
        })
        return { fraction, horizontal, visible, label: el.querySelector('small').textContent }
      })
      assert.equal(geometry.horizontal, narrow)
      assert.ok(geometry.visible, '工具或标高文字超出视口')
      assert.equal(parseFloat(geometry.label.replace('±', '')), elevation)
      assert.ok(Math.abs(geometry.fraction - (8.8 - elevation) / 31.9) < 0.002, id + ' 标高与实尺偏离')
    }
    console.log(narrow ? '窄屏横尺' : '桌面纵尺', 'L2–B4 六层实标高、选层与 HUD 通过')
  }
  await checkRuler(false)
  await openTools('房间模块')
  const host = sheet.getByLabel('安装位置'), template = sheet.getByLabel('替换为')
  const seen = new Set()
  for (const roomId of await host.locator('option').evaluateAll(options => options.map(o => o.value))) {
    if (roomId === 'b1_tactical') continue
    await host.selectOption(roomId)
    const choices = await template.locator('option').evaluateAll(options => options.map(o => [o.value, o.text]))
    for (const [id, name] of choices) {
      if (!id || seen.has(id)) continue
      await template.selectOption(id)
      await button('应用模块').click()
      await ready('floorOrbit')
      assert.equal(await sheet.getByTestId('installed-room').innerText(), name)
      assert.equal(await sheet.locator('[data-check=dry-stack] [data-status]').innerText(), 'PASS')
      await page.keyboard.press('5')
      await ready('walkthrough')
      await plate('module-' + id + '.png')
      seen.add(id)
    }
  }
  assert.ok(seen.size >= 4, '合规安装未覆盖四种模块')
  await host.selectOption('b1_tactical')
  await button('应用模块').click()
  await ready('floorOrbit')
  assert.equal(await sheet.locator('[data-check=dry-stack] [data-status]').innerText(), 'FAIL')
  await plate('dry-stack.png')

  await page.getByLabel('工况', { exact: true }).selectOption('cryo')
  await openTools('存取与分享')
  const getJson = async () => {
    const event = page.waitForEvent('download')
    await button('导出 JSON').click()
    return readFile(await (await event).path(), 'utf8')
  }
  const config = await getJson()
  const input = sheet.getByLabel('蓝图 JSON 文件')
  await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') })
  await sheet.getByRole('alert').waitFor()
  assert.deepEqual(JSON.parse(await getJson()), JSON.parse(config))
  await button('复制当前视角').click()
  const url = await sheet.getByLabel('视角链接', { exact: true }).inputValue()
  const eye = () => page.locator('canvas[data-eye]').getAttribute('data-eye').then(s => s.split(',').map(Number))
  const before = await eye()
  await button('恢复 v2.0 基准设计').click()
  assert.equal(await page.getByLabel('工况', { exact: true }).inputValue(), 'normal')
  await openTools('存取与分享')
  await sheet.getByLabel('蓝图 JSON 文件').setInputFiles({ name: 'ARS-01.json', mimeType: 'application/json', buffer: Buffer.from(config) })
  await page.waitForSelector('.hud[data-scenario=cryo]')
  await page.reload()
  await ready()
  await openTools('存取与分享')
  assert.deepEqual(JSON.parse(await getJson()), JSON.parse(config))
  await button('恢复 v2.0 基准设计').click()
  await page.goto(url)
  await ready('floorOrbit')
  await page.waitForSelector('.hud[data-scenario=cryo]')
  const after = await eye()
  assert.ok(Math.hypot(...after.map((x, i) => x - before[i])) < 0.003, '深链接镜头偏离 ' + before + ' / ' + after)
  await openTools('存取与分享')
  assert.deepEqual(JSON.parse(await getJson()), JSON.parse(config))
  await button('恢复 v2.0 基准设计').click()
  console.log('四类安装、湿压干、异常导入、文件往返、自动保存、深链接还原通过')

  await page.keyboard.press('3')
  await ready('plan')
  await openTools('两点测距')
  await button('开始测距').click()
  for (const [x, y] of [[635, 410], [740, 450], [650, 480], [710, 500]]) await page.mouse.click(x, y)
  await sheet.locator('output').filter({ hasText: /第 2 段.*mm/ }).waitFor()
  await button('清除标尺').click()
  assert.equal(await sheet.locator('output').innerText(), '')
  await button('结束测距').click()
  await button('关闭蓝图工具').click()
  await reviewMeasurement(page, () => plate('measure-plan.png'))
  await page.setViewportSize({ width: 390, height: 844 })
  await checkRuler(true)
  await openTools('房间模块')
  const fits = await sheet.evaluate(el => {
    const r = el.getBoundingClientRect()
    return r.top >= Math.max(innerHeight / 2, document.querySelector('.view-tools').getBoundingClientRect().bottom) &&
      r.bottom <= document.querySelector('.rail').getBoundingClientRect().top &&
      r.left >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1 &&
      document.documentElement.scrollWidth === innerWidth
  })
  assert.ok(fits, '手机蓝图面板与标高尺或上方工具冲突')
  await plate('narrow-b4.png')
}
