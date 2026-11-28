import { useShallow } from 'zustand/shallow'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { circadianAt, lightingCues } from '../../data/lighting'
import { useOperationsStore } from '../../store/useOperationsStore'
import { roomsOn } from '../../data/defaultBlueprint'
import { BRANCH_CORRIDOR, CORRIDOR, FLOORS, UNDERGROUND } from '../../data/floors'
import { footprint, shaftPlans } from '../../geometry/coords'
import { atriumFootprint, clearCeilingPatches, clipZSpan } from '../../geometry/atrium'
import type { FloorId, UndergroundId } from '../../types/shelter'
import { Model } from '../utils/Model'
import { ModelBuilder } from '../utils/modelBuilder'
import { floorLight } from '../materials/pbrLibrary'
import { useShelterStore } from '../../store/useShelterStore'
import { Inscription } from './Inscription'
import { CommandScreens } from './CommandScreens'
import { drawEquipment, roomModels } from './roomModels'
import { FloorSigns } from './FloorSigns'
import type { SurveyRuntime } from '../camera/runtime'
import { addLivingCoves, residentialFinishes } from './residentialFinishes'
import { archiveSpines } from './archiveBindings'
import { roomArtwork } from './artwork'
import { cleanRoomPanels, gymFloor } from './floorFinishes'
import { pilotVariant } from '../assets/pilotAssets'
import { bedrooms } from '../../geometry/residentialPlan'

function fixtures(id: UndergroundId) {
  const m = new ModelBuilder(),
    route = footprint(CORRIDOR),
    tint = floorLight[id]
  for (let x = route.x0 + 1.8; x < route.x1; x += 3.8) {
    for (const z of [route.z0 + 0.22, route.z1 - 0.22]) {
      m.box('#414b4b', [x, 2.91, z], [2.86, 0.11, 0.18], 'steel')
      m.box(tint, [x, 2.842, z], [2.68, 0.031, 0.1], 'lamp')
    }
  }
  for (const x of [-13, -9, 5, 9, 13]) {
    m.box('#485057', [x, 2.86, -11.8], [2.74, 0.14, 0.24], 'steel')
    m.box(tint, [x, 2.79, -11.66], [2.6, 0.075, 0.12], 'lamp')
    m.box(tint, [x, 0.15, -11.78], [1.24, 0.035, 0.07], 'lamp')
  }
  // Matte ceiling rafts leave the services above the corridor readable where the M layer is exposed.
  return m
}
const freight = shaftPlans.find((s) => s.id === 'freight')!
const commons = footprint(roomsOn('B2').find((r) => r.id === 'b2_commons')!.bounds)
const mainCorridor = footprint(CORRIDOR)
const library = footprint(roomsOn('B2').find((r) => r.id === 'b2_library')!.bounds)
export function RoomInteriors({ id, rt }: { id: FloorId; rt: SurveyRuntime }) {
  const rooms = useOperationsStore(useShallow(s => s.rooms.filter(r => r.floorId === id)))
  const build = useMemo(() => () => roomModels(id), [id])
  const changes = useMemo(() => {
    const base = roomsOn(id), added: (typeof rooms)[number]['equipment'] = [], hidden = new Set<string>()
    for (const room of rooms.filter(r => r.templateId !== r.id)) {
      const original = base.find(r => r.id === room.id)!
      for (const unit of original.equipment) if (!room.equipment.includes(unit)) hidden.add(unit.tagCode)
      added.push(...room.equipment.filter(e => !original.equipment.includes(e)))
    }
    const install = () => {
      const model = new ModelBuilder()
      for (const unit of added) drawEquipment(model, id, unit)
      return model
    }
    return { hidden, build: added.length ? install : null }
  }, [id, rooms])
  const root = useRef<Group>(null)
  const floor = FLOORS[id]
  const archive = useRef<Group>(null)
  const hasArchive = rooms.some(r => r.id === 'b2_library' && r.templateId === r.id)
  const walkingFloor = useShelterStore((s) => s.cameraState === 'walkthrough' && s.lastFloor === id)
  useFrame(({ camera }) => {
    if (!root.current) return
    const state = useShelterStore.getState()
    const p = camera.position
    const aboveGround = id === 'L1' || id === 'L2'
    const nearBuilding = aboveGround && Math.hypot(p.x, p.z) < 40 && Math.abs(p.y - floor.elevation) < 18
    const besideShaft = rt.garageTransfer && Math.abs(p.y - floor.elevation - 1.65) < floor.pitch
    const orbit = state.cameraState === 'floorOrbit' || state.cameraState === 'plan'
    // Opaque slabs occlude lower fit-outs. The glazed B2 floor also exposes the B3 crop beds.
    const seesAtrium =
      (p.x >= commons.x0 && p.x <= commons.x1 && p.z >= commons.z0 && p.z <= commons.z1) ||
      (p.z >= mainCorridor.z0 && p.z <= mainCorridor.z1 && p.x >= mainCorridor.x0 && p.x <= mainCorridor.x1)
    const throughAtrium =
      id === 'B3' && state.lastFloor === 'B2' && (orbit || rt.garageTransfer || rt.dropping || seesAtrium)
    let visible = true
    if (state.cameraState === 'site') visible = nearBuilding || besideShaft
    else if (orbit || state.cameraState === 'walkthrough')
      visible = state.lastFloor === id || throughAtrium || besideShaft
    if (archive.current)
      archive.current.visible =
        hasArchive && walkingFloor && p.x >= library.x0 && p.x <= library.x1 && p.z >= library.z0 && p.z <= library.z1
    root.current.visible = visible && state.mode !== 'xray'
  })
  return (
    <group ref={root} name={'室内-' + id} userData={{ skipWalk: true }}>
      <Model build={build} interior hiddenEquipment={changes.hidden} />
      {changes.build && <Model build={changes.build} interior />}
      {id === 'B2' && <CommandScreens />}
      {id === 'B2' && (
        <group name="B2 内墙饰面与样板陈设" visible={walkingFloor}>
          <Model walkSurface="wall" build={residentialFinishes} interior opaqueOrder={-4} />
          {pilotVariant === 'r3' && <Model walkSurface="wall" build={roomArtwork} interior opaqueOrder={-3} />}
          <group ref={archive} visible={false}>
            <Model build={archiveSpines} interior />
          </group>
        </group>
      )}
      {(id === 'B1' || id === 'B3') && (
        <group visible={walkingFloor && (id === 'B3' || rooms.some(r => r.id === 'b1_gym' && r.templateId === r.id))}>
          <Model walkSurface="wall" build={id === 'B1' ? gymFloor : cleanRoomPanels} interior opaqueOrder={-4} />
        </group>
      )}
      <FloorSigns id={id} />
    </group>
  )
}

export function CorridorFixtures({ id }: { id: UndergroundId }) {
  const build = useMemo(() => () => fixtures(id), [id])
  const view = useShelterStore((s) => s.cameraState)
  return (
    <>
      <Model walkSurface="ceiling" build={build} />
      <group visible={view === 'walkthrough'}>
        <Inscription
          text={id}
          position={[freight.x, id === 'B1' || id === 'B4' ? 3.32 : 1.62, freight.z0 + 0.13]}
          width={2.1}
          height={1.2}
        />
        {id === 'B3' && (
          <Inscription text="B3　分层水培" width={2.35} height={0.34} position={[-7, 2.69, -0.013]} reverse />
        )}
      </group>
    </>
  )
}
// Keep the light count independent of floor visibility so a peeled floor needs no new program.
export function InteriorLights() {
  const view = useShelterStore((s) => s.cameraState)
  const time = useShelterStore((s) => s.time)
  const emergency = useOperationsStore((s) => s.lockdownSeconds >= lightingCues.interiorEmergency)
  const cycle = circadianAt(time)
  return UNDERGROUND.map((id) => {
    const farm = view === 'walkthrough' && id === 'B3' && cycle.cropLit && !emergency
    return (
      <pointLight
        key={id}
        position={[farm ? -7 : 0, FLOORS[id].elevation + 2.45, farm ? 4 : -8]}
        color={emergency ? '#edab79' : farm ? '#ffe1f1' : floorLight[id]}
        intensity={farm ? 16 : view === 'section' ? 18 : 0}
        distance={16}
        decay={2}
      />
    )
  })
}
export function WalkCeiling({ id }: { id: UndergroundId }) {
  const build = useMemo(
    () => () => {
      const m = new ModelBuilder()
      for (const room of roomsOn(id)) {
        const r = footprint(room.bounds),
          h = room.clearHeightOverride ?? FLOORS[id].clearHeight
        const living = ['b2_quarters', 'b2_commons', 'b2_library', 'b2_bath_laundry'].includes(room.id)
        for (const p of clearCeilingPatches(room))
          m.box(
            living ? '#eae5da' : '#c5c6bd',
            [p.x, h + 0.025, p.z],
            [p.w - 0.02, 0.05, p.d - 0.02],
            living ? 'plaster' : 'stone',
          )
        if (living) {
          for (const bay of room.id === 'b2_quarters' ? bedrooms : [r]) addLivingCoves(m, bay, h)
          continue
        }
        for (let x = r.x0 + 1.4; x < r.x1 - 0.4; x += 3.3)
          for (const [a, b] of clipZSpan(
            x,
            r.z0 + 0.24,
            r.z1 - 0.24,
            room.id === 'b3_hydroponics' ? [atriumFootprint] : [],
          ))
            m.box(floorLight[id], [x, h - 0.008, (a + b) / 2], [0.07, 0.025, b - a], 'lamp')
      }
      if (id === 'B2') {
        for (const room of roomsOn(id)) {
          const r = footprint(room.bounds)
          for (const bay of room.id === 'b2_quarters' ? bedrooms : [r]) {
            const z = (bay.z0 + bay.z1) / 2
            // Flush skirting apertures mark the night path without lighting the sleeping ceiling.
            m.box('#98856b', [bay.x0 + 0.22, 0.17, z], [0.032, 0.09, 0.44], 'steel')
            m.box('#ffad4b', [bay.x0 + 0.239, 0.153, z], [0.009, 0.017, 0.36], 'lamp')
          }
        }
      }
      for (const corridor of [CORRIDOR, BRANCH_CORRIDOR]) {
        const r = footprint(corridor)
        m.box('#b9bdb9', [r.x, 3.035, r.z], [r.w, 0.07, r.d])
      }
      return m
    },
    [id],
  )
  const showCeiling = useShelterStore((s) => s.walkCeiling)
  const walkB2 = useShelterStore((s) => id === 'B2' && s.lastFloor === id && s.cameraState === 'walkthrough')
  return (
    <group name={id + ' 吊顶与灯槽'} visible={id !== 'B2' || showCeiling}>
      <Model walkSurface="ceiling" build={build} opaqueOrder={walkB2 ? -3 : 0} />
    </group>
  )
}
