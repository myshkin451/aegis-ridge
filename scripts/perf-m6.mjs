export async function measureM6(page, measure) {
  const button = name => page.getByRole('button', { name, exact: true })
  const sheet = page.getByRole('region', { name: '蓝图工具', exact: true })
  await button('蓝图工具').click()
  for (const [room, template] of [
    ['b1_gym', 'battery-bank'], ['b1_gym', 'materials-recovery'],
    ['b2_library', 'listening-room'], ['b3_foodproc', 'staple-farm'], ['b1_tactical', 'staple-farm'],
  ]) {
    await sheet.getByLabel('安装位置').selectOption(room)
    await sheet.getByLabel('替换为').selectOption(template)
    await measure('M6 模块安装 ' + room + '/' + template, async () => {
      await button('应用模块').click()
      await page.waitForSelector('canvas[data-ready=settled][data-view=floorOrbit]')
      const status = await sheet.locator('[data-check=dry-stack] [data-status]').textContent()
      if (status !== (room === 'b1_tactical' ? 'FAIL' : 'PASS')) throw Error('干湿分区实算异常 ' + room)
    })
  }
  await button('存取与分享').click()
  await measure('M6 保存视角与恢复基准', async () => {
    await button('复制当前视角').click()
    await sheet.getByLabel('视角链接', { exact: true }).waitFor()
    await button('恢复 v2.0 基准设计').click()
    await page.waitForSelector('canvas[data-ready=settled][data-view=site]')
  })
  await page.keyboard.press('3')
  await page.waitForSelector('canvas[data-ready=settled][data-view=plan]')
  await button('两点测距').click()
  await measure('M6 连续测量及清除', async () => {
    await button('开始测距').click()
    const {width:w,height:h} = page.viewportSize()
    for (const [x,y] of [[.46,.46],[.51,.50],[.47,.53],[.50,.52]]) await page.mouse.click(w*x,h*y)
    await sheet.locator('output').filter({ hasText: /第 2 段.*mm/ }).waitFor()
    await button('清除标尺').click()
    await button('结束测距').click()
  })
  await button('关闭蓝图工具').click()
}
