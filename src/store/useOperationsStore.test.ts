import { afterEach, describe, expect, it } from 'vitest'
import { useOperationsStore as operations } from './useOperationsStore'
import { useShelterStore as view } from './useShelterStore'

afterEach(() => {
  view.setState(view.getInitialState(), true)
  operations.setState(operations.getInitialState(), true)
})

describe('scenario and protection controls', () => {
  it.each(['fallout', 'cryo'] as const)('runs the full thirty-second closure for %s and reopens in daily mode', scenario => {
    const op = operations.getState()
    op.setScenario(scenario)
    const start = operations.getState().lockdownStartedAt!
    op.advance(start + 29_999)
    expect(operations.getState().lockdownSeconds).toBe(29)
    op.advance(start + 30_000)
    expect(operations.getState()).toMatchObject({ lockdownSeconds: 30, lockdownStartedAt: null })
    op.setScenario('normal')
    expect(operations.getState()).toMatchObject({ lockdownSeconds: 0, lockdownStartedAt: null })
  })
  it('keeps the calibrated extreme-cold camera and its actual operating condition in sync', () => {
    operations.getState().setScenario('fallout')
    operations.getState().skip()
    view.getState().photograph('shot-03')
    expect(operations.getState().scenario).toBe('cryo')
    expect(view.getState().shot).toBe('shot-03')
    expect(operations.getState().lockdownSeconds).toBe(30)
    view.getState().photograph('shot-02')
    expect(operations.getState().scenario).toBe('normal')
  })
})
