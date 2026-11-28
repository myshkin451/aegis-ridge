import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { BRANCH_CORRIDOR, CORRIDOR, FLOORS, FLOOR_ORDER, SLAB } from '../data/floors'
import { openingsAlong } from '../geometry/doors'
import { useShelterStore } from '../store/useShelterStore'
import type { UndergroundId } from '../types/shelter'
import {
  floorSection,
  footprint,
  getFloorElevation,
  undergroundPlan as plan,
} from '../geometry/coords'
import { ModelBuilder } from './utils/modelBuilder'
import { CorridorFixtures, RoomInteriors, WalkCeiling } from './rooms/RoomInteriors'
import { atriumFootprint, clipZSpan } from '../geometry/atrium'
import { Model } from './utils/Model'
import { insideCommons, seesUpperShaft } from './rooms/commonsVisibility'
import {
  addSlab,
  elevatorThresholds,
  closedDoors,
  iBeam,
  roomStructure,
  shaftFrames,
  stairStructure,
  steel,
  trim,
} from './utils/shellGeometry'

export function structure(id: UndergroundId) {
  const m = new ModelBuilder(),
    route = footprint(CORRIDOR)
  addSlab(m, id)
  roomStructure(m, id)
  for (const r of [route, footprint(BRANCH_CORRIDOR)])
    m.box('#707b7d', [r.x, 0.004, r.z], [r.w, 0.024, r.d], id === 'B4' ? 'grate' : 'epoxy')
  for (const z of [route.z0 + 0.14, route.z1 - 0.14])
    m.decalBox('#d0b286', [route.x, 0.0205, z], [route.w - 0.2, 0.001, 0.055], 'epoxy')
  // Drainage grate sits outside the circulation strip, just inside the perimeter.
  for (const z of [plan.z0 + 0.13, plan.z1 - 0.13]) {
    m.box(steel, [plan.x, 0.022, z], [plan.w - 0.18, 0.035, 0.18], 'steel')
    for (let x = plan.x0 + 0.25; x < plan.x1; x += 0.35)
      m.box(trim, [x, 0.046, z], [0.038, 0.024, 0.17], 'steel')
  }
  for (const x of [plan.x0 + 0.12, plan.x1 - 0.12])
    for (const [za, zb] of [
      [plan.z0 + 0.22, route.z0],
      [route.z1, plan.z1 - 0.22],
    ])
      m.box(steel, [x, 0.022, (za + zb) / 2], [0.16, 0.035, zb - za], 'steel')
  return m
}

export function verticalCore(id: UndergroundId) {
  const m = new ModelBuilder()
  shaftFrames(m, 0, FLOORS[id].pitch, id === 'B4' ? 'B3' : id === 'B3' ? 'B2' : id === 'B2' ? 'B1' : 'L1')
  stairStructure(m, id, 0, -Infinity, FLOORS[id].pitch)
  elevatorThresholds(m, id)
  return m
}

export function enclosure(id: UndergroundId, side: 'rear' | 'front' | 'wire') {
  const m = new ModelBuilder(),
    h = FLOORS[id].pitch - SLAB
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
  function flank(axisX: number, step: number) {
    const x = axisX + step
    let cursor = plan.z0 + 0.2
    const zEnd = plan.z1 - 0.2
    for (const opening of openingsAlong(id, 'z', axisX, cursor, zEnd)) {
      const z = opening.base[2],
        start = z - opening.width / 2,
        end = z + opening.width / 2
      wall(x, cursor, x, start)
      wall(x, start, x, end, opening.height)
      cursor = end
    }
    wall(x, cursor, x, zEnd)
  }
  if (side !== 'front') {
    wall(plan.x0, plan.z0 + 0.1, plan.x1, plan.z0 + 0.1)
    flank(plan.x1, -0.1)
  }
  if (side !== 'rear') {
    wall(plan.x0, plan.z1 - 0.1, plan.x1, plan.z1 - 0.1)
    flank(plan.x0, 0.1)
  }
  return m
}

function plenumFrame(id: UndergroundId) {
  const m = new ModelBuilder(),
    s = floorSection(id),
    low = s.ceiling - s.floor,
    high = s.plenumTop - s.floor
  const corridor = footprint(CORRIDOR)
  // The corridor service void carries a sheet-metal trunk and two insulated supply lines.
  const trunkY = (low + high) / 2
  m.box('#788181', [corridor.x, trunkY, corridor.z - 0.48], [corridor.w - 0.5, 0.29, 0.5], 'steel')
  for (const z of [corridor.z + 0.32, corridor.z + 0.6])
    m.part('round', 'steel', '#535e60', [corridor.x, trunkY, z], [0.15, corridor.w - 0.5, 0.15], [0, 0, Math.PI / 2])
  for (let x = corridor.x0 + 1; x < corridor.x1 - 0.6; x += 2.4)
    m.box('#454f51', [x, trunkY, corridor.z - 0.48], [0.045, 0.32, 0.53], 'steel')
  for (const z of [plan.z0 + 0.18, plan.z1 - 0.18]) {
    iBeam(m, 0, high - 0.14, z, plan.w, true, 0.24)
    const edgeLow = id === 'B2' ? 3.6 : low
    m.box('#718087', [0, edgeLow + 0.05, z], [plan.w, 0.1, 0.12], 'steel')
    for (let x = plan.x0 + 0.3; x < plan.x1; x += 3.9)
      m.box(trim, [x, (edgeLow + high) / 2, z], [0.085, high - edgeLow, 0.09], 'steel')
  }
  for (const x of [plan.x0 + 0.25, plan.x1 - 0.25])
    for (const [a, b] of [
      [plan.z0, corridor.z0],
      [corridor.z1, plan.z1],
    ])
      iBeam(m, x, high - 0.15, (a + b) / 2, b - a, false, 0.22)
  for (let x = plan.x0 + 2; x < plan.x1; x += 4) {
    const holes =
      id === 'B3'
        ? [{ ...atriumFootprint, x0: atriumFootprint.x0 - 0.09, x1: atriumFootprint.x1 + 0.09 }]
        : []
    for (const [a, b] of clipZSpan(x, corridor.z1, plan.z1, holes))
      iBeam(m, x, high - 0.17, (a + b) / 2, b - a, false, 0.21)
    // The northern joists terminate before the four adjacent core openings.
    iBeam(m, x, high - 0.17, plan.z0 + 2.8, 5.6, false, 0.21)
  }
  return m
}

export function FloorSliceGroup({ id }: { id: UndergroundId }) {
  const floor = useShelterStore((s) => s.floor),
    mode = useShelterStore((s) => s.mode),
    plenum = useShelterStore((s) => s.plenum)
  const view = useShelterStore((s) => s.cameraState)
  const walk = view === 'walkthrough'
  const shellOrder = walk && id === 'B2' && floor === id ? -2 : 0
  const seen = walk || floor === 'ALL' || FLOOR_ORDER.indexOf(id) >= FLOOR_ORDER.indexOf(floor)
  const builders = useMemo(
    () => ({
      frame: () => structure(id),
      rear: () => enclosure(id, 'rear'),
      front: () => enclosure(id, 'front'),
      wire: () => enclosure(id, 'wire'),
      plenum: () => plenumFrame(id),
      core: () => verticalCore(id),
      leaves: () => closedDoors(id),
    }),
    [id],
  )
  const floorGroup = useRef<Group>(null)
  const upperContents = useRef<Group>(null)
  useFrame(({ camera }) => {
    if (!floorGroup.current) return
    if (upperContents.current && id === 'B1')
      upperContents.current.visible = !walk || floor !== 'B2' ||
        !insideCommons(camera.position) || seesUpperShaft(camera.position)
    if (walk && floor !== 'ALL') {
      const closeToEye = Math.abs(camera.position.y - getFloorElevation(id) - 1.65) < 5.8
      floorGroup.current.visible = closeToEye || Math.abs(FLOOR_ORDER.indexOf(id) - FLOOR_ORDER.indexOf(floor)) <= 1
    }
  })
  const closed = mode !== 'xray' && (floor === 'ALL' || walk)
  const delayMs = (FLOOR_ORDER.indexOf(id) - FLOOR_ORDER.indexOf('B1')) * 40
  return (
    <group
      ref={floorGroup}
      name={id}
      position-y={getFloorElevation(id)}
      visible={
        walk && floor !== 'ALL'
          ? Math.abs(FLOOR_ORDER.indexOf(id) - FLOOR_ORDER.indexOf(floor)) <= 1
          : !(mode === 'exterior' && floor === 'ALL')
      }
    >
      <Model
        build={builders.frame}
        delayMs={delayMs}
        opacity={seen ? (mode === 'xray' ? 0.065 : 1) : 0}
        opaqueOrder={shellOrder}
      />
      <group ref={upperContents}>
        <group visible={seen && mode !== 'xray'}>
          <CorridorFixtures id={id} />
          <RoomInteriors id={id} />
        </group>
        <group visible={walk}>
          <WalkCeiling id={id} />
        </group>
        <group visible={seen && mode !== 'xray' && !walk} userData={{ skipWalk: true }}>
          <Model build={builders.leaves} interior />
        </group>
        <Model build={builders.core} delayMs={delayMs} opacity={seen ? (mode === 'xray' ? 0.43 : 1) : 0} />
        <Model
          build={builders.rear}
          delayMs={delayMs}
          opacity={Number(seen && mode !== 'xray')}
          opaqueOrder={shellOrder}
        />
        <Model
          build={builders.front}
          delayMs={delayMs}
          opacity={Number(seen && closed)}
          opaqueOrder={shellOrder}
        />
        <Model build={builders.wire} delayMs={delayMs} opacity={seen && mode === 'xray' ? 0.12 : 0} />
        <Model
          build={builders.plenum}
          delayMs={delayMs}
          opacity={seen && (plenum || (floor !== 'ALL' && floor !== id)) ? (mode === 'xray' ? 0.09 : 1) : 0}
        />
      </group>
    </group>
  )
}
