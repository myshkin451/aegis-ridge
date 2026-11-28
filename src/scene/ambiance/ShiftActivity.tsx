import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group } from 'three'
import { CORRIDOR, FLOORS } from '../../data/floors'
import { footprint } from '../../geometry/coords'
import { useShiftClock } from '../../store/useShiftClock'
import { useShelterStore } from '../../store/useShelterStore'
import { Model, reduceMotion } from '../utils/Model'
import { ModelBuilder } from '../utils/modelBuilder'
import { drawMovingCart } from '../rooms/upper'

const corridor = footprint(CORRIDOR)
const cart = () => {
  const builder = new ModelBuilder()
  drawMovingCart(builder, 'C')
  return builder
}

export function ShiftActivity() {
  const vehicle = useRef<Group>(null)
  const clock = useRef(0)
  useFrame((_, dt) => {
    const state = useShelterStore.getState(), enabled = useShiftClock.getState().motion
    if (enabled && !reduceMotion()) clock.current += Math.min(dt, 0.1)
    if (vehicle.current) {
      vehicle.current.visible = state.mode !== 'xray' &&
        (state.cameraState === 'section' || state.cameraState === 'sectionBox' ||
          (state.cameraState !== 'site' && state.lastFloor === 'B1'))
      vehicle.current.position.set(corridor.x + Math.sin(clock.current * 0.074) * (corridor.w / 2 - 1.3),
        FLOORS.B1.elevation, corridor.z + 0.12)
    }
  })
  return <group userData={{ skipWalk: true }}><group ref={vehicle} rotation-y={Math.PI / 2}>
    <Model build={cart} interior/>
  </group></group>
}
