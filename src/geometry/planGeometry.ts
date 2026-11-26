import polygonClipping from 'polygon-clipping'
import type { Polygon, Ring } from 'polygon-clipping'
import { footprint, shaftsAt } from './coords'
import { FLOORS } from '../data/floors'
import { atriumFootprint } from './atrium'
import type { GridBounds } from '../types/shelter'

export function rectangle(x0: number, x1: number, z0: number, z1: number): Polygon {
  return [
    [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
      [x0, z0],
    ],
  ]
}

export function slabPlan(bounds: GridBounds, level: number) {
  const a = footprint(bounds)
  const holes = shaftsAt(level).map((s) => rectangle(s.x0, s.x1, s.z0, s.z1))
  if (level === FLOORS.B2.elevation) {
    const g = atriumFootprint
    holes.push(rectangle(g.x0, g.x1, g.z0, g.z1))
  }
  return polygonClipping.difference(rectangle(a.x0, a.x1, a.z0, a.z1), ...holes)
}

export function contains(ring: Ring, x: number, z: number) {
  let inside = false
  for (let i = 1; i < ring.length; i++) {
    const [ax, az] = ring[i - 1],
      [bx, bz] = ring[i]
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside
  }
  return inside
}
