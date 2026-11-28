import { afterEach, describe, expect, it } from 'vitest'
import { useOperationsStore as operations } from './useOperationsStore'
import { useShelterStore as view } from './useShelterStore'

afterEach(() => {
  view.setState(view.getInitialState(), true)
  operations.setState(operations.getInitialState(), true)
})

describe('operating controls and the engine share a single clock', () => {
  it('prelocks exhaust at the start and switches heat and water to closed operation at 30 s', () => {
    operations.getState().setScenario('fallout')
    const start = operations.getState().lockdownStartedAt!
    operations.getState().advance(start + 29_999)
    expect(operations.getState().report.feasibility.chpInterlocked).toBe(true)
    expect(operations.getState().report.feasibility.sealed).toBe(false)
    operations.getState().advance(start + 30_000)
    expect(operations.getState().lockdownStartedAt).toBeNull()
    expect(operations.getState().report.feasibility.externalWater).toBe(0)
    expect(operations.getState().report.feasibility.sealed).toBe(true)
  })
  it('fast-forwards, replays and resets the same scenario without losing the occupancy', () => {
    operations.getState().setPeople(14)
    operations.getState().setScenario('bio')
    operations.getState().skip()
    const full = operations.getState().report.feasibility
    expect(full.sealed).toBe(true)
    expect(full.oxygenDemand).toBeCloseTo(11.76)
    operations.getState().setScenario('bio')
    expect(operations.getState().lockdownSeconds).toBe(0)
    expect(operations.getState().report.feasibility.sealed).toBe(false)
    operations.getState().setScenario('normal')
    expect(operations.getState().lockdownStartedAt).toBeNull()
    expect(operations.getState().report.feasibility.chpInterlocked).toBe(false)
    expect(operations.getState().people).toBe(14)
  })
  it('restores the ordinary floor, X-ray and section-box views after a route overview', () => {
    const path: [number, number, number][] = [
      [2, -10, 0],
      [-4, -14.2, -1],
    ]
    view.getState().frameRoute(path)
    expect(view.getState().routeOverview).toBe(true)
    expect(view.getState().surveyFocus?.height).toBe(48)
    operations.getState().isolate(null)
    expect(view.getState()).toMatchObject({
      routeOverview: false,
      cameraState: 'floorOrbit',
      mode: 'cutaway',
    })
    view.getState().frameRoute(path)
    view.getState().photograph('shot-04')
    expect(view.getState()).toMatchObject({ routeOverview: false, mode: 'xray', shot: 'shot-04' })
    view.getState().frameRoute(path)
    view.getState().setView('sectionBox')
    expect(view.getState()).toMatchObject({
      routeOverview: false,
      cameraState: 'sectionBox',
      mode: 'cutaway',
    })
  })
  it('keeps the calibrated extreme-cold camera and its actual operating condition in sync', () => {
    operations.getState().setScenario('fallout')
    operations.getState().skip()
    view.getState().photograph('shot-03')
    expect(operations.getState().scenario).toBe('cryo')
    expect(view.getState().shot).toBe('shot-03')
    expect(operations.getState().lockdownSeconds).toBe(0)
    view.getState().photograph('shot-02')
    expect(operations.getState().scenario).toBe('normal')
  })
})
