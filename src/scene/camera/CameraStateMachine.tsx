import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import CameraControls from 'camera-controls'
import {
  Box3,
  MathUtils,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from 'three'
import { FLOORS } from '../../data/floors'
import { defaultBlueprint } from '../../data/defaultBlueprint'
import { photo } from '../../data/photographs'
import { facilityAnchor, siteFacilities } from '../../data/siteFacilities'
import { footprint, shaftPlans } from '../../geometry/coords'
import type { TerrainAtlas } from '../../geometry/siteElevations'
import type { CameraStateId } from '../../types/shelter'
import { useShelterStore } from '../../store/useShelterStore'
import { reduceMotion } from '../utils/Model'
import type { SurveyRuntime } from './runtime'
import { morphProjection } from './projection'
import { WALK } from './walkCollision'

CameraControls.install({
  THREE: { Box3, Matrix4, Quaternion, Raycaster, Sphere, Spherical, Vector2, Vector3, Vector4, MathUtils },
})
const freight = shaftPlans.find((s) => s.id === 'freight')!
const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
const smooth = (t: number) => t * t * (3 - 2 * t)
const rad = MathUtils.degToRad
type Camera = PerspectiveCamera | OrthographicCamera
type Pose = { eye: Vector3; look: Vector3; height: number; perspective: boolean }
function desired(atlas: TerrainAtlas, aspect: number) {
  const s = useShelterStore.getState(),
    view = s.cameraState,
    level = FLOORS[s.lastFloor].elevation
  const ref = s.shot ? photo(s.shot) : null
  let target = v(0, 9, 0),
    bearing = v(-1, 0.15, -0.4),
    height = 39,
    lens = 65
  if (s.preset === 'panorama') {
    target = v(40, -63, 148)
    bearing = v(-0.42, 0.62, 1)
    height = 455
  }
  if (view === 'section') {
    target = v(0, -7.3, s.sectionZ)
    bearing = v(0, 0.00001, 1)
    height = 46
  }
  if (s.mode === 'xray') {
    target = v(62, -12, 0)
    bearing = v(0.4, 0.44, 1)
    height = 159
  }
  if (view === 'sectionBox') {
    target = v(0, -7.4, 0)
    bearing = v(0.65, 0.56, 1)
    height = 52
    lens = 35
  }
  if (view === 'floorOrbit' || view === 'plan') {
    target = v(0, level + 0.62, 0)
    bearing = view === 'plan' ? v(0, 1, 0.00001) : v(-0.42, 1, 0.99)
    height = 36
    lens = 35
    const room = defaultBlueprint.rooms.find((item) => item.id === s.roomId)
    if (room) {
      const bounds = footprint(room.bounds)
      target.set(bounds.x, level + 0.62, bounds.z)
      height = 1.45 * Math.max(bounds.d, bounds.w / aspect)
    }
  }
  const place = siteFacilities.find((f) => f.id === s.facilityId)
  if (place) {
    target = new Vector3(...facilityAnchor(place, atlas))
    target.y += 1.3
    height =
      place.kind === 'eastBore'
        ? 175
        : place.kind === 'road'
          ? 138
          : place.kind === 'station'
            ? 42
            : place.kind === 'helipad'
              ? 28
              : 18
    bearing = place.kind === 'eastPortal' ? v(1, 0.32, 0.45) : v(-0.62, 0.54, 0.92)
  }
  if (ref) {
    target.set(...ref.target)
    bearing.set(...ref.bearing)
    height = ref.height
    lens = ref.lens
  }
  const perspective = !(view === 'plan' || (view === 'section' && !s.sectionPerspective))
  const fov = view === 'walkthrough' ? (ref?.lens ?? 60) : MathUtils.radToDeg(2 * Math.atan(24 / (2 * lens)))
  height *= Math.max(1, 1.32 / aspect)
  const dist = perspective ? height / (2 * Math.tan(rad(fov / 2))) : 165
  const eye = target.clone().addScaledVector(bearing.normalize(), dist)
  if (view === 'walkthrough') {
    const landing = s.landing ?? ref?.landing
    eye.set(...(landing ?? ([-4, level, -1] as [number, number, number])))
    eye.y += WALK.eye
    if (ref) target.set(...ref.target)
    else target.copy(eye).add(s.landing ? v(0.38, -0.015, 0.92) : v(1, -0.025, 0.08))
    height = 2 * Math.tan(rad(30)) * eye.distanceTo(target)
  }
  return { eye, look: target, height, perspective, fov, lens }
}
export function CameraStateMachine({ atlas, rt }: { atlas: TerrainAtlas; rt: SurveyRuntime }) {
  const gl = useThree((s) => s.gl),
    size = useThree((s) => s.size),
    set = useThree((s) => s.set),
    get = useThree((s) => s.get)
  const revision = useShelterStore((s) => s.cameraRevision)
  const cams = useMemo(
    () => ({
      persp: new PerspectiveCamera(23, 1, 0.07, 16000),
      ortho: new OrthographicCamera(-1, 1, 1, -1, 0.07, 16000),
    }),
    [],
  )
  const active = useRef<Camera | null>(null),
    previous = useRef<CameraStateId | null>(null)
  const lastRevision = useRef(-1)
  const advance = useRef<((now: number) => void) | null>(null)
  useLayoutEffect(() => {
    const state = useShelterStore.getState(),
      aspect = size.width / size.height,
      goal = desired(atlas, aspect)
    const view = state.cameraState,
      old = active.current,
      oldView = previous.current
    const sameView = lastRevision.current === revision && oldView === view
    lastRevision.current = revision
    if (sameView && view === 'walkthrough' && old) {
      goal.eye.copy(old.position)
      goal.look.copy(old.position).add(old.getWorldDirection(new Vector3()))
    }
    const startLook = rt.target.clone()
    if (oldView === 'walkthrough' && old)
      startLook.copy(old.position).add(old.getWorldDirection(new Vector3()))
    const distance = old ? Math.max(0.25, old.position.distanceTo(startLook)) : 1
    const start: Pose = old
      ? {
          eye: old.position.clone(),
          look: startLook,
          perspective: old instanceof PerspectiveCamera,
          height:
            old instanceof PerspectiveCamera
              ? (2 * distance * Math.tan(rad(old.fov * 0.5))) / old.zoom
              : (old.top - old.bottom) / old.zoom,
        }
      : goal
    const cam = goal.perspective ? cams.persp : cams.ortho
    active.current = cam
    previous.current = view
    cam.zoom = 1
    if (cam instanceof PerspectiveCamera) {
      cam.fov = goal.fov
      cam.aspect = aspect
    } else {
      cam.left = (-goal.height * aspect) / 2
      cam.right = -cam.left
      cam.top = goal.height / 2
      cam.bottom = -cam.top
    }
    cam.updateProjectionMatrix()
    set({ camera: cam })
    const controls = new CameraControls(cam, gl.domElement)
    rt.controls = controls
    controls.smoothTime = 0.22
    controls.draggingSmoothTime = 0.1
    controls.dollyToCursor = true
    controls.minDistance = 1
    controls.maxDistance = 10500
    controls.maxZoom = 26
    controls.minZoom = 0.1
    controls.maxPolarAngle = Math.PI * 0.505
    if (!goal.perspective) {
      controls.mouseButtons.left = CameraControls.ACTION.TRUCK
      controls.mouseButtons.wheel = CameraControls.ACTION.ZOOM
      controls.touches.one = CameraControls.ACTION.TOUCH_TRUCK
      controls.touches.two = CameraControls.ACTION.TOUCH_ZOOM_TRUCK
    }
    const canvas = gl.domElement
    canvas.dataset.view = view
    canvas.dataset.projection = goal.perspective ? 'perspective' : 'orthographic'
    canvas.dataset.ready = 'moving'
    const end = () => {
      advance.current = null
      rt.finish = null
      rt.moving = false
      rt.target.copy(goal.look)
      controls.setLookAt(...goal.eye.toArray(), ...goal.look.toArray(), false)
      controls.update(0)
      controls.enabled = view !== 'walkthrough'
      cam.updateProjectionMatrix()
      cam.position.copy(goal.eye)
      cam.lookAt(goal.look)
      cam.updateMatrixWorld()
      if (view === 'walkthrough') {
        rt.feet.copy(goal.eye)
        rt.feet.y -= WALK.eye
        rt.floor = state.lastFloor
        const d = goal.look.clone().sub(goal.eye).normalize()
        rt.yaw = Math.atan2(d.x, d.z)
        rt.pitch = Math.asin(d.y)
        rt.walkRevision = revision
      }
      canvas.dataset.ready = 'settled'
      canvas.dataset.revision = String(revision)
    }
    const dive = oldView === 'site' && view === 'walkthrough' && state.lastFloor.startsWith('B')
    const drop = oldView === 'floorOrbit' && view === 'walkthrough'
    const duration = dive ? 3650 : drop ? 1200 : oldView === 'walkthrough' ? 1050 : 950
    const started = performance.now(),
      eye = new Vector3(),
      look = new Vector3()
    if (!old || reduceMotion() || sameView) end()
    else {
      rt.moving = true
      rt.finish = end
      controls.enabled = false
      const path = [
        start.eye,
        v(freight.x, 7, freight.z + 0.4),
        v(freight.x, 2.5, freight.z),
        v(freight.x, goal.eye.y, freight.z),
        goal.eye,
      ]
      const looks = [
        start.look,
        v(freight.x, 0.7, freight.z - 0.4),
        v(freight.x, 1.6, freight.z0 + 0.1),
        v(freight.x, goal.eye.y - 0.2, freight.z0),
        goal.look,
      ]
      advance.current = (now) => {
        const t = Math.min(1, (now - started) / duration),
          ease = smooth(t)
        if (t >= 1) {
          end()
          return
        }
        if (dive) {
          const times = [0, 0.24, 0.34, 0.82, 1],
            i = times.findIndex((u, j) => j > 0 && t <= u) - 1,
            blend = smooth((t - times[i]) / (times[i + 1] - times[i]))
          eye.lerpVectors(path[i], path[i + 1], blend)
          look.lerpVectors(looks[i], looks[i + 1], blend)
        } else {
          eye.lerpVectors(start.eye, goal.eye, ease)
          look.lerpVectors(start.look, goal.look, ease)
          if (drop) eye.y += Math.sin(t * Math.PI) * 2.1
        }
        cam.position.copy(eye)
        cam.lookAt(look)
        cam.updateMatrixWorld()
        rt.target.copy(look)
        const d = Math.max(0.2, eye.distanceTo(look)),
          p = MathUtils.lerp(+start.perspective, +goal.perspective, ease)
        const h =
          dive || drop || oldView === 'walkthrough'
            ? 2 * d * Math.tan(rad(MathUtils.lerp(oldView === 'walkthrough' ? 60 : 38, goal.fov, ease) / 2))
            : MathUtils.lerp(start.height, goal.height, ease)
        morphProjection(cam, Math.max(0.1, h), aspect, d, p)
      }
    }
    const skip = (e: Event) => {
      if (rt.finish && dive) {
        e.preventDefault()
        e.stopImmediatePropagation()
        rt.finish()
      }
    }
    canvas.addEventListener('pointerdown', skip, true)
    window.addEventListener('keydown', skip, true)
    return () => {
      canvas.removeEventListener('pointerdown', skip, true)
      window.removeEventListener('keydown', skip, true)
      controls.dispose()
      rt.controls = null
      rt.finish = null
      advance.current = null
    }
  }, [revision, gl, size.width, size.height, atlas, cams, rt, set])
  useFrame((_, dt) => {
    if (advance.current) advance.current(performance.now())
    else if (rt.controls?.enabled) {
      rt.controls.update(Math.min(dt, 0.1))
      rt.controls.getTarget(rt.target, false)
    }
    if (rt.moving) {
      const e = document.getElementById('flight-level')
      if (e) e.textContent = '▽ ' + get().camera.position.y.toFixed(3) + ' m'
    }
  }, -3)
  return null
}
