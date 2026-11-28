import { ADIT, BUFFER_DEPTH, DATUM, FLOORS, GRID, SHAFTS, SLAB } from '../data/floors'
import type { FloorId, GridBounds, Point3 } from '../types/shelter'

export const WALK_EYE_HEIGHT = 1.65
export const altitude = (y: number) => DATUM + y
export const getFloorElevation = (id: FloorId) => FLOORS[id].elevation

/** Grid indices refer to cell centres; fractional indices also locate boundaries. */
export function gridToWorld(gx: number, gz: number, id: FloorId, offsetY = 0): Point3 {
  return [
    (gx - (GRID.columns - 1) / 2) * GRID.cell,
    getFloorElevation(id) + offsetY,
    (gz - (GRID.rows - 1) / 2) * GRID.cell,
  ]
}

export function worldToGrid(x: number, z: number) {
  return { gx: Math.floor(x / GRID.cell + GRID.columns / 2), gz: Math.floor(z / GRID.cell + GRID.rows / 2) }
}

export function footprint(b: GridBounds) {
  const [x0, , z0] = gridToWorld(b.gx0 - 0.5, b.gz0 - 0.5, 'L1')
  const [x1, , z1] = gridToWorld(b.gx1 + 0.5, b.gz1 + 0.5, 'L1')
  return {
    x0,
    x1,
    z0,
    z1,
    x: (x0 + x1) / 2,
    z: (z0 + z1) / 2,
    w: x1 - x0,
    d: z1 - z0,
    area: (x1 - x0) * (z1 - z0),
  }
}

export function floorSection(id: FloorId) {
  const f = FLOORS[id]
  const y = getFloorElevation(id)
  return {
    slabBottom: y - SLAB,
    floor: y,
    ceiling: y + f.clearHeight,
    plenumTop: y + f.pitch - SLAB,
    cap: y + f.pitch,
  }
}

export const buffer = { bottom: -BUFFER_DEPTH, interfaceY: -SLAB - 1.5, top: -SLAB }
export const shaftPlans = SHAFTS.map((shaft) => ({ ...shaft, ...footprint(shaft.bounds) }))
export const shaftsAt = (elevation: number) =>
  shaftPlans.filter(
    (s) => elevation >= getFloorElevation('B4') - 1e-6 && elevation <= getFloorElevation(s.topFloor) + 1e-6,
  )
export const undergroundPlan = footprint(FLOORS.B1.bounds)
export const aditCentreZ = gridToWorld(0, ADIT.gz, ADIT.floorId)[2]
