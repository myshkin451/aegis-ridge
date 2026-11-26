import { gridRect } from '../data/floors'
import { footprint } from './coords'
import type { RoomInstance } from '../types/shelter'

export const atriumBounds = gridRect(1, 2, 7, 9)
export const atriumFootprint = footprint(atriumBounds)
type Rect = Pick<typeof atriumFootprint, 'x0' | 'x1' | 'z0' | 'z1'>

export function clipZSpan(x: number, z0: number, z1: number, openings: Rect[]): [number, number][] {
  let spans: [number, number][] = [[z0, z1]]
  for (const opening of openings) {
    if (x <= opening.x0 || x >= opening.x1) continue
    spans = spans
      .flatMap(
        ([lo, hi]) =>
          [
            [lo, Math.min(hi, opening.z0)],
            [Math.max(lo, opening.z1), hi],
          ] as [number, number][],
      )
      .filter(([lo, hi]) => hi > lo)
  }
  return spans
}

export function clearCeilingPatches(room: RoomInstance) {
  const r = footprint(room.bounds)
  if (room.id !== 'b3_hydroponics') return [r]
  const a = atriumFootprint
  return [
    [r.x0, a.x0, r.z0, r.z1],
    [a.x1, r.x1, r.z0, r.z1],
    [a.x0, a.x1, r.z0, a.z0],
    [a.x0, a.x1, a.z1, r.z1],
  ].map(([x0, x1, z0, z1]) => ({
    x: (x0 + x1) / 2,
    z: (z0 + z1) / 2,
    w: x1 - x0,
    d: z1 - z0,
  }))
}
