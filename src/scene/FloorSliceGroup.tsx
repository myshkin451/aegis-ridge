import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { ADIT, CORRIDOR, FLOORS, FLOOR_ORDER } from '../data/floors'
import { roomsOn } from '../data/defaultBlueprint'
import { adits } from '../data/siteFacilities'
import { useShelterStore } from '../store/useShelterStore'
import type { UndergroundId } from '../types/shelter'
import {
  aditCentreZ,
  floorSection,
  footprint,
  shaftsAt,
  getFloorElevation,
  undergroundPlan as plan,
} from '../geometry/coords'
import { ModelBuilder } from './utils/modelBuilder'
import { CorridorFixtures, RoomInteriors, WalkCeiling } from './rooms/RoomInteriors'
import { atriumFootprint, clipZSpan } from '../geometry/atrium'
import type { SurveyRuntime } from './camera/runtime'
import { Model } from './utils/Model'
import {
  addSlab,
  iBeam,
  roomStructure,
  shaftFrames,
  stairStructure,
  steel,
  trim,
} from './utils/shellGeometry'

function structure(id: UndergroundId) {
  const m = new ModelBuilder(),
    route = footprint(CORRIDOR)
  addSlab(m, id)
  roomStructure(m, id)
  m.box('#707b7d', [route.x, 0.012, route.z], [route.w, 0.024, route.d], id === 'B4' ? 'grate' : 'epoxy')
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
  shaftFrames(m, 0, FLOORS[id].pitch, id === 'B4' ? 'B3' : id === 'B3' ? 'B2' : id === 'B2' ? 'B1' : 'L1')
  stairStructure(m, id, 0, -Infinity, FLOORS[id].pitch)
  if (id === 'B4') {
    const s = shaftsAt(FLOORS.B4.elevation).find((shaft) => shaft.id === 'freight')!
    m.box('#677477', [s.x, 0.09, s.z], [1.8, 0.18, 1.8], 'steel')
    m.box('#8f9997', [s.x, 1.25, s.z0 + 1.12], [1.8, 2.5, 0.09], 'steel')
    for (const dx of [-0.87, 0.87]) m.box('#a5aeaa', [s.x + dx, 1.25, s.z], [0.06, 2.5, 1.8], 'steel')
    m.box(steel, [s.x1 - 0.34, 2.2, s.z], [0.3, 2.5, 1.1], 'steel')
  }
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
    const x = plan.x1 - 0.1
    if (id === 'B2') {
      const z = adits.east.points[0][2],
        half = adits.east.width / 2
      wall(x, plan.z0, x, z - half)
      wall(x, z + half, x, plan.z1)
      wall(x, z - half, x, z + half, adits.east.height)
    } else wall(x, plan.z0, x, plan.z1)
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
  for (const room of roomsOn(id)) {
    if (!room.clearHeightOverride) continue
    const b = footprint(room.bounds),
      top = room.clearHeightOverride
    if (side !== 'front' && b.z0 === plan.z0) wall(b.x0, b.z0 + 0.1, b.x1, b.z0 + 0.1, h, top)
    if (side !== 'rear' && b.z1 === plan.z1) wall(b.x0, b.z1 - 0.1, b.x1, b.z1 - 0.1, h, top)
    if (side !== 'rear' && b.x0 === plan.x0) wall(b.x0 + 0.1, b.z0, b.x0 + 0.1, b.z1, h, top)
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

export function FloorSliceGroup({ id, rt }: { id: UndergroundId; rt: SurveyRuntime }) {
  const floor = useShelterStore((s) => s.floor),
    mode = useShelterStore((s) => s.mode),
    plenum = useShelterStore((s) => s.plenum)
  const view = useShelterStore((s) => s.cameraState)
  const walk = view === 'walkthrough'
  const seen = walk || floor === 'ALL' || FLOOR_ORDER.indexOf(id) >= FLOOR_ORDER.indexOf(floor)
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
  const floorGroup = useRef<Group>(null),
    ceiling = useRef<Group>(null)
  useFrame(({ camera }) => {
    if (ceiling.current)
      ceiling.current.visible =
        (walk || rt.garageTransfer) && !(rt.dropping && camera.position.y > FLOORS[id].elevation + 2.5)
    if (!floorGroup.current) return
    if (!walk && mode === 'exterior') {
      floorGroup.current.visible =
        rt.garageTransfer && Math.abs(camera.position.y - FLOORS[id].elevation - 1.65) < 6
      return
    }
    if (walk && floor !== 'ALL') {
      const closeToEye = Math.abs(camera.position.y - getFloorElevation(id) - 1.65) < 5.8
      floorGroup.current.visible = rt.dropping
        ? FLOOR_ORDER.indexOf(id) >= FLOOR_ORDER.indexOf(floor)
        : closeToEye || Math.abs(FLOOR_ORDER.indexOf(id) - FLOOR_ORDER.indexOf(floor)) <= 1
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
      <group visible={seen && mode !== 'xray'}>
        <CorridorFixtures id={id} />
        <RoomInteriors id={id} />
      </group>
      <group ref={ceiling} visible={walk}>
        <WalkCeiling id={id} />
      </group>
      <Model build={builders.frame} delayMs={delayMs} opacity={seen ? (mode === 'xray' ? 0.065 : 1) : 0} />
      <Model build={builders.core} delayMs={delayMs} opacity={seen ? (mode === 'xray' ? 0.43 : 1) : 0} />
      <Model build={builders.rear} delayMs={delayMs} opacity={Number(seen && mode !== 'xray')} />
      <Model build={builders.front} delayMs={delayMs} opacity={Number(seen && closed)} />
      <Model build={builders.wire} delayMs={delayMs} opacity={seen && mode === 'xray' ? 0.12 : 0} />
      <Model
        build={builders.plenum}
        delayMs={delayMs}
        opacity={seen && (plenum || (floor !== 'ALL' && floor !== id)) ? (mode === 'xray' ? 0.09 : 1) : 0}
      />
    </group>
  )
}
