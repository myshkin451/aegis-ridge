import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Instruments } from '../src/ui/Instruments'
import { FortressStatus } from '../src/ui/FortressStatus'
import { useShelterStore } from '../src/store/useShelterStore'
import { elevatorSpecs } from '../src/geometry/elevators'

it('opens with four camera modes, three scenarios, and the public controls', () => {
  const html = renderToStaticMarkup(createElement(Instruments))
  expect(html).toContain('磐石山脊 · 私人高山堡垒')
  for (const label of ['外景', '剖面', '平面', '漫游', '日常晴天', '极寒暴雪', '全面封锁', '24 小时时间轴', '分享视角', '拍照'])
    expect(html).toContain(label)
  expect(html.match(/<sup>/g)).toHaveLength(4)
  expect(html).not.toMatch(/工程体检|蓝图工具|隔离检修|专家团|线型图例/)
})

it('shows five operating summaries and explains the basis of the stores estimate', () => {
  const html = renderToStaticMarkup(createElement(FortressStatus, { close() {} }))
  expect(html.match(/<dt>/g)).toHaveLength(5)
  expect(html).toContain('8 人消耗估算')
  expect(html).toContain('日常值守')
  expect(html).not.toMatch(/NaN|Infinity|FAIL/)
})

it('places a direct arrival outside the correct car, facing its actual landing door', () => {
  const original = useShelterStore.getState()
  try {
    original.enterLobby('freight', 'L2')
    expect(useShelterStore.getState()).toBe(original)
    for (const id of ['passenger', 'freight'] as const) {
      const spec = elevatorSpecs[id]
      for (const floor of spec.stops) {
        original.enterLobby(id, floor)
        const view = useShelterStore.getState()
        expect(view).toMatchObject({ lastFloor: floor, floor, cameraState: 'walkthrough' })
        expect(view.landing?.[0]).toBe(spec.x)
        expect(view.landing![2]).toBeGreaterThan(spec.front)
        expect(view.landingTarget?.[2]).toBe(spec.front)
      }
    }
  } finally { useShelterStore.setState(original, true) }
})
