import { expect, it } from 'vitest'
import { defaultBlueprint } from '../src/data/defaultBlueprint'
import { fortressSupply } from '../src/data/fortressSupply'

it('covers six to eight residents with either one duty generator or sealed battery power', () => {
  for (const people of [6, 7, 8]) for (const hour of [0, 12, 20]) {
    for (const scenario of ['normal', 'cryo', 'fallout']) {
      const state = fortressSupply(scenario, people, hour, true)
      expect(state.demandKw).toBeGreaterThanOrEqual(15)
      expect(state.demandKw).toBeLessThanOrEqual(25)
      expect(state.availableKw).toBeGreaterThan(state.demandKw)
      expect(state.batteryMode).toBe(scenario === 'fallout')
      expect(state.batteryHours * state.demandKw).toBeCloseTo(state.batteryKwh * 0.8 * 0.95)
    }
  }
  expect(fortressSupply('fallout', 8, 12, false).batteryMode).toBe(false)
})

it('derives grain years from both installed stores and resident count', () => {
  const atEight = fortressSupply('normal', 8, 12, false)
  const withoutWarehouse = defaultBlueprint.rooms.filter(room => room.id !== 'b1_warehouse')
  expect(atEight.grainKg).toBe(2 * 32 * 40 + 24 * 165)
  expect(fortressSupply('normal', 8, 12, false, withoutWarehouse).grainKg).toBe(24 * 165)
  expect(fortressSupply('normal', 6, 12, false).grainYears).toBeCloseTo(atEight.grainYears * 8 / 6)
})
