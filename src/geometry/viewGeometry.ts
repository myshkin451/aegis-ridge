import { FLOORS, FLOOR_ORDER, GRID } from '../data/floors'
import { buffer, floorSection, footprint, getFloorElevation, undergroundPlan } from './coords'
import type { BoxFace, FloorId } from '../types/shelter'
import { defaultBlueprint } from '../data/defaultBlueprint'

export const rulerTop = floorSection('L2').cap
export const rulerBottom = floorSection('B4').slabBottom
export const rulerFraction = (y: number) => (rulerTop - y) / (rulerTop - rulerBottom)
export const floorAt = (y: number) => FLOOR_ORDER.find((id) => y >= FLOORS[id].elevation - 0.02) ?? 'B4'
export function roomAt(floor: FloorId, x: number, z: number) {
  return defaultBlueprint.rooms.find((room) => {
    if (room.floorId !== floor) return false
    const r = footprint(room.bounds)
    return x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1
  })
}

export type SectionBounds = Record<BoxFace, number>
export const boxLimits: SectionBounds = {
  west: undergroundPlan.x0 - GRID.cell,
  east: undergroundPlan.x1 + GRID.cell,
  bottom: rulerBottom - 0.2,
  top: rulerTop + 6,
  north: undergroundPlan.z0 - GRID.cell,
  south: undergroundPlan.z1 + GRID.cell,
}
export const defaultBox: SectionBounds = { ...boxLimits, east: 12, south: 6, top: getFloorElevation('L2') }
const opposite: Record<BoxFace, BoxFace> = {
  west: 'east',
  east: 'west',
  bottom: 'top',
  top: 'bottom',
  north: 'south',
  south: 'north',
}
const heights = FLOOR_ORDER.flatMap((id) => Object.values(floorSection(id))).concat(Object.values(buffer))
export function moveFace(box: SectionBounds, face: BoxFace, world: number): SectionBounds {
  const vertical = face === 'bottom' || face === 'top'
  const nearest = vertical
    ? heights.reduce((a, b) => (Math.abs(a - world) < Math.abs(b - world) ? a : b))
    : Math.round(world / GRID.cell) * GRID.cell
  const snapped = Math.abs(nearest - world) < 0.3 ? nearest : world
  const low = ['west', 'bottom', 'north'].includes(face)
  const min = low ? boxLimits[face] : box[opposite[face]] + 0.3
  const max = low ? box[opposite[face]] - 0.3 : boxLimits[face]
  return { ...box, [face]: Math.max(min, Math.min(max, snapped)) }
}
