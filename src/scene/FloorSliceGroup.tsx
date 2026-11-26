import { useMemo } from 'react'
import { ADIT, CORRIDOR, FLOORS, FLOOR_ORDER, SLAB } from '../data/floors'
import { useShelterStore } from '../store/useShelterStore'
import type { UndergroundId } from '../types/shelter'
import {
  aditCentreZ,
  floorSection,
  footprint,
  getFloorElevation,
  undergroundPlan as plan,
} from './utils/coords'
import { ModelBuilder } from './utils/modelBuilder'
import { Model } from './utils/Model'
import { addSlab, iBeam, roomStructure, shaftFrames, steel, trim } from './utils/shellGeometry'

function structure(id: UndergroundId) {
  const m = new ModelBuilder(),
    route = footprint(CORRIDOR)
  addSlab(m, id)
  roomStructure(m, id)
  m.box('#707b7d', [route.x, 0.012, route.z], [route.w, 0.024, route.d])
  for (const z of [route.z0 + 0.14, route.z1 - 0.14])
    m.box('#d0b286', [route.x, 0.03, z], [route.w - 0.2, 0.018, 0.055], 'wood')
  // Drainage grate sits outside the circulation strip, just inside the perimeter.
  for (const z of [plan.z0 + 0.13, plan.z1 - 0.13]) {
    m.box(steel, [plan.x, 0.022, z], [plan.w - 0.18, 0.035, 0.18], 'steel')
    for (let x = plan.x0 + 0.25; x < plan.x1; x += 0.35)
      m.box(trim, [x, 0.046, z], [0.038, 0.024, 0.17], 'steel')
  }
  for (const x of [plan.x0 + 0.12, plan.x1 - 0.12])
    for (const [za, zb] of [
      [plan.z0, route.z0],
      [route.z1, plan.z1],
    ])
      m.box(steel, [x, 0.022, (za + zb) / 2], [0.16, 0.035, zb - za], 'steel')
  return m
}

function verticalCore(id: UndergroundId) {
  const m = new ModelBuilder()
  shaftFrames(m, -SLAB, FLOORS[id].pitch - SLAB)
  return m
}

function enclosure(id: UndergroundId, side: 'rear' | 'front' | 'wire') {
  const m = new ModelBuilder(),
    h = FLOORS[id].clearHeight
  const wall = (x0: number, z0: number, x1: number, z1: number, bottom = 0, top = h) => {
    const alongX = x1 !== x0
    if (side === 'wire') {
      for (const y of [bottom, top]) m.line([x0, y, z0], [x1, y, z1], '#bad5df')
      m.line([x0, bottom, z0], [x0, top, z0], '#b3c6cd')
      m.line([x1, bottom, z1], [x1, top, z1], '#b3c6cd')
      return
    }
    m.box(
      '#a7afae',
      [(x0 + x1) / 2, (bottom + top) / 2, (z0 + z1) / 2],
      [alongX ? x1 - x0 : 0.2, top - bottom, alongX ? 0.2 : z1 - z0],
    )
  }
  if (side !== 'front') {
    wall(plan.x0, plan.z0 + 0.1, plan.x1, plan.z0 + 0.1)
    const route = footprint(CORRIDOR)
    wall(plan.x1 - 0.1, plan.z0, plan.x1 - 0.1, route.z0)
    wall(plan.x1 - 0.1, route.z1, plan.x1 - 0.1, plan.z1)
  }
  if (side !== 'rear') {
    wall(plan.x0, plan.z1 - 0.1, plan.x1, plan.z1 - 0.1)
    const x = plan.x0 + 0.1
    if (id === ADIT.floorId) {
      wall(x, plan.z0, x, aditCentreZ - ADIT.width / 2)
      wall(x, aditCentreZ + ADIT.width / 2, x, plan.z1)
      wall(x, aditCentreZ - ADIT.width / 2, x, aditCentreZ + ADIT.width / 2, ADIT.height)
    } else wall(x, plan.z0, x, plan.z1)
  }
  return m
}

function plenumFrame(id: UndergroundId) {
  const m = new ModelBuilder(),
    s = floorSection(id),
    low = s.ceiling - s.floor,
    high = s.plenumTop - s.floor
  const corridor = footprint(CORRIDOR)
  iBeam(m, corridor.x, low + 0.18, corridor.z, corridor.w, true, 0.26)
  for (const z of [plan.z0 + 0.18, plan.z1 - 0.18]) {
    iBeam(m, 0, high - 0.14, z, plan.w, true, 0.24)
    m.box('#718087', [0, low + 0.05, z], [plan.w, 0.1, 0.12], 'steel')
    for (let x = plan.x0 + 0.3; x < plan.x1; x += 3.9)
      m.box(trim, [x, (low + high) / 2, z], [0.085, high - low, 0.09], 'steel')
  }
  for (const x of [plan.x0 + 0.25, plan.x1 - 0.25])
    for (const [a, b] of [
      [plan.z0, corridor.z0],
      [corridor.z1, plan.z1],
    ])
      iBeam(m, x, high - 0.15, (a + b) / 2, b - a, false, 0.22)
  for (let x = plan.x0 + 2; x < plan.x1; x += 4) {
    iBeam(m, x, high - 0.17, (corridor.z1 + plan.z1) / 2, plan.z1 - corridor.z1, false, 0.21)
    // The northern joists terminate before the four adjacent core openings.
    iBeam(m, x, high - 0.17, plan.z0 + 2.8, 5.6, false, 0.21)
  }
  return m
}

export function FloorSliceGroup({ id }: { id: UndergroundId }) {
  const floor = useShelterStore((s) => s.floor),
    mode = useShelterStore((s) => s.mode),
    plenum = useShelterStore((s) => s.plenum)
  const seen = floor === 'ALL' || FLOOR_ORDER.indexOf(id) >= FLOOR_ORDER.indexOf(floor)
  const builders = useMemo(
    () => ({
      frame: () => structure(id),
      rear: () => enclosure(id, 'rear'),
      front: () => enclosure(id, 'front'),
      wire: () => enclosure(id, 'wire'),
      plenum: () => plenumFrame(id),
      core: () => verticalCore(id),
    }),
    [id],
  )
  const closed = mode === 'exterior' && floor === 'ALL'
  return (
    <group name={id} position-y={getFloorElevation(id)}>
      <Model build={builders.frame} opacity={seen ? (mode === 'xray' ? 0.22 : 1) : 0} />
      <Model build={builders.core} opacity={Number(seen)} />
      <Model build={builders.rear} opacity={Number(seen && mode !== 'xray')} />
      <Model build={builders.front} opacity={Number(seen && closed)} />
      <Model build={builders.wire} opacity={seen && mode === 'xray' ? 0.12 : 0} />
      <Model
        build={builders.plenum}
        opacity={seen && (plenum || (floor !== 'ALL' && floor !== id)) ? (mode === 'xray' ? 0.3 : 1) : 0}
      />
    </group>
  )
}
