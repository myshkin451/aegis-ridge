import { useLayoutEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Group, Object3D, PointLight, RectAreaLight, SpotLight } from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { FLOORS } from '../../data/floors'
import { lighting, lightingRoomAt, lightingTimeAt } from '../../data/lighting'
import { useShelterStore } from '../../store/useShelterStore'
import { floorAt } from '../../geometry/viewGeometry'
import type { SurveyRuntime } from '../camera/runtime'

// sRGB black-body swatches. Intensities are candela (spot/point) or luminance (area).
const swatches: Record<number, Color> = Object.fromEntries(
  Object.entries({
    2700: '#ffae75',
    2900: '#ffb681',
    3000: '#ffbd89',
    4200: '#ffdab7',
    4500: '#ffe0c2',
  }).map(([k, v]) => [k, new Color(v)]),
)
function makePool() {
  RectAreaLightUniformsLib.init()
  const group = new Group()
  const spot = new SpotLight('white', 0, 5, 1, 0.62, 2)
  spot.name = 'room-shadow'
  spot.castShadow = true
  spot.shadow.autoUpdate = false
  spot.shadow.needsUpdate = true
  spot.shadow.mapSize.set(512, 512)
  spot.shadow.camera.near = 0.1
  spot.shadow.bias = -0.00032
  spot.shadow.normalBias = 0.012
  const points = Array.from({ length: 3 }, () => new PointLight('white', 0, 9))
  const areas = [new RectAreaLight('white', 0)]
  group.add(spot, spot.target, ...points, ...areas)
  return { group, spot, points, areas }
}

export function InteriorLightPool({ rt }: { rt: SurveyRuntime }) {
  const pool = useMemo(makePool, [])
  const previous = useMemo(() => ({ room: '', time: '', door: -1 }), [])
  useLayoutEffect(() => () => pool.spot.dispose(), [pool])
  useFrame(({ camera, gl }) => {
    const s = useShelterStore.getState()
    const floor = floorAt(camera.position.y - 1.65)
    const inside = s.cameraState === 'walkthrough' && !rt.moving && floor.startsWith('B')
    const room = inside ? lightingRoomAt(floor, camera.position.x, camera.position.z) : ''
    const period = lightingTimeAt(s.time)
    const moved = room !== previous.room
    const doorChanged = rt.doorRevision !== previous.door
    if (moved || s.time !== previous.time) {
      const preset = lighting[room]?.[period]
      const base = FLOORS[floor].elevation
      const place = (object: Object3D, p: readonly number[]) => object.position.set(p[0], p[1] + base, p[2])
      for (const light of [pool.spot, ...pool.points, ...pool.areas]) light.intensity = 0
      if (preset) {
        const cropOff = room === 'B3-hall' && s.time >= '12:00' && s.time < '20:00'
        const key = preset.spot
        place(pool.spot, key.position)
        place(pool.spot.target, key.target)
        pool.spot.color.copy(swatches[key.kelvin])
        pool.spot.intensity = key.intensity
        pool.spot.distance = key.reach
        pool.spot.angle = key.angle
        // SpotLightShadow derives its far plane and fov from the finite light cone.
        for (const [i, source] of preset.points.entries()) {
          const light = pool.points[i]
          place(light, source.position)
          if (source.spectrum) light.color.set(source.spectrum)
          else light.color.copy(swatches[source.kelvin])
          light.intensity = cropOff ? 0 : source.intensity
        }
        for (const [i, source] of preset.areas.entries()) {
          const light = pool.areas[i]
          place(light, source.position)
          light.lookAt(source.target[0], source.target[1] + base, source.target[2])
          ;[light.width, light.height] = source.size
          if (source.spectrum) light.color.set(source.spectrum)
          else light.color.copy(swatches[source.kelvin])
          light.intensity = cropOff ? 0 : source.intensity
        }
      }
      previous.room = room
      previous.time = s.time
    }
    previous.door = rt.doorRevision
    if (room && (moved || doorChanged)) {
      pool.spot.shadow.needsUpdate = true
      gl.shadowMap.needsUpdate = true
    }
    gl.domElement.dataset.interiorShadowRoom = room
  }, 0.5)
  return <primitive object={pool.group} />
}
