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
import { defaultBlueprint } from '../../data/defaultBlueprint'
import { equipmentSolids } from '../../geometry/equipment'
import { BoxGeometry, Group } from 'three'
import { FreightCar } from '../../geometry/freightCar'
import { doors, doorTints, leafOffset, leafThickness, manualDoorAvailable } from '../../geometry/doors'
import { floorAt, roomAt } from '../../geometry/viewGeometry'
import { FLOORS, FLOOR_ORDER } from '../../data/floors'
import { useShelterStore } from '../../store/useShelterStore'
import { appendSolids, positionGeometry } from '../utils/solidGeometry'
import { reduceMotion } from '../utils/Model'
import { pbrMaterial } from '../materials/pbrLibrary'
import type { SurveyRuntime } from './runtime'
import { surveyRoomRoutes } from './roomRoutes'
import { WALK, WalkCollision } from './walkCollision'

function hiss(ctx: AudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate),
    samples = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * 0.17
  const src = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    gain = ctx.createGain()
  src.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.value = 1650
  filter.Q.value = 0.65
  gain.gain.setValueAtTime(0.22, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.004, ctx.currentTime + 1.5)
  src.connect(filter).connect(gain).connect(ctx.destination)
  src.start()
  src.onended = () => {
    src.disconnect()
    filter.disconnect()
    gain.disconnect()
  }
}

export function WalkthroughRig({ rt }: { rt: SurveyRuntime }) {
  const gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene),
    get = useThree((s) => s.get)
  const active = useShelterStore((s) => s.cameraState === 'walkthrough')
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
      audio: null as AudioContext | null,
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
    const installed = doors.map((d) => ({
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
  const mat = useMemo(() => pbrMaterial('steel', true), [])
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
    const hulls = new Group()
    const cube = new BoxGeometry(1, 1, 1)
    for (const room of defaultBlueprint.rooms)
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
    const collision = new WalkCollision(positionGeometry(vertices), new FreightCar())
    rt.collision = player.current = collision
    rt.roomRoutes = surveyRoomRoutes(collision)
    gl.domElement.dataset.surveyedAnchors = String(rt.roomRoutes.size)
    return () => {
      collision.dispose()
      rt.collision = player.current = null
    }
  }, [scene, rt, mat, gl])
  useLayoutEffect(() => {
    doors.forEach((d, i) => {
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
    const audio = () => {
      if (!input.audio) {
        try {
          input.audio = new AudioContext()
        } catch {
          return
        }
      }
      if (input.audio.state === 'suspended') void input.audio.resume().catch(() => {})
    }
    const ground = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      tools.uv.set(
        (2 * (e.clientX - rect.left)) / rect.width - 1,
        1 - (2 * (e.clientY - rect.top)) / rect.height,
      )
      tools.ray.setFromCamera(tools.uv, get().camera)
      const hit = player.current?.tree.raycastFirst(tools.ray.ray, DoubleSide, 0.06, 45)
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
          rt.yaw -= dx * 0.003
          rt.pitch = Math.max(-1.32, Math.min(1.32, rt.pitch - dy * 0.003))
          input.hover = null
        }
      } else input.hover = ground(e)
    }
    const up = (e: PointerEvent) => {
      if (start?.id !== e.pointerId) return
      if (!start.moved && !document.pointerLockElement) {
        const point = ground(e)
        // Selection runs on the same pointer release. A picked device must not also move the visitor.
        queueMicrotask(() => {
          input.goal = useShelterStore.getState().roomId ? null : point
        })
      }
      start = null
    }
    const keydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,select,textarea') || e.ctrlKey || e.metaKey || e.altKey)
        return
      const key = e.key.toLowerCase()
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'e'].includes(key)
      ) {
        e.preventDefault()
        input.keys.add(key)
        if (key === 'e' && rt.nearby) audio()
        if (key !== 'e') input.goal = null
      }
    }
    const keyup = (e: KeyboardEvent) => input.keys.delete(e.key.toLowerCase())
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
        if (d.hold && rt.nearby) audio()
      } else rt.stick = d
    }
    window.addEventListener('ars-walk', touch)
    return () => {
      clear()
      rt.nearby = ''
      rt.pressure = 0
      rt.room = ''
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
      if (input.audio) void input.audio.close().catch(() => {})
      input.audio = null
      input.opened.clear()
      input.unlocked.clear()
    }
  }, [active, gl, get, input, rt, tools])
  useFrame((_, raw) => {
    if (!player.current || !leaves.current || !doorGroup.current) return
    const guided = rt.moving && rt.garageTransfer
    doorGroup.current.visible = active || guided
    if (rt.moving) {
      if (ring.current) ring.current.visible = false
      if (guided) {
        const eye = get().camera.position
        for (let i = 0; i < doors.length; i++) {
          const [x, y, z] = doors[i].base
          const distance = Math.hypot(eye.x - x, eye.y - WALK.eye - y, eye.z - z)
          // The guide's passage is visual. It does not grant a manual pressure-door unlock.
          const fraction = Math.max(0, Math.min(1, (3.15 - distance) / 1.7))
          const opening = fraction * fraction * (3 - 2 * fraction)
          placeDoor(i, manualDoorAvailable(doors[i], player.current.freightCar?.stop) ? opening : 0)
        }
        leaves.current.instanceMatrix.needsUpdate = true
      }
      return
    }
    if (!active) return
    const dt = Math.min(0.08, raw),
      { dir } = tools,
      cam = get().camera
    if (input.revision !== rt.walkRevision) {
      input.revision = rt.walkRevision
      input.goal = null
      input.vx = input.vz = 0
      if (!player.current.landing(rt.feet)) rt.feet.set(-4, FLOORS[rt.floor].elevation, -1)
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
    if (nearest && (input.keys.has('e') || rt.hold)) {
      const gate = doors.find((d) => d.id === nearest)!
      const partner = gate.interlock && doors.find((d) => d.interlock === gate.interlock && d.id !== nearest)
      if (partner) input.unlocked.delete(partner.id)
      if (!partner || (input.opened.get(partner.id) ?? 0) < 0.02) {
        if (!input.held && input.audio && !input.unlocked.has(nearest)) hiss(input.audio)
        input.held += dt
      }
      if (input.held >= 1.5) input.unlocked.add(nearest)
    } else input.held = 0
    rt.nearby = nearest
    rt.pressure = input.unlocked.has(nearest) ? 1 : Math.min(1, input.held / 1.5)
    const snap = reduceMotion()
    const car = player.current.freightCar
    car?.callFrom(rt.feet.x, rt.feet.y, rt.feet.z)
    for (const [i, d] of doors.entries()) {
      const near = Math.hypot(rt.feet.x - d.base[0], rt.feet.y - d.base[1], rt.feet.z - d.base[2]) < 2.6
      if (!near) input.unlocked.delete(d.id)
      const available = manualDoorAvailable(d, car?.stop)
      const open = Number(near && available && (!d.airlock || input.unlocked.has(d.id))),
        last = input.opened.get(d.id) ?? 0
      const value = snap || !available ? open : open + (last - open) * Math.exp(-7 * dt)
      // Refresh the local shadow once the sliding leaves reach the new open/closed pose.
      if ((value > 0.97 && last <= 0.97) || (value < 0.03 && last >= 0.03)) rt.doorRevision++
      input.opened.set(d.id, value)
      placeDoor(i, value)
    }
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
    if (input.goal) {
      const x = input.goal.x - rt.feet.x,
        z = input.goal.z - rt.feet.z,
        d = Math.hypot(x, z)
      if (d < 0.065 || side || forward) input.goal = null
      else {
        dx = (x / d) * Math.min(speed, d * 4)
        dz = (z / d) * Math.min(speed, d * 4)
      }
    }
    const blend = 1 - Math.exp(-dt / 0.095)
    input.vx += (dx - input.vx) * blend
    input.vz += (dz - input.vz) * blend
    if (Math.abs(input.vx) + Math.abs(input.vz) > 0.002)
      player.current.move(rt.feet, input.vx * dt, input.vz * dt, doors, input.opened)
    const level = floorAt(rt.feet.y + 0.02)
    if (level !== rt.floor && Math.abs(rt.feet.y - FLOORS[level].elevation) < 0.2) {
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
    const room = roomAt(rt.floor, rt.feet.x, rt.feet.z)
    rt.room = room?.name ?? (Math.abs(rt.feet.x) > 16 ? '平硐步道' : '主通道')
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
      <instancedMesh userData={{ localDoorShadow: true }} ref={leaves} args={[undefined, mat, doors.length * 2]} frustumCulled={false}>
        <boxGeometry />
      </instancedMesh>
      <mesh ref={ring} visible={false} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.147, 0.157, 40]} />
        <meshBasicMaterial color="#fff8ed" depthWrite={false} />
      </mesh>
    </group>
  )
}
