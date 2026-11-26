import { useMemo } from 'react'
import { Object3D } from 'three'
import { FLOORS } from '../../data/floors'
import { residentialLayouts } from '../../data/roomLayouts/residential'
import { useShelterStore } from '../../store/useShelterStore'
import { sunAt } from '../atmosphere/PhysicalSky'

const outlet = residentialLayouts.b2_commons.equipment.find((e) => e.tagCode === 'FO-201')!
const [x, base, z] = outlet.position
const y = FLOORS.B2.elevation + base

/** The tracked roof collector feeds a fixed downward diffuser. Its light follows the site's solar altitude. */
export function FibreDaylight() {
  const time = useShelterStore((s) => s.time)
  const closed = useShelterStore((s) => s.cold)
  const target = useMemo(() => {
    const aim = new Object3D()
    aim.position.set(x, FLOORS.B2.elevation + 0.76, z)
    aim.updateMatrixWorld()
    return aim
  }, [])
  const sunHeight = Math.max(0, sunAt(time).y)
  return (
    <spotLight
      position={[x, y + 0.04, z]}
      target={target}
      color={sunHeight < 0.3 ? '#ffd9a4' : '#fff3d6'}
      intensity={closed ? 0 : 76 * sunHeight}
      distance={3.5}
      angle={0.26}
      penumbra={0.43}
      decay={2}
    />
  )
}
