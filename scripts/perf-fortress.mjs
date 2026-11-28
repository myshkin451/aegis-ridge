// Drive the same doors, car buttons, and time controls as a first-time visitor.
export async function exerciseFortress(page, measure) {
  const button = name => page.getByRole('button', { name, exact: true })
  const wait = ms => page.waitForTimeout(ms)
  const feet = () => page.locator('canvas').getAttribute('data-feet').then(s => s.split(',').map(Number))
  const walk = async (key, ms) => {
    await page.keyboard.down(key)
    try { await wait(ms) } finally { await page.keyboard.up(key) }
  }
  await button('外景 1').click()
  await page.waitForSelector('canvas[data-view=site][data-ready=settled]')
  await measure('堡垒状态与默认界面', async () => {
    await button('堡垒状态').click()
    const status = page.getByRole('region', { name: '堡垒状态' })
    if (await status.locator('dt').count() !== 5) throw Error('堡垒状态缺少系统读数')
    if (await page.getByText(/模拟隔离检修|工程体检|蓝图工具|专家团/).count()) throw Error('旧工程界面仍在默认视图')
    await button('关闭堡垒状态').click()
  })
  for (const scenario of ['cryo', 'fallout']) {
    await measure(scenario === 'cryo' ? '暴雪防护 30 秒' : '全面封锁 30 秒', async () => {
      const start = Date.now()
      await page.getByLabel('情景', { exact: true }).selectOption(scenario)
      await page.waitForSelector('.hud[data-lockdown=running]')
      await page.waitForSelector('.hud[data-lockdown=sealed]', { timeout: 36000 })
      if (Date.now() - start < 29500) throw Error('未完成完整封锁动画')
      if (await page.locator('canvas').getAttribute('data-lighting-circuit') !== 'emergency')
        throw Error('应急照明未就位')
    })
  }
  await measure('堡垒封锁稳态', () => wait(2800))
  await page.getByLabel('情景', { exact: true }).selectOption('normal')
  for (const [id, hall, count, first, last, y] of [
    ['passenger', /客梯厅$/, 6, 'L2', 'B4', -22.8],
    ['freight', /^L1 货梯厅$/, 5, 'B4', 'L1', 0],
  ]) {
    const cabin = page.locator('.car-panel[data-elevator="' + id + '"]')
    await measure((id === 'passenger' ? '客梯厅' : 'L1 货梯厅') + ' · 呼梯与步入', async () => {
      await button('房间直达').click()
      await page.getByRole('button', { name: hall }).click()
      await page.waitForSelector('canvas[data-view=walkthrough][data-ready=settled]')
      await page.keyboard.down('w')
      try { await cabin.waitFor({ timeout: 28000 }); await wait(170) }
      finally { await page.keyboard.up('w') }
      if (await cabin.getByRole('button').count() !== count) throw Error(id + ' 停靠层数不符')
    })
    for (const floor of [first, last]) {
      await measure(id + ' · 乘至 ' + floor, async () => {
        const before = await feet()
        await cabin.getByRole('button', { name: floor, exact: true }).click()
        await page.waitForSelector('.car-panel[data-phase=moving]')
        await wait(1500)
        const middle = await feet()
        if (Math.abs(before[1] - middle[1]) < 0.5 || Math.hypot(before[0]-middle[0], before[2]-middle[2]) > 0.06)
          throw Error('乘客未随轿厢升降')
        await page.waitForSelector('.car-panel[data-phase=open][data-stop="' + floor + '"]')
        if (!(await page.locator('.walk-map').innerText()).includes(floor)) throw Error('到站楼层未同步')
      })
    }
    await measure(id + ' · 出梯', async () => {
      await walk('s', 2750)
      if (await cabin.count()) throw Error('无法退出轿厢')
      const p = await feet()
      if (Math.abs(p[1]-y) > 0.12 || p[2] < -1.8) throw Error('下客未落在目标楼层 ' + p.join(', '))
    })
  }
}
