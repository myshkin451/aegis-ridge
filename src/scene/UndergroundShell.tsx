import { slabPlan } from '../geometry/planGeometry'
import { FLOORS, SLAB, UNDERGROUND } from '../data/floors'
import { ElevatorCars } from './ElevatorCars'
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
export function UndergroundShell() {
  const floor = useShelterStore((s) => s.floor),
    mode = useShelterStore((s) => s.mode)
  const walk = useShelterStore((s) => s.cameraState === 'walkthrough')
  const upper = floor === 'ALL' || floor === 'L1' || floor === 'L2'
  return (
    <>
      {UNDERGROUND.map((id) => (
        <FloorSliceGroup key={id} id={id} />
      ))}
      <ElevatorCars />
      <group visible={mode !== 'exterior'}>
        <group position-y={FLOORS.B4.elevation}>
          <Model build={pitFloor} />
        </group>
        <Model build={concrete} opacity={upper ? (mode === 'xray' ? 0.14 : 1) : 0} cutMaterial="concrete" />
        <Model build={granite} opacity={Number(upper && mode !== 'xray')} cutMaterial="granite" />
        <Model build={bufferWire} opacity={Number(upper && mode === 'xray')} />
        <group name="上部竖井">
          <Model build={coreExtension} opacity={Number(upper || walk)} />
        </group>
      </group>
    </>
  )
}
