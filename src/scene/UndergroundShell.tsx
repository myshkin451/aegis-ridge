import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { SurveyRuntime } from './camera/runtime'
import { slabPlan } from '../geometry/planGeometry'
import { FLOORS, FLOOR_ORDER, INITIAL_FREIGHT_STOP, SLAB, UNDERGROUND } from '../data/floors'
import { carDeck, carSideCentres, carWall } from '../geometry/freightCar'
import { buffer, floorSection, undergroundPlan } from '../geometry/coords'
import { useShelterStore } from '../store/useShelterStore'
import { FloorSliceGroup } from './FloorSliceGroup'
import { ModelBuilder } from './utils/modelBuilder'
import { Model } from './utils/Model'
import { outline, plate } from './utils/planGeometry'
import { shaftFrames, stairStructure } from './utils/shellGeometry'

const capPlan = () => slabPlan(FLOORS.B1.bounds, buffer.top)
function granite() {
  const m = new ModelBuilder('granite')
  plate(m, capPlan(), buffer.bottom, buffer.interfaceY, '#a89e94', '#958b83')
  return m
}
function concrete() {
  const m = new ModelBuilder()
  plate(m, capPlan(), buffer.interfaceY, buffer.top, '#bbb7ad', '#aaa69e')
  plate(m, capPlan(), buffer.bottom - SLAB, buffer.bottom, '#c1c6bc', '#b4b8b1')
  return m
}
function bufferWire() {
  const m = new ModelBuilder()
  for (const y of [buffer.bottom, buffer.interfaceY, buffer.top]) outline(m, capPlan(), y, '#63767b')
  return m
}
function coreExtension() {
  const m = new ModelBuilder()
  const base = floorSection('B1').floor
  shaftFrames(m, buffer.bottom, 0, 'L1')
  stairStructure(m, 'B1', base, buffer.bottom, 0)
  return m
}
function pitFloor() {
  const m = new ModelBuilder()
  const p = undergroundPlan
  m.box('#7b807c', [p.x, -SLAB - 0.12, p.z], [p.w, 0.24, p.d])
  return m
}
function freightCarModel() {
  const m = new ModelBuilder()
  m.box('#677477', [carDeck.x, -0.09, carDeck.z], [carDeck.width, 0.18, carDeck.depth], 'steel')
  for (const x of carSideCentres)
    m.box(
      '#a5aeaa',
      [x, carWall.height / 2, carDeck.z],
      [carWall.thickness, carWall.height, carDeck.depth],
      'steel',
    )
  for (const z of [carDeck.z - carDeck.depth / 2 + 0.04, carDeck.z + carDeck.depth / 2 - 0.04])
    m.box('#687176', [carDeck.x, carWall.height - 0.045, z], [carDeck.width, 0.09, 0.08], 'steel')
  return m
}
export function UndergroundShell({ rt }: { rt: SurveyRuntime }) {
  const floor = useShelterStore((s) => s.floor),
    mode = useShelterStore((s) => s.mode)
  const routeOverview = useShelterStore(s => s.routeOverview)
  const walk = useShelterStore((s) => s.cameraState === 'walkthrough')
  const upper = floor === 'ALL' || floor === 'L1' || floor === 'L2'
  const buried = useRef<Group>(null),
    car = useRef<Group>(null)
  useFrame(() => {
    if (buried.current) buried.current.visible = mode !== 'exterior' || rt.garageTransfer
    if (car.current) {
      const stop = rt.collision?.freightCar?.stop ?? INITIAL_FREIGHT_STOP
      car.current.position.y = FLOORS[stop].elevation
      car.current.visible = walk || floor === 'ALL' || FLOOR_ORDER.indexOf(stop) >= FLOOR_ORDER.indexOf(floor)
    }
  })
  return (
    <>
      {UNDERGROUND.map((id) => (
        <FloorSliceGroup key={id} id={id} rt={rt} />
      ))}
      <group ref={buried}>
        <group ref={car} name="3t 贯通货梯轿厢" position-y={FLOORS[INITIAL_FREIGHT_STOP].elevation}>
          <Model build={freightCarModel} opacity={mode === 'xray' ? 0.43 : 1} interior />
        </group>
        <group position-y={FLOORS.B4.elevation} visible={!routeOverview}>
          <Model build={pitFloor} />
        </group>
        <Model build={concrete} opacity={upper && !routeOverview ? (mode === 'xray' ? 0.14 : 1) : 0} cutMaterial="concrete" />
        <Model build={granite} opacity={Number(upper && mode !== 'xray')} cutMaterial="granite" />
        <Model build={bufferWire} opacity={Number(upper && mode === 'xray')} />
        <group name="上部竖井">
          <Model build={coreExtension} opacity={Number(upper || walk)} />
        </group>
      </group>
    </>
  )
}
