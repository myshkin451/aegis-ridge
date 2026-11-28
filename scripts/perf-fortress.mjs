// Board by walking through the real door, check the ride at an intermediate height,
// then step back into the target hall. No direct manipulation of simulation state.
export async function ride(page, id) {
  const passenger = id === 'passenger'
  await page.getByRole('button', { name: '房间直达', exact: true }).click()
  await page.getByRole('button', { name: passenger ? /客梯厅$/ : /^L1 货梯厅$/ }).click()
  await page.waitForSelector('canvas[data-view=walkthrough][data-ready=settled]')
  const car = page.locator('.car-panel[data-elevator="' + id + '"]')
  const feet = async () => (await page.locator('canvas').getAttribute('data-feet')).split(',').map(Number)
  await page.keyboard.down('w')
  try { await car.waitFor(); await page.waitForTimeout(180) } finally { await page.keyboard.up('w') }
  if (await car.getByRole('button').count() !== (passenger ? 6 : 5)) throw Error('停靠层数错误 ' + id)
  const stop = await car.getAttribute('data-stop') === 'B4' ? (passenger ? 'L2' : 'L1') : 'B4'
  const before = await feet()
  await car.getByRole('button', { name: stop, exact: true }).click()
  await page.waitForSelector('.car-panel[data-phase=moving]')
  await page.waitForTimeout(1100)
  const mid = await feet()
  if (Math.abs(mid[1]-before[1]) < .4 || Math.hypot(mid[0]-before[0],mid[2]-before[2]) > .06)
    throw Error('乘客未同步移动 ' + id)
  await page.waitForSelector('.car-panel[data-phase=open][data-stop="' + stop + '"]')
  if (!(await page.locator('.walk-map').innerText()).includes(stop)) throw Error('到站楼层未同步')
  await page.keyboard.down('s')
  try { await page.waitForTimeout(2750) } finally { await page.keyboard.up('s') }
  if (await car.count()) throw Error('乘客未离开轿厢')
  const position = await feet()
  if (Math.abs(position[1] - ({ L2: 4.4, L1: 0, B4: -22.8 }[stop])) > .12 || position[2] < -1.8)
    throw Error('下客位置错误 ' + position)
}
