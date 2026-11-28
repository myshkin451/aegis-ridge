import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, Group, InstancedMesh, MeshStandardMaterial, Object3D, SphereGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { crew } from '../../data/crew'
import { defaultBlueprint } from '../../data/defaultBlueprint'
import { CORRIDOR, FLOORS } from '../../data/floors'
import { bedrooms } from '../../geometry/residentialPlan'
import { footprint } from '../../geometry/coords'
import { minutesAt, useShiftClock } from '../../store/useShiftClock'
import { useShelterStore } from '../../store/useShelterStore'
import type { FloorId } from '../../types/shelter'
import { useBuildingCut } from '../BuildingSection'
import { Model, reduceMotion } from '../utils/Model'
import { ModelBuilder } from '../utils/modelBuilder'
import { drawMovingCart } from '../rooms/upper'
import type { SurveyRuntime } from '../camera/runtime'

const corridor = footprint(CORRIDOR)
const rooms = new Map(defaultBlueprint.rooms.map(room => [room.id, room]))

function figureGeometry() {
  // One 1.75 m survey figure and one instance per resident. Feet define the local origin.
  const parts: BufferGeometry[] = []
  function part(x: number, y: number, z: number, w: number, h: number, d: number, tilt = 0) {
    const g = new SphereGeometry(1, 8, 6)
    g.scale(w / 2, h / 2, d / 2).rotateX(tilt).translate(x, y, z)
    parts.push(g)
  }
  part(0, 1.62, 0, 0.205, 0.26, 0.22)
  part(0, 1.14, 0, 0.44, 0.72, 0.25)
  for (const sign of [-1, 1]) {
    part(sign * 0.10, 0.48, -sign * 0.04, 0.17, 0.88, 0.17, sign * -0.12)
    part(sign * 0.25, 1.09, sign * 0.04, 0.117, 0.57, 0.13, sign * 0.2)
    part(sign * 0.10, 0.065, 0.04 - sign * 0.09, 0.155, 0.13, 0.26)
  }
  const merged = mergeGeometries(parts)!
  parts.forEach(g => g.dispose())
  return merged
}
const cart = () => {
  const builder = new ModelBuilder()
  drawMovingCart(builder, 'C')
  return builder
}

export function ShiftActivity({ rt }: { rt: SurveyRuntime }) {
  const cut = useBuildingCut()
  const figures = useMemo(() => {
    const mesh = new InstancedMesh(figureGeometry(), new MeshStandardMaterial({
      color: 0xffffff, roughness: 0.88, clippingPlanes: cut?.planes,
    }), crew.length)
    const pigments = ['#878977', '#aa8e78', '#647877', '#847b70', '#94968a']
    for (let i = 0; i < crew.length; i++) mesh.setColorAt(i, new Color(pigments[i % pigments.length]))
    mesh.frustumCulled = false
    mesh.name = '值班人员'
    return mesh
  }, [cut])
  useLayoutEffect(() => () => {
    figures.geometry.dispose()
    ;(figures.material as MeshStandardMaterial).dispose()
    figures.dispose()
  }, [figures])
  const dummy = useMemo(() => new Object3D(), [])
  const positions = useMemo(() => crew.map(person => ({
    bedIndex: person.bedIndex,
    bedroom: bedrooms.find(b => b.id === person.bedroomId)!,
    posts: person.route.map(stop => {
      const room = rooms.get(stop.roomId)!
      const anchor = room.cameraAnchors[stop.anchor ?? 0]
      return { room, anchor, x: anchor.position[0], z: anchor.position[2], surveyed: false }
    }),
  })), [])
  const vehicle = useRef<Group>(null)
  const clock = useRef(0)
  useFrame(({ camera }, dt) => {
    const state = useShelterStore.getState(), enabled = useShiftClock.getState().motion
    if (enabled && !reduceMotion()) clock.current += Math.min(dt, 0.1)
    const minutes = minutesAt(state.time)
    const night = minutes < 360 || minutes >= 1320
    const section = state.cameraState === 'section' || state.cameraState === 'sectionBox'
    function shown(floor: FloorId) {
      if (state.mode === 'xray' || state.routeOverview) return false
      if (section) return true
      if (state.cameraState === 'site') return floor.startsWith('L') && camera.position.lengthSq() < 1800
      return state.lastFloor === floor
    }
    let count = 0
    positions.forEach(({ bedroom, posts, bedIndex }, i) => {
      const post = posts[(Math.floor((minutes + i * 19) / 180)) % posts.length]
      const floor = night ? 'B2' : post.room.floorId
      if (!shown(floor)) dummy.scale.setScalar(0)
      else {
        const { anchor } = post
        if (!night && !post.surveyed && rt.collision) {
          // Leave room for the camera and place the figure on a standing surface beside its station.
          const b = footprint(post.room.bounds)
          const angle = Math.atan2(anchor.target[0] - anchor.position[0], anchor.target[2] - anchor.position[2])
          for (const offset of [1.15, -1.15, 0.65, -0.65]) {
            const x = anchor.position[0] + Math.cos(angle) * offset
            const z = anchor.position[2] - Math.sin(angle) * offset
            if (x > b.x0 + 0.3 && x < b.x1 - 0.3 && z > b.z0 + 0.3 && z < b.z1 - 0.3 &&
                rt.collision.stands(x, FLOORS[floor].elevation, z)) {
              post.x = x
              post.z = z
              break
            }
          }
          post.surveyed = true
        }
        const { x, z } = post
        const onRound = !night && floor.startsWith('B') && (minutes + i * 7) % 90 < 16
        const phase = clock.current * 0.075 + i * 1.9
        const px = night ? (bedroom.x0 + bedroom.x1) / 2 + (bedroom.beds === 2 ? (bedIndex - 0.5) * 0.6 : 0)
          : onRound ? corridor.x + Math.sin(phase) * (corridor.w / 2 - 1.25) : x
        const pz = night ? (bedroom.z0 >= 7 ? bedroom.z0 + 0.8 : bedroom.z1 - 0.8)
          : onRound ? corridor.z - 0.64 : z
        dummy.position.set(px, FLOORS[floor].elevation, pz)
        dummy.rotation.y = onRound ? Math.sign(Math.cos(phase)) * Math.PI / 2
          : Math.atan2(anchor.target[0] - x, anchor.target[2] - z)
        const nearEye = state.cameraState === 'walkthrough' && Math.abs(camera.position.y - FLOORS[floor].elevation - 1.65) < 1 &&
          Math.hypot(camera.position.x - px, camera.position.z - pz) < 0.55
        dummy.scale.setScalar(nearEye ? 0 : 1)
        if (!nearEye) count++
      }
      dummy.updateMatrix()
      figures.setMatrixAt(i, dummy.matrix)
    })
    figures.visible = count > 0
    if (count) figures.instanceMatrix.needsUpdate = true
    if (vehicle.current) {
      vehicle.current.visible = shown('B1')
      vehicle.current.position.set(corridor.x + Math.sin(clock.current * 0.074) * (corridor.w / 2 - 1.3),
        FLOORS.B1.elevation, corridor.z + 0.12)
    }
  })
  return <group userData={{ skipWalk: true }}><primitive object={figures}/><group ref={vehicle} rotation-y={Math.PI / 2}>
    <Model build={cart} interior/>
  </group></group>
}
