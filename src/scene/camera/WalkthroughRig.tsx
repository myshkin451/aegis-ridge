import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { roomTemplates } from '../../data/roomTemplates'
import type { RoomInstance } from '../../types/shelter'
import { equipmentSolids } from '../../geometry/equipment'
import { BoxGeometry, Group } from 'three'
import { elevatorIds, elevatorSpecs } from '../../geometry/elevators'
import { elevatorBank, setElevatorRider, useElevatorRide } from '../../store/useElevatorRide'
import { lockdownElapsed, useOperationsStore } from '../../store/useOperationsStore'
import { closureProgress } from '../../data/lockdown'
import { doors, doorTints, leafOffset, leafThickness } from '../../geometry/doors'
import { floorAt, roomAt } from '../../geometry/viewGeometry'
import { FLOORS, FLOOR_ORDER, UNDERGROUND } from '../../data/floors'
import { useShelterStore } from '../../store/useShelterStore'
import { appendSolids, positionGeometry } from '../utils/solidGeometry'
import { reduceMotion } from '../utils/Model'
import { pbrMaterial } from '../materials/pbrLibrary'
import type { SurveyRuntime } from './runtime'
import { surveyRoomFloor, surveyRoomRoutes } from './roomRoutes'
import { useWalkReveal } from '../mep/lensControl'
import { WALK, WalkCollision } from './walkCollision'

const garageShutter = (id: string) => id === 'garage-west' || id === 'garage-east'
const slidingDoors = doors.filter(d => !garageShutter(d.id))
const variableBays = new Set(roomTemplates.flatMap(t => t.roomIds.concat(t.trialRoomIds)))
function appendEquipment(rooms: RoomInstance[], mat: ReturnType<typeof pbrMaterial>, vertices: number[]) {
    const hulls = new Group(), cube = new BoxGeometry(1, 1, 1)
    for (const room of rooms)
      for (const unit of room.equipment)
        for (const { center, size } of equipmentSolids(unit)) {
          const hull = new Mesh(cube, mat)
          hull.position.set(...center)
          hull.position.y += FLOORS[room.floorId].elevation
          hull.scale.set(...size)
          hulls.add(hull)
        }
    appendSolids(hulls, vertices, () => true)
    cube.dispose()
}
function mountFittings(collision: WalkCollision, rooms: RoomInstance[], mat: ReturnType<typeof pbrMaterial>) {
  const vertices: number[] = []
  appendEquipment(rooms.filter(r => variableBays.has(r.id)), mat, vertices)
  collision.setFittings(positionGeometry(vertices))
}
export function WalkthroughRig({ rt }: { rt: SurveyRuntime }) {
  const gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene),
    get = useThree((s) => s.get)
  const rooms = useShelterStore(s => s.installedRooms)
  const active = useShelterStore((s) => s.cameraState === 'walkthrough')
  useWalkReveal(active, rt)
  const player = useRef<WalkCollision | null>(null),
    doorGroup = useRef<Group>(null),
    leaves = useRef<InstancedMesh>(null),
    ring = useRef<Mesh>(null)
  const input = useMemo(
    () => ({
      keys: new Set<string>(),
      goal: null as Vector3 | null,
      hover: null as Vector3 | null,
      vx: 0,
      vz: 0,
      door: '',
      held: 0,
      opened: new Map<string, number>(),
      unlocked: new Set<string>(),
      revision: -1,
    }),
    [],
  )
  const tools = useMemo(
    () => ({
      ray: new Raycaster(),
      uv: new Vector2(),
      dir: new Vector3(),
    }),
    [],
  )
  const placeDoor = useMemo(() => {
    const installed = slidingDoors.map((d) => ({
      door: d,
      cos: Math.cos(d.yaw),
      sin: Math.sin(d.yaw),
      rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), d.yaw),
      size: new Vector3(d.width / 2, d.height - 0.02, leafThickness),
    }))
    const position = new Vector3(),
      matrix = new Matrix4()
    return (index: number, opening: number) => {
      if (!leaves.current) return
      const { door, cos, sin, rotation, size } = installed[index]
      const track = door.trackOffset ?? 0
      for (let leaf = 0; leaf < 2; leaf++) {
        const offset = leafOffset(door, leaf, opening)
        position.set(
          door.base[0] + cos * offset + sin * track,
          door.base[1] + door.height / 2,
          door.base[2] - sin * offset + cos * track,
        )
        leaves.current.setMatrixAt(index * 2 + leaf, matrix.compose(position, rotation, size))
      }
    }
  }, [])
  const mat = useMemo(() => {
    const material = pbrMaterial('steel', true)
    material.userData.walkSurface = 'wall'
    return material
  }, [])
  useLayoutEffect(() => {
    const vertices: number[] = []
    for (const name of [
      ...FLOOR_ORDER.filter((id) => id.startsWith('B')),
      '科研观测站',
      '检修与疏散平硐',
      '上部竖井',
    ]) {
      const root = scene.getObjectByName(name)
      if (root)
        appendSolids(root, vertices, (m) => {
          let excluded = m.userData.annotation || ['lamp', 'foliage', 'needles'].includes(m.userData.finish)
          m.traverseAncestors((parent) => {
            if (parent.userData.skipWalk) excluded = true
          })
          return !excluded
        })
    }
    // Decorated models contain thousands of leaves, fins and books. Reuse their dimensioned
    // installation solids for capsule contact, retaining the gaps between gantry legs and cabin walls.
    const initial = useShelterStore.getState().installedRooms
    appendEquipment(initial.filter(r => !variableBays.has(r.id)), mat, vertices)
    const collision = new WalkCollision(positionGeometry(vertices), elevatorBank)
    mountFittings(collision, initial, mat)
    rt.collision = player.current = collision
    rt.roomRoutes = surveyRoomRoutes(collision, initial)
    gl.domElement.dataset.surveyedAnchors = String(rt.roomRoutes.size)
    const pending = new Map<string, Generator>()
    let timer = 0
    const surveySlice = () => {
      const until = performance.now() + 4
      for (const [floor, iterator] of pending) {
        while (performance.now() < until) {
          if (iterator.next().done) { pending.delete(floor); break }
        }
        if (performance.now() >= until) break
      }
      gl.domElement.dataset.surveyedAnchors = String(rt.roomRoutes.size)
      timer = pending.size ? window.setTimeout(surveySlice, 0) : 0
    }
    const stop = useShelterStore.subscribe((s, old) => {
      if (s.installedRooms === old.installedRooms) return
      mountFittings(collision, s.installedRooms, mat)
      for (const floor of UNDERGROUND) {
        if (!s.installedRooms.some((r, i) => r.floorId === floor && r !== old.installedRooms[i])) continue
        const iterator = surveyRoomFloor(collision, s.installedRooms, floor, rt.roomRoutes)
        iterator.next()
        pending.set(floor, iterator)
      }
      if (!timer) timer = window.setTimeout(surveySlice, 0)
      if (s.cameraState === 'walkthrough') collision.landing(rt.feet)
    })
    return () => {
      stop()
      window.clearTimeout(timer)
      collision.dispose()
      rt.collision = player.current = null
    }
  }, [scene, rt, mat, gl])
  useLayoutEffect(() => {
    slidingDoors.forEach((d, i) => {
      const tint = new Color(doorTints[d.kind])
      leaves.current!.setColorAt(i * 2, tint)
      leaves.current!.setColorAt(i * 2 + 1, tint)
      placeDoor(i, 0)
    })
    return () => mat.dispose()
  }, [mat, placeDoor])
  useEffect(() => {
    if (!active) return
    const canvas = gl.domElement
    let start: { id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean } | null =
      null
    const ground = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      tools.uv.set(
        (2 * (e.clientX - rect.left)) / rect.width - 1,
        1 - (2 * (e.clientY - rect.top)) / rect.height,
      )
      tools.ray.setFromCamera(tools.uv, get().camera)
      const ray = tools.ray.ray
      const hit = player.current?.raycastFirst(ray, DoubleSide, 0.15, 45)
      if (ray.direction.y < -0.001) {
        for (const id of elevatorIds) {
          const car = elevatorBank.cars[id]
          if (car.phase !== 'open') continue
          const distance = (car.elevation - ray.origin.y) / ray.direction.y
          if (distance < 0.15 || distance > (hit?.distance ?? 45)) continue
          const x = ray.origin.x + ray.direction.x * distance, z = ray.origin.z + ray.direction.z * distance
          if (car.deckAt(x, z)) return new Vector3(x, car.elevation, z)
        }
      }
      return hit && Math.abs(hit.face?.normal.y ?? 0) > 0.65 && hit.point.y < get().camera.position.y - 0.12
        ? hit.point
        : null
    }
    const clear = () => {
      start = null
      input.keys.clear()
      input.goal = null
      rt.stick.x = rt.stick.y = 0
      rt.hold = false
      input.held = 0
      input.vx = input.vz = 0
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || rt.moving) return
      start = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
      }
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (rt.moving) return
      const locked = document.pointerLockElement === canvas
      if (start || locked) {
        if (start && start.id !== e.pointerId) return
        const dx = locked ? e.movementX : e.clientX - start!.lastX,
          dy = locked ? e.movementY : e.clientY - start!.lastY
        if (start) {
          start.lastX = e.clientX
          start.lastY = e.clientY
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 3) start.moved = true
        }
        if (locked || start?.moved) {
          rt.yaw -= dx * 0.0024
          rt.pitch = Math.max(-1.25, Math.min(1.25, rt.pitch - dy * 0.0024))
          input.hover = null
        }
      } else input.hover = ground(e)
    }
    const up = (e: PointerEvent) => {
      if (start?.id !== e.pointerId) return
      if (!e.defaultPrevented && !start.moved && !document.pointerLockElement) {
        const point = ground(e)
        // Selection runs on the same pointer release. A picked device must not also move the visitor.
        queueMicrotask(() => {
          input.goal = useShelterStore.getState().roomId ? null : point
        })
      }
      start = null
    }
    // Option/Alt can produce a different character for the same physical movement key.
    const walkKey = (event: KeyboardEvent) =>
      event.altKey && /^Key[WASDE]$/.test(event.code) ? event.code.slice(3).toLowerCase() : event.key.toLowerCase()
    const keydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,select,textarea') || e.ctrlKey || e.metaKey)
        return
      const key = walkKey(e)
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'e'].includes(key)
      ) {
        e.preventDefault()
        input.keys.add(key)
        if (key !== 'e') input.goal = null
      }
    }
    const keyup = (e: KeyboardEvent) => input.keys.delete(walkKey(e))
    const lock = () => {
      if (!rt.moving) canvas.requestPointerLock()?.catch(() => {})
    }
    const visibility = () => {
      if (document.hidden) clear()
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', clear)
    canvas.addEventListener('dblclick', lock)
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', visibility)
    const touch = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number; hold?: boolean }>).detail
      if (d.hold !== undefined) {
        rt.hold = d.hold
      } else rt.stick = d
    }
    window.addEventListener('ars-walk', touch)
    return () => {
      clear()
      setElevatorRider(null)
      rt.nearby = ''
      rt.pressure = 0
      rt.room = rt.liftCall = ''
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', clear)
      canvas.removeEventListener('dblclick', lock)
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('ars-walk', touch)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      input.opened.clear()
      input.unlocked.clear()
    }
  }, [active, gl, get, input, rt, tools])
  useFrame((_, raw) => {
    if (!player.current || !leaves.current || !doorGroup.current) return
    const dt = Math.min(0.08, raw)
    elevatorBank.tick(dt)
    doorGroup.current.visible = active
    if (!active || rt.moving) {
      if (ring.current) ring.current.visible = false
      return
    }
    const { dir } = tools,
      cam = get().camera
    if (input.revision !== rt.walkRevision) {
      input.revision = rt.walkRevision
      setElevatorRider(null)
      input.goal = null
      input.vx = input.vz = 0
      if (!player.current.landing(rt.feet)) {
        const lobby = elevatorSpecs.passenger
        rt.feet.set(lobby.x, FLOORS[rt.floor].elevation, lobby.front + 1.12)
      }
    }
    let nearest = '',
      dist = 2.15
    for (const d of doors) {
      const distance = Math.hypot(rt.feet.x - d.base[0], rt.feet.y - d.base[1], rt.feet.z - d.base[2])
      if (d.airlock && distance < dist) {
        nearest = d.id
        dist = distance
      }
    }
    if (input.door !== nearest) {
      input.held = 0
      input.door = nearest
    }
    if (nearest && (input.keys.has('e') || rt.hold || rt.inspectionTarget !== null)) {
      const gate = doors.find((d) => d.id === nearest)!
      const partner = gate.interlock && doors.find((d) => d.interlock === gate.interlock && d.id !== nearest)
      if (partner) input.unlocked.delete(partner.id)
      if (!partner || (input.opened.get(partner.id) ?? 0) < 0.02) {
        if (!input.held && !input.unlocked.has(nearest)) window.dispatchEvent(new Event('ars-pressure-release'))
        input.held += dt
      }
      if (input.held >= 1.5) input.unlocked.add(nearest)
    } else input.held = 0
    rt.nearby = nearest
    rt.pressure = input.unlocked.has(nearest) ? 1 : Math.min(1, input.held / 1.5)
    const snap = reduceMotion()
    const rider = useElevatorRide.getState().ride?.id
    const car = rider ? elevatorBank.cars[rider] : null
    if (car) rt.feet.y = car.elevation
    const landing = car ? undefined : elevatorBank.callFrom(rt.feet.x, rt.feet.y, rt.feet.z)
    for (const [i, d] of slidingDoors.entries()) {
      const near = Math.hypot(rt.feet.x - d.base[0], rt.feet.y - d.base[1], rt.feet.z - d.base[2]) < 2.6
      if (!near) input.unlocked.delete(d.id)
      const open = Number(near && (!d.airlock || input.unlocked.has(d.id)))
      const last = input.opened.get(d.id) ?? 0
      const value = elevatorBank.landingOpening(d) ?? (snap ? open : open + (last - open) * Math.exp(-7 * dt))
      // Refresh the local shadow once the sliding leaves reach the new open/closed pose.
      if ((value > 0.97 && last <= 0.97) || (value < 0.03 && last >= 0.03)) rt.doorRevision++
      input.opened.set(d.id, value)
      placeDoor(i, value)
    }
    const shutterOpen = 1 - closureProgress(lockdownElapsed(useOperationsStore.getState()), 5, 10)
    for (const d of doors) if (garageShutter(d.id))
      input.opened.set(d.id, shutterOpen * d.height >= WALK.height ? 1 : 0)
    leaves.current.instanceMatrix.needsUpdate = true
    const k = input.keys
    let forward =
      Number(k.has('w') || k.has('arrowup')) - Number(k.has('s') || k.has('arrowdown')) - rt.stick.y
    let side =
      Number(k.has('d') || k.has('arrowright')) - Number(k.has('a') || k.has('arrowleft')) + rt.stick.x
    const len = Math.max(1, Math.hypot(forward, side))
    forward /= len
    side /= len
    const speed = k.has('shift') ? WALK.fast : WALK.walk
    let dx = (Math.sin(rt.yaw) * forward - Math.cos(rt.yaw) * side) * speed,
      dz = (Math.cos(rt.yaw) * forward + Math.sin(rt.yaw) * side) * speed
    const goal = rt.inspectionTarget ?? input.goal
    if (goal) {
      const x = goal.x - rt.feet.x,
        z = goal.z - rt.feet.z,
        d = Math.hypot(x, z)
      if (d < 0.065 || side || forward) input.goal = null
      else {
        dx = (x / d) * Math.min(speed, d * 4)
        dz = (z / d) * Math.min(speed, d * 4)
      }
    }
    const inTransit = car && car.phase !== 'open'
    if (inTransit) {
      input.vx = input.vz = 0
      input.goal = null
    } else {
      // Integrate the exponential velocity curve, so braking distance does not vary with frame rate.
      const tau = dx || dz ? 0.14 : 0.075
      const blend = -Math.expm1(-dt / tau)
      const travelX = dx * dt + (input.vx - dx) * tau * blend
      const travelZ = dz * dt + (input.vz - dz) * tau * blend
      input.vx += (dx - input.vx) * blend
      input.vz += (dz - input.vz) * blend
      if (Math.abs(travelX) + Math.abs(travelZ) > 0.00002)
        player.current.move(rt.feet, travelX, travelZ, doors, input.opened)
    }
    const aboard = inTransit && rider ? rider : elevatorBank.riderAt(rt.feet.x, rt.feet.y, rt.feet.z)
    if (landing && !aboard) {
      const called = elevatorBank.cars[landing.id]
      const action = called.stop !== landing.floor || called.phase === 'moving' ? '已呼梯 · 请稍候' :
        called.phase === 'open' ? '已开门 · 向前进入' : '正在开门'
      rt.liftCall = (landing.id === 'passenger' ? '客梯' : '货梯') + '　' + action
    } else rt.liftCall = ''
    setElevatorRider(aboard)
    if (aboard && !rider && document.pointerLockElement === gl.domElement) document.exitPointerLock()
    const level = car ? car.stop : floorAt(rt.feet.y + 0.02)
    if (level && level !== rt.floor && Math.abs(rt.feet.y - FLOORS[level].elevation) < 0.2) {
      rt.floor = level
      queueMicrotask(() => {
        if (useShelterStore.getState().cameraState === 'walkthrough')
          useShelterStore.getState().followFloor(level)
      })
    }
    cam.position.copy(rt.feet)
    cam.position.y += WALK.eye
    cam.rotation.set(rt.pitch, rt.yaw + Math.PI, 0, 'YXZ')
    cam.updateMatrixWorld()
    cam.getWorldDirection(dir)
    rt.target.copy(cam.position).add(dir)
    const room = roomAt(rt.floor, rt.feet.x, rt.feet.z, rooms)
    rt.room = aboard ? (aboard === 'passenger' ? '客梯轿厢' : '3t 货梯轿厢') : room?.name ?? (Math.abs(rt.feet.x) > 16 ? '平硐步道' : '主通道')
    const exposure = rt.floor.startsWith('L') ? 0.98 : room?.id === 'b3_hydroponics' ? 1.09 : 1.2
    gl.toneMappingExposure += (exposure - gl.toneMappingExposure) * (snap ? 1 : 1 - Math.exp(-dt / 1.05))
    if (ring.current) {
      ring.current.visible = !!input.hover && !document.pointerLockElement
      if (input.hover) {
        ring.current.position.copy(input.hover)
        ring.current.position.y += 0.025
      }
    }
    gl.domElement.dataset.feet = rt.feet
      .toArray()
      .map((v) => v.toFixed(3))
      .join(',')
  }, -2)
  return (
    <group ref={doorGroup} visible={active}>
      <instancedMesh userData={{ localDoorShadow: true }} ref={leaves} args={[undefined, mat, slidingDoors.length * 2]} frustumCulled={false}>
        <boxGeometry />
      </instancedMesh>
      <mesh ref={ring} visible={false} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.147, 0.157, 40]} />
        <meshBasicMaterial color="#fff8ed" depthWrite={false} />
      </mesh>
    </group>
  )
}
