import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
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
import { constrainOrbitPose, constrainSite, flightSpeed, focusAlongRay, obstacleTop, siteGround } from './siteNavigation'
import { visibleHit } from '../rooms/picking'
import { pathToOpenCeiling, routeKey, routeToWalkPosition } from './roomRoutes'
import { useCrewTour } from '../../store/useCrewTour'
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
  if (s.surveyFocus && (view === 'floorOrbit' || view === 'sectionBox')) {
    target.set(...s.surveyFocus.point)
    height = s.surveyFocus.height
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
    if (s.landingTarget) target.set(...s.landingTarget)
    else if (ref) target.set(...ref.target)
    else target.copy(eye).add(s.landing ? v(0.38, -0.015, 0.92) : v(1, -0.025, 0.08))
    height = 2 * Math.tan(rad(30)) * eye.distanceTo(target)
  }
  return { eye, look: target, height, perspective, fov, lens }
}
export function CameraStateMachine({ atlas, rt }: { atlas: TerrainAtlas; rt: SurveyRuntime }) {
  const gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene),
    size = useThree((s) => s.size),
    set = useThree((s) => s.set),
    get = useThree((s) => s.get)
  const revision = useShelterStore((s) => s.cameraRevision)
  const cams = useMemo(
    () => ({
      persp: new PerspectiveCamera(23, 1, 0.5, 15000),
      ortho: new OrthographicCamera(-1, 1, 1, -1, 0.5, 15000),
    }),
    [],
  )
  const active = useRef<Camera | null>(null),
    previous = useRef<CameraStateId | null>(null)
  const flight = useMemo(
    () => ({
      keys: new Set<string>(),
      forward: new Vector3(),
      delta: new Vector3(),
      previous: new Vector3(),
      safe: new Vector3(),
      safeTarget: new Vector3(),
      goalTarget: new Vector3(),
      ray: new Raycaster(),
      probe: new Vector2(),
      focus: new Vector3(),
    }),
    [],
  )
  const pivotDirty = useRef(false)
  const pointerButtons = useRef(0)
  const reanchorPivot = useRef<() => void>(() => {})
  reanchorPivot.current = () => {
    const controls = rt.controls,
      cam = get().camera
    if (!controls?.enabled || !(cam instanceof PerspectiveCamera) || advance.current) return
    const state = useShelterStore.getState()
    if (state.cameraState === 'walkthrough') return
    cam.updateMatrixWorld()
    cam.getWorldDirection(flight.forward).normalize()
    const currentDist = Math.max(controls.minDistance, cam.position.distanceTo(rt.target))
    const referenceY =
      state.mode === 'exterior'
        ? siteGround(atlas, cam.position.x, cam.position.z)
        : state.cameraState === 'sectionBox'
          ? (state.box.bottom + state.box.top) * 0.5
          : state.mode === 'xray'
            ? -9
            : FLOORS[state.lastFloor].elevation + 1
    // Cast along screen center first, with a tight 4-point central guard if center slips onto a distant peak.
    flight.probe.set(0, 0)
    flight.ray.setFromCamera(flight.probe, cam)
    let hitDist = visibleHit(scene, flight.ray, false)?.distance ?? null
    if (hitDist === null || hitDist > 220) {
      let nearest = Infinity
      for (const [nx, ny] of [
        [0.08, 0],
        [-0.08, 0],
        [0, 0.08],
        [0, -0.08],
      ]) {
        flight.probe.set(nx, ny)
        flight.ray.setFromCamera(flight.probe, cam)
        const h = visibleHit(scene, flight.ray, false)
        if (h && h.distance < nearest) nearest = h.distance
      }
      if (nearest < 200 && (hitDist === null || nearest < hitDist * 0.6)) hitDist = nearest
    }
    focusAlongRay(
      cam.position,
      flight.forward,
      hitDist,
      currentDist,
      referenceY,
      Math.max(controls.minDistance, 2),
      flight.focus,
    )
    controls.setFocalOffset(0, 0, 0, false)
    controls.setLookAt(
      cam.position.x,
      cam.position.y,
      cam.position.z,
      flight.focus.x,
      flight.focus.y,
      flight.focus.z,
      false,
    )
    controls.update(0)
    cam.updateMatrixWorld()
    rt.target.copy(flight.focus)
    pivotDirty.current = false
  }
  const resume = useRef<{ revision: number; eye: Vector3; look: Vector3 } | null>(null)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target as HTMLElement)?.matches('input,select,textarea,[role=slider],[contenteditable=true]')
      )
        return
      const key = e.key.toLowerCase()
      if (!['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(key)) return
      flight.keys.add(key)
      if (rt.controls?.enabled && get().camera instanceof PerspectiveCamera) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (!flight.keys.delete(key)) return
      const movingKey =
        flight.keys.has('w') ||
        flight.keys.has('a') ||
        flight.keys.has('s') ||
        flight.keys.has('d') ||
        flight.keys.has('q') ||
        flight.keys.has('e')
      if (!movingKey && pivotDirty.current && pointerButtons.current === 0) reanchorPivot.current()
    }
    const clear = () => {
      flight.keys.clear()
      pointerButtons.current = 0
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  }, [flight, get, rt])
  const lastRevision = useRef(-1)
  const advance = useRef<((now: number) => void) | null>(null)
  useLayoutEffect(() => {
    const state = useShelterStore.getState(),
      aspect = size.width / size.height,
      goal = desired(atlas, aspect)
    const view = state.cameraState,
      old = active.current,
      oldView = previous.current
    const restored = resume.current?.revision === revision ? resume.current : null
    resume.current = null
    if (restored) {
      goal.eye.copy(restored.eye)
      goal.look.copy(restored.look)
    }
    const exterior = view === 'site' && state.mode === 'exterior'
    if (exterior) constrainSite(atlas, goal.eye, goal.eye, goal.eye)
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
    cam.near = view === 'walkthrough' ? 0.12 : exterior ? 0.5 : 0.18
    cam.far = view === 'walkthrough' ? 350 : 15000
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
    controls.maxPolarAngle = view === 'site' && state.mode === 'exterior' ? Math.PI * 0.508 : Math.PI * 0.85
    if (!goal.perspective) {
      controls.mouseButtons.left = CameraControls.ACTION.TRUCK
      controls.mouseButtons.wheel = CameraControls.ACTION.ZOOM
      controls.touches.one = CameraControls.ACTION.TOUCH_TRUCK
      controls.touches.two = CameraControls.ACTION.TOUCH_ZOOM_TRUCK
    }
    pivotDirty.current = false
    const onCanvasPointerDown = (e: PointerEvent) => {
      pointerButtons.current = e.buttons || (e.button === 2 ? 2 : 1)
      if (!controls.enabled || !goal.perspective || view === 'walkthrough' || advance.current) return
      if (pivotDirty.current) reanchorPivot.current()
      // Right-drag or middle-drag translates the viewport; re-anchor the orbit pivot on the next orbit.
      if (e.button === 2 || e.button === 1) pivotDirty.current = true
    }
    const onCanvasPointerUp = (e: PointerEvent) => {
      pointerButtons.current = e.buttons
    }
    const onCanvasWheel = () => {
      if (!controls.enabled || !goal.perspective || view === 'walkthrough' || advance.current) return
      pivotDirty.current = true
    }
    gl.domElement.addEventListener('pointerdown', onCanvasPointerDown, true)
    window.addEventListener('pointerup', onCanvasPointerUp, true)
    gl.domElement.addEventListener('wheel', onCanvasWheel, { capture: true, passive: true })
    const canvas = gl.domElement
    canvas.dataset.view = view
    canvas.dataset.projection = goal.perspective ? 'perspective' : 'orthographic'
    canvas.dataset.ready = 'moving'
    const end = () => {
      advance.current = null
      rt.finish = null
      rt.moving = false
      rt.garageTransfer = rt.dropping = false
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
    const dive =
      view === 'walkthrough' &&
      state.lastFloor.startsWith('B') &&
      oldView !== 'walkthrough' &&
      oldView !== 'floorOrbit' &&
      (!state.landingTarget || oldView === 'site')
    const peel = oldView === 'walkthrough' && (view === 'floorOrbit' || view === 'plan')
    const rise = oldView === 'walkthrough' && start.eye.y < -0.5 && view !== 'walkthrough' && !peel
    const drop = !dive && view === 'walkthrough' && (oldView === 'floorOrbit' || !!state.landingTarget)
    const opening = useCrewTour.getState().tour === 'opening'
    const duration = opening && dive ? 7000 : dive && oldView === 'site' ? 3200 : rise ? 1500 : drop ? 1200 : 950
    const started = performance.now(),
      eye = new Vector3(),
      look = new Vector3()
    const path = [start.eye]
    // Approach the open garage bay below L2, then use the actual freight cut through the slabs.
    const garage = footprint(defaultBlueprint.rooms.find((r) => r.id === 'l1_garage')!.bounds)
    let verifiedPath = true
    if (dive || rise) {
      // Photo presets can update lastFloor before the previous walk has finished exiting.
      const floor = rise ? rt.floor : state.lastFloor
      rt.collision?.freightCar?.guideTo(floor)
      const landing = rise ? start.eye : goal.eye
      const lane = garage.x0 + garage.w * 0.75
      const walking =
        rt.roomRoutes.get(floor + routeKey(landing.x, landing.z)) ??
        (rt.collision && routeToWalkPosition(rt.collision, floor, landing))
      if (walking) {
        const shaftPath = [
          v(lane, 3, garage.z1 + 6),
          v(lane, 2.1, garage.z1 - 1),
          v(lane, 2.1, freight.z + 0.65),
          v(freight.x, 2.1, freight.z + 0.65),
          v(freight.x, landing.y, freight.z + 0.65),
          v(freight.x, landing.y, -1),
          ...walking.slice(1, -1),
        ]
        path.push(...(rise ? shaftPath.reverse() : shaftPath))
      } else {
        // A visitor on a stair flight or beyond the surveyed floor can still select a drawing.
        // Cut directly to it when the intervening camera path cannot be confirmed clear.
        verifiedPath = false
      }
    }
    if (peel && rt.collision) {
      const approach = pathToOpenCeiling(rt.collision, rt.floor, start.eye)
      if (approach) {
        path.push(...approach)
        const from = path[path.length - 1]
        path.push(v(from.x, Math.max(from.y + 4, goal.eye.y), from.z))
      } else verifiedPath = false
    }
    if (drop) {
      const skyY = Math.max(start.eye.y + (oldView === 'walkthrough' ? 4 : 0), goal.eye.y + 4)
      if (oldView === 'walkthrough' && rt.collision) {
        const approach = pathToOpenCeiling(rt.collision, rt.floor, start.eye)
        if (approach) {
          path.push(...approach)
          const from = path[path.length - 1]
          path.push(v(from.x, skyY, from.z))
        } else verifiedPath = false
      }
      const approach = rt.collision && pathToOpenCeiling(rt.collision, state.lastFloor, goal.eye)
      if (approach) {
        const entry = approach.at(-1) ?? goal.eye
        path.push(v(entry.x, skyY, entry.z), ...approach.reverse())
      } else verifiedPath = false
    }
    path.push(goal.eye)
    const legs = path.slice(1).map((b, i) => {
      const a = path[i],
        surfaceLeg = dive ? i === 0 : rise ? i === path.length - 2 : !(drop || peel)
      let lift = surfaceLeg ? Math.min(18, a.distanceTo(b) * 0.14) : 0
      if (surfaceLeg)
        for (let j = 1; j < 64; j++) {
          const t = j / 64,
            p = new Vector3().lerpVectors(a, b, t)
          const top = obstacleTop(atlas, p.x, p.z)
          // Interior inspection endpoints may legitimately be inside a peeled building.
          if (top > p.y && (exterior || dive || rise || (start.eye.y > 0 && goal.eye.y > 0)))
            lift = Math.max(lift, (top - p.y + 0.25) / Math.sin(Math.PI * t))
        }
      return {
        a,
        b,
        lift,
        direction: b.clone().sub(a).normalize(),
        weight: Math.sqrt(Math.max(0.1, a.distanceTo(b))),
      }
    })
    const weight = legs.reduce((sum, l) => sum + l.weight, 0)
    if (!old || reduceMotion() || sameView || restored || !verifiedPath) end()
    else {
      rt.moving = true
      rt.garageTransfer = dive || rise
      rt.dropping = drop || peel
      rt.finish = end
      controls.enabled = false
      const guide = new Vector3()
      advance.current = (now) => {
        const t = Math.min(1, (now - started) / duration),
          ease = smooth(t)
        if (t >= 1) {
          end()
          return
        }
        let remaining = ease * weight
        const leg =
          legs.find((l) => {
            if (remaining <= l.weight) return true
            remaining -= l.weight
            return false
          }) ?? legs[legs.length - 1]
        const u = smooth(Math.min(1, remaining / leg.weight))
        eye.lerpVectors(leg.a, leg.b, u)
        eye.y += Math.sin(Math.PI * u) * leg.lift
        look.lerpVectors(start.look, goal.look, ease)
        if ((dive || rise) && leg.lift === 0) {
          guide.copy(eye).add(leg.direction)
          look.lerp(guide, Math.min(1, Math.sin(Math.PI * t) * 5))
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
    const interrupt = () => {
      if (!advance.current) return
      advance.current = null
      rt.moving = false
      rt.garageTransfer = rt.dropping = false
      rt.finish = null
      const here = cam.position.clone(),
        focus = rt.target.clone()
      if (view === 'walkthrough') {
        // An interrupted shaft flight can be between slabs. Keep its pose in a free inspection camera.
        resume.current = { revision: useShelterStore.getState().cameraRevision + 1, eye: here, look: focus }
        const outside = here.y >= obstacleTop(atlas, here.x, here.z)
        useShelterStore.getState().setView(outside ? 'site' : 'floorOrbit')
      } else {
        if (exterior) constrainSite(atlas, here, here, here)
        const distance = Math.max(0.25, here.distanceTo(focus)),
          projection = cam.projectionMatrix.elements
        const frameHeight = (2 * (projection[15] - distance * projection[11])) / projection[5]
        goal.eye.copy(here)
        goal.look.copy(focus)
        end()
        const naturalHeight =
          cam instanceof OrthographicCamera
            ? cam.top - cam.bottom
            : 2 * distance * Math.tan(rad(cam.fov * 0.5))
        controls.zoomTo(
          MathUtils.clamp(naturalHeight / Math.max(0.05, frameHeight), controls.minZoom, controls.maxZoom),
          false,
        )
        controls.update(0)
      }
    }
    rt.interrupt = interrupt
    const skip = (e: Event) => {
      if (!advance.current || (e instanceof PointerEvent && e.type === 'pointermove' && !e.buttons)) return
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      interrupt()
    }
    for (const event of ['pointerdown', 'pointermove', 'wheel', 'keydown'])
      window.addEventListener(event, skip, true)
    return () => {
      gl.domElement.removeEventListener('pointerdown', onCanvasPointerDown, true)
      window.removeEventListener('pointerup', onCanvasPointerUp, true)
      gl.domElement.removeEventListener('wheel', onCanvasWheel, true)
      for (const event of ['pointerdown', 'pointermove', 'wheel', 'keydown'])
        window.removeEventListener(event, skip, true)
      rt.garageTransfer = rt.dropping = false
      rt.interrupt = null
      controls.dispose()
      rt.controls = null
      rt.finish = null
      advance.current = null
    }
  }, [revision, gl, size.width, size.height, atlas, cams, rt, set])
  useFrame((_, dt) => {
    if (advance.current) advance.current(performance.now())
    else if (rt.controls?.enabled) {
      const cam = get().camera,
        state = useShelterStore.getState()
      const { keys, previous, forward, delta, safe, safeTarget, goalTarget } = flight
      previous.copy(cam.position)
      rt.controls.update(Math.min(dt, 0.1))
      rt.controls.getTarget(rt.target, false)
      delta.set(0, 0, 0)
      if (cam instanceof PerspectiveCamera && keys.size) {
        cam.getWorldDirection(forward)
        forward.y = 0
        if (forward.lengthSq() < 1e-6) {
          forward.set(0, 1, 0).applyQuaternion(cam.quaternion)
          forward.y = 0
        }
        if (forward.lengthSq() > 1e-8) forward.normalize()
        const f = Number(keys.has('w')) - Number(keys.has('s')),
          side = Number(keys.has('d')) - Number(keys.has('a'))
        delta.set(
          forward.x * f - forward.z * side,
          Number(keys.has('e')) - Number(keys.has('q')),
          forward.z * f + forward.x * side,
        )
        const ground =
          state.mode === 'exterior'
            ? siteGround(atlas, cam.position.x, cam.position.z)
            : FLOORS[state.lastFloor].elevation
        if (delta.lengthSq() > 0)
          delta
            .normalize()
            .multiplyScalar(
              flightSpeed(Math.abs(cam.position.y - ground)) * (keys.has('shift') ? 2 : 1) * Math.min(dt, 0.08),
            )
      }
      const moved = delta.lengthSq() > 0
      const exteriorSite = state.mode === 'exterior' && state.cameraState === 'site'
      if (moved) {
        pivotDirty.current = true
        const desiredEye = safeTarget.copy(cam.position).add(delta)
        let dx = delta.x,
          dy = delta.y,
          dz = delta.z
        if (exteriorSite) {
          constrainSite(atlas, previous, desiredEye, safe)
          dx = safe.x - cam.position.x
          dy = safe.y - cam.position.y
          dz = safe.z - cam.position.z
        }
        // moveTo shifts camera + target together without cancelling active mouse rotation smoothing.
        rt.controls.getTarget(goalTarget, false)
        rt.controls.moveTo(goalTarget.x + dx, goalTarget.y + dy, goalTarget.z + dz, false)
        rt.controls.update(0)
        rt.controls.getTarget(rt.target, false)
        cam.updateMatrixWorld()
      } else if (exteriorSite && !previous.equals(cam.position)) {
        const clamped = constrainOrbitPose(atlas, previous, cam.position, rt.target, false, safe, safeTarget)
        if (clamped) {
          rt.controls.setLookAt(
            safe.x,
            safe.y,
            safe.z,
            safeTarget.x,
            safeTarget.y,
            safeTarget.z,
            false,
          )
          rt.controls.update(0)
          rt.target.copy(safeTarget)
          cam.updateMatrixWorld()
        }
      }
    }
    if (rt.moving) {
      const e = document.getElementById('flight-level')
      if (e) e.textContent = '▽ ' + get().camera.position.y.toFixed(3) + ' m'
    }
  }, -3)
  return null
}
