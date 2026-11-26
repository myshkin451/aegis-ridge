import { expect, it } from 'vitest'
import { FLOORS, UNDERGROUND } from '../data/floors'
import { shaftPlans } from './coords'
import { stairRun } from './stairs'
import type { StairPlate } from './stairs'

it.each(['personnel', 'escape'] as const)(
  '%s fits the shaft, lands at floor level and clears the returning flight',
  (kind) => {
    const s = shaftPlans.find((s) => s.id === kind)!
    const plates: StairPlate[] = []
    for (const id of [...UNDERGROUND, 'L1', 'L2'] as const) {
      const run = stairRun(kind, id)
      if (!run) continue
      expect(run.riser).toBeLessThanOrEqual(0.17)
      expect(Math.min(...run.treads)).toBeGreaterThanOrEqual(0.28)
      expect(run.rise + FLOORS[id].elevation).toBeCloseTo(FLOORS[run.above].elevation)
      if (kind === 'personnel') expect(run.width).toBeGreaterThanOrEqual(1.1)
      for (const step of run.plates) {
        const [x, y, z] = step.centre,
          [w, t, d] = step.size
        expect(x - w / 2).toBeGreaterThanOrEqual(s.x0 - 1e-6)
        expect(x + w / 2).toBeLessThanOrEqual((kind === 'personnel' ? s.x1 - 1.68 : s.x1) + 1e-6)
        expect(z - d / 2).toBeGreaterThanOrEqual(s.z0 - 1e-6)
        expect(z + d / 2).toBeLessThanOrEqual(s.z1 + 1e-6)
        expect(y + t / 2).toBeGreaterThanOrEqual(-1e-7)
        plates.push({ ...step, centre: [x, y + FLOORS[id].elevation, z] })
      }
    }
    for (const a of plates)
      for (const b of plates) {
        const dy = b.centre[1] - a.centre[1]
        if (dy < 1e-6) continue
        if ([0, 2].every((i) => Math.abs(a.centre[i] - b.centre[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6))
          expect(dy - (a.size[1] + b.size[1]) / 2).toBeGreaterThanOrEqual(2.0)
      }
  },
)
it('terminates the eastern flight at B1 and the main flight at L2', () => {
  expect(stairRun('escape', 'B2')?.above).toBe('B1')
  for (const id of ['B1', 'L1', 'L2'] as const) expect(stairRun('escape', id)).toBeUndefined()
  expect(stairRun('personnel', 'L1')?.above).toBe('L2')
  expect(stairRun('personnel', 'L2')).toBeUndefined()
})
