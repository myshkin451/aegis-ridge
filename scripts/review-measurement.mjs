import assert from 'node:assert/strict'
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'

/** Drive only visible controls. Project surveyed metre coordinates through the camera from the share sheet. */
export async function reviewMeasurement(page, captureClearWidth) {
  const button = name => page.getByRole('button', { name, exact: true })
  const sheet = page.getByRole('region', { name: '蓝图工具', exact: true })
  const ready = view => page.waitForSelector(`canvas[data-ready=settled][data-rendered=true][data-view=${view}]`)
  const mark = async (x, y) => page.mouse.click(x, y)
  const output = sheet.locator('output')
  async function shareCamera() {
    if (!await sheet.isVisible()) await button('蓝图工具').click()
    await button('存取与分享').click()
    await button('复制当前视角').click()
    const url = await sheet.getByLabel('视角链接', { exact: true }).inputValue()
    const { pose } = JSON.parse(new URL(url).searchParams.get('ars')).view
    const box = await page.locator('canvas[data-view]').boundingBox()
    const aspect = box.width / box.height
    const cam = pose.projection === 'orthographic'
      ? new OrthographicCamera(-pose.height * aspect / 2, pose.height * aspect / 2, pose.height / 2, -pose.height / 2, .1, 15000)
      : new PerspectiveCamera(pose.fov, aspect, .1, 15000)
    cam.position.fromArray(pose.eye)
    cam.lookAt(...pose.target)
    cam.zoom = pose.zoom
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    return async world => {
      const p = new Vector3(...world).project(cam)
      await mark(box.x + (p.x + 1) * box.width / 2, box.y + (1 - p.y) * box.height / 2)
    }
  }
  async function begin(reference = 'physical') {
    await button('两点测距').click()
    await sheet.getByLabel('图纸吸附').selectOption(reference)
    if (await button('清除标尺').isEnabled()) await button('清除标尺').click()
    await button('开始测距').click()
  }
  async function checkPair(mm, capture) {
    await output.filter({ hasText: /第 1 段.*mm/ }).waitFor({ timeout: 7000 })
    const digits = (await output.innerText()).split('段')[1].replace(/[^0-9]/g, '')
    if (mm !== undefined) assert.equal(Number(digits), mm)
    else assert.ok(Number(digits) > 0)
    if (capture) await capture()
    await button('清除标尺').click()
    await button('结束测距').click()
  }
  await page.keyboard.press('3')
  await ready('plan')
  await page.locator('.floor-mark button').filter({ has: page.locator('b', { hasText: 'B2' }) }).click()
  await ready('plan')
  const planPoint = await shareCamera()
  await begin('grid')
  await planPoint([-8.8, -13.2, -2])
  await output.filter({ hasText: '起点' }).waitFor({ timeout: 7000 })
  await planPoint([-8.76, -13.2, .012])
  await checkPair(2000)
  // Across the quiet hall, two 150 mm acoustic walls reduce the 2 m axis spacing to 1.85 m.
  await begin()
  await planPoint([1.6, -13.2, 5.075])
  await output.filter({ hasText: '实墙面' }).waitFor({ timeout: 7000 })
  await planPoint([1.6, -13.2, 6.925])
  await checkPair(1850, captureClearWidth)
  await page.keyboard.press('2')
  await ready('section')
  const sectionPoint = await shareCamera()
  await begin('grid')
  await sectionPoint([-16, -14.4, -3.75])
  await sectionPoint([-16, -18.6, -3.75])
  await checkPair(4200)
  await button('关闭蓝图工具').click()
  await page.locator('.floor-mark button').filter({ has: page.locator('b', { hasText: 'B2' }) }).click()
  await ready('floorOrbit')
  const orbitPoint = await shareCamera()
  await begin()
  await orbitPoint([-4, -14.395, -1])
  await output.filter({ hasText: /起点 · (?!平面点|剖面点)/ }).waitFor({ timeout: 7000 })
  await orbitPoint([1.3, -14.395, -1])
  await checkPair()
  await button('开始测距').click()
  await button('关闭蓝图工具').click()
  await button('结束测距').click()
  assert.equal(await page.locator('canvas.measurement-overlay').count(), 0)
  console.log('实点测距通过：B2 主廊房界 2 000 mm、居住内廊实墙面净距 1 850 mm、剖面层高 4 200 mm、透视模型两点、关闭面板后结束测距')
}
