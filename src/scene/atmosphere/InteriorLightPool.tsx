import { useLayoutEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Group, Object3D, PointLight, RectAreaLight, SpotLight } from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { FLOORS } from '../../data/floors'
import { lightingCues, lightingRoomAt, roomLightingAt, type Emitter } from '../../data/lighting'
import { useShelterStore } from '../../store/useShelterStore'
import { lockdownElapsed, useOperationsStore } from '../../store/useOperationsStore'
import { floorAt } from '../../geometry/viewGeometry'
import type { SurveyRuntime } from '../camera/runtime'

const swatches: [number, Color][] = [
  [1800, '#ff822e'], [2200, '#ff993d'], [2700, '#ffae75'], [3000, '#ffbd89'],
  [4200, '#ffdab7'], [4500, '#ffe0c2'], [5000, '#ffe9d6'],
].map(([k, v]) => [Number(k), new Color(String(v))])

function setOutput(light: SpotLight | RectAreaLight | PointLight, source: Emitter) {
  light.intensity = source.intensity
  if (source.spectrum) {
    light.color.set(source.spectrum)
    return
  }
  const k = source.kelvin
  const hi = Math.max(1, swatches.findIndex(([value]) => value >= k))
  const [k0, c0] = swatches[hi - 1], [k1, c1] = swatches[hi]
  light.color.lerpColors(c0, c1, Math.min(1, Math.max(0, (k - k0) / (k1 - k0))))
}

function makePool() {
  RectAreaLightUniformsLib.init()
  const group = new Group()
  group.name = 'Installed room lighting'
  const spots = Array.from({ length: 2 }, (_, i) => {
    const light = new SpotLight('white', 0, 5, 0.9, 0.53, 2)
    light.name = 'room-shadow-' + (i + 1)
    light.castShadow = true
    light.shadow.autoUpdate = false
    light.shadow.needsUpdate = true
    light.shadow.mapSize.set(512, 512)
    light.shadow.camera.near = 0.1
    light.shadow.bias = -0.00032
    light.shadow.normalBias = 0.012
    group.add(light, light.target)
    return light
  })
  const points = Array.from({ length: 3 }, () => new PointLight('white', 0, 9))
  const areas = [new RectAreaLight('white', 0)]
  group.add(...points, ...areas)
  const all = [...spots, ...points, ...areas]
  function aimRoom(room: string, time: string, emergency: boolean) {
    const preset = roomLightingAt(room, time, emergency)
    for (const light of all) light.intensity = 0
    if (!preset) return false
    let coneChanged = false
    const base = FLOORS[preset.floor].elevation
    const place = (object: Object3D, p: readonly number[]) => object.position.set(p[0], p[1] + base, p[2])
    for (const [i, source] of [preset.spot, preset.secondSpot].entries()) {
      if (!source) continue
      const light = spots[i]
      coneChanged ||= light.position.x !== source.position[0] || light.position.y !== source.position[1] + base ||
        light.position.z !== source.position[2] || light.target.position.x !== source.target[0] ||
        light.target.position.y !== source.target[1] + base || light.target.position.z !== source.target[2] ||
        light.angle !== source.angle || light.distance !== source.reach
      place(light, source.position)
      place(light.target, source.target)
      light.distance = source.reach
      light.angle = source.angle
      setOutput(light, source)
    }
    for (const [i, source] of preset.points.entries()) {
      place(points[i], source.position)
      setOutput(points[i], source)
    }
    for (const [i, source] of preset.areas.entries()) {
      const light = areas[i]
      place(light, source.position)
      light.lookAt(source.target[0], source.target[1] + base, source.target[2])
      ;[light.width, light.height] = source.size
      setOutput(light, source)
    }
    return coneChanged
  }
  group.userData.aimRoom = aimRoom
  return { group, spots, aimRoom }
}

export function InteriorLightPool({ rt }: { rt: SurveyRuntime }) {
  const pool = useMemo(makePool, [])
  const previous = useMemo(() => ({ room: '', time: '', emergency: false, door: -1, rooms: useShelterStore.getState().installedRooms }), [])
  useLayoutEffect(() => () => pool.spots.forEach((spot) => spot.dispose()), [pool])
  useFrame(({ camera, gl }) => {
    const s = useShelterStore.getState()
    const floor = floorAt(camera.position.y - 1.65)
    const inside = s.cameraState === 'walkthrough' && !rt.moving && floor.startsWith('B')
    const room = inside ? lightingRoomAt(floor, camera.position.x, camera.position.z) : ''
    const emergency = lockdownElapsed(useOperationsStore.getState()) >= lightingCues.interiorEmergency
    const moved = room !== previous.room
    const doorChanged = rt.doorRevision !== previous.door
    const circuitChanged = emergency !== previous.emergency
    let coneChanged = false
    if (moved || s.time !== previous.time || circuitChanged) {
      coneChanged = pool.aimRoom(room, s.time, emergency)
      gl.domElement.dataset.activeShadowSpots = String(pool.spots.filter(light => light.castShadow && light.intensity > 0).length)
      previous.room = room
      previous.time = s.time
    }
    const installationChanged = previous.rooms !== s.installedRooms
    previous.rooms = s.installedRooms
    previous.emergency = emergency
    previous.door = rt.doorRevision
    if (room && (moved || doorChanged || circuitChanged || coneChanged || installationChanged)) {
      pool.spots.forEach((spot) => { spot.shadow.needsUpdate = true })
      gl.shadowMap.needsUpdate = true
    }
    gl.domElement.dataset.interiorShadowRoom = room
  }, 0.5)
  return <primitive object={pool.group} />
}
