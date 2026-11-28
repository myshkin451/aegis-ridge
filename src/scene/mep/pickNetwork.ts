import {
  Matrix4,
  Mesh,
  type Scene,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
} from 'three'
import { FLOOR_ORDER } from '../../data/floors'
import { isolateTarget, useOperationsStore } from '../../store/useOperationsStore'
import { useShelterStore } from '../../store/useShelterStore'
import { visibleHit } from '../rooms/picking'
import { lensContainsNdc, serviceCorridor, walkRevealUniforms } from './lens'
import type { SurveyRuntime } from '../camera/runtime'
import type { buildMep, PickSpan } from './buildMep'

type Installation = ReturnType<typeof buildMep>

/** Pick the centreline or valve body in world metres, with a small screen-space tolerance on drawings. */
export function surveyPicker(
  model: Installation,
  rt: SurveyRuntime,
  canvas: HTMLCanvasElement,
  camera: () => Camera,
  scene: Scene,
) {
  const clipped = new Vector3(),
    raycaster = new Raycaster(),
    onPipe = new Vector3(),
    onRay = new Vector3(),
    projected = new Vector3()
  const uv = new Vector2(),
    centre = new Vector2(),
    mid = new Vector3()
  let inside = false,
    pressed: [number, number] | null = null,
    dirty = true
  function position(e: PointerEvent) {
    const r = canvas.getBoundingClientRect()
    uv.set((2 * (e.clientX - r.left)) / r.width - 1, 1 - (2 * (e.clientY - r.top)) / r.height)
    inside = true
    dirty = true
  }
  function reset() {
    inside = false
    dirty = true
    pressed = null
    const state = useShelterStore.getState()
    if (state.hoveredValve) state.setHoveredValve(null)
  }
  function hitAt(cursor: Vector2, type: PickSpan['kind'], spans = model.spans) {
    const s = useShelterStore.getState()
    if (!model.root.visible || s.routeOverview || rt.moving) return
    const cam = camera(),
      floor = model.uniforms.uFloor.value,
      height = canvas.clientHeight
    if (!(cam instanceof OrthographicCamera || cam instanceof PerspectiveCamera)) return
    const ortho = cam instanceof OrthographicCamera
    const mpp = ortho
      ? (cam.top - cam.bottom) / cam.zoom / height
      : (2 * Math.tan((cam.fov * Math.PI) / 360)) / height
    raycaster.setFromCamera(cursor, cam)
    const ray = raycaster.ray
    let nearest = Infinity,
      picked: PickSpan | undefined
    // Only walls hidden by the active lens or by the corridor ceiling reveal can be inspected through.
    const walk = s.cameraState === 'walkthrough',
      piercing = lensContainsNdc(cursor.x, cursor.y)
    for (const span of spans) {
      if (
        span.kind !== type ||
        (span.plenum && !model.uniforms.uPlenum.value) ||
        !s.layers[span.edge.system] ||
        (floor >= 0 && FLOOR_ORDER.indexOf(span.edge.floor) !== floor)
      )
        continue
      const d2 = ray.distanceSqToSegment(span.a, span.b, onRay, onPipe)
      if (!clipped.copy(onPipe).clamp(model.uniforms.uLow.value, model.uniforms.uHigh.value).equals(onPipe))
        continue
      const distance = onRay.distanceTo(ray.origin)
      if (distance <= cam.near || distance >= nearest || distance > cam.far) continue
      const radius = Math.max(span.radius, mpp * (ortho ? 1 : distance) * (walk ? 2.5 : 4.5))
      if (d2 > radius * radius) continue
      nearest = distance
      picked = span
    }
    if (picked && s.mode !== 'xray') {
      // Query the visible, clipped scene only after hitting a selectable pipe/valve.
      // This preserves opaque equipment in front of a lens and ignores a removed ceiling.
      raycaster.far = Math.max(cam.near, nearest - picked.radius - 0.025)
      const opaque = visibleHit(scene, raycaster, true, ({ object, point }) => {
        const mat = (object as Mesh).material
        if (Array.isArray(mat) || mat.opacity < 0.72) return false
        const surface = mat.userData.walkSurface
        if (!walk || !surface) return true
        const y = point.y - walkRevealUniforms.arsWalkFloor.value
        if (piercing && y > 0.045 && point.y < walkRevealUniforms.arsWalkSoffit.value) return false
        const c = serviceCorridor
        return !(
          surface === 'ceiling' &&
          walkRevealUniforms.arsPlenumReveal.value > 0.25 &&
          y > 2.78 &&
          y < 3.1 &&
          point.x >= c.x0 &&
          point.x <= c.x1 &&
          point.z >= c.z0 &&
          point.z <= c.z1
        )
      })
      raycaster.far = Infinity
      if (opaque) return
    }
    return picked
  }
  const down = (e: PointerEvent) => {
    if (e.button === 0) {
      position(e)
      pressed = [e.clientX, e.clientY]
    }
  }
  const up = (e: PointerEvent) => {
    if (e.button !== 0 || !pressed) return
    const dragged = Math.hypot(e.clientX - pressed[0], e.clientY - pressed[1]) > 4
    pressed = null
    if (dragged || e.defaultPrevented) return
    position(e)
    const point = document.pointerLockElement === canvas ? centre : uv
    const repairing = useOperationsStore.getState().panel === 'maintenance'
    const pipe = hitAt(point, 'pipe', repairing ? model.serviceSpans : model.spans)
    if (pipe) {
      if (repairing) isolateTarget(pipe.id)
      else useShelterStore.getState().setWaterTrace(pipe.id)
      // Other camera controls still need the release to end drag/pointer capture.
      e.preventDefault()
    }
  }
  const blur = () => reset()
  const hidden = () => {
    if (document.hidden) reset()
  }
  const queryTargets = (event: Event) => {
    const invoke = (event as CustomEvent).detail?.callback
    if (typeof invoke !== 'function') return
    const r = canvas.getBoundingClientRect(),
      cam = camera()
    const result: { kind: PickSpan['kind']; id: string; x: number; y: number }[] = []
    const seen = new Set<string>()
    let pipes = 0,
      valves = 0
    for (const span of model.spans) {
      if ((span.kind === 'pipe' && pipes >= 9) || (span.kind === 'valve' && valves >= 9) || seen.has(span.id))
        continue
      projected.copy(mid.lerpVectors(span.a, span.b, 0.5)).project(cam)
      if (Math.abs(projected.x) > 0.66 || Math.abs(projected.y) > 0.62 || Math.abs(projected.z) > 1) continue
      const target = new Vector2(projected.x, projected.y)
      if (hitAt(target, span.kind)?.id !== span.id) continue
      result.push({
        kind: span.kind,
        id: span.id,
        x: r.left + ((target.x + 1) * r.width) / 2,
        y: r.top + ((1 - target.y) * r.height) / 2,
      })
      seen.add(span.id)
      if (span.kind === 'pipe') pipes++
      else valves++
      if (pipes >= 9 && valves >= 9) break
    }
    invoke(result)
  }
  canvas.addEventListener('pointerdown', down, true)
  canvas.addEventListener('pointerup', up, true)
  canvas.addEventListener('pointermove', position)
  canvas.addEventListener('pointerleave', reset)
  canvas.addEventListener('pointercancel', reset)
  canvas.addEventListener('ars-mep-targets', queryTargets)
  window.addEventListener('blur', blur)
  document.addEventListener('visibilitychange', hidden)
  const lastCamera = new Matrix4()
  let lastRadius = -1,
    lastFade = -1
  // Pointer input and camera motion can independently change the sightline. Publish only
  // changed valve hits on this instrument timer; the render loop only updates uniforms.
  const timer = window.setInterval(() => {
    const state = useShelterStore.getState(),
      cam = camera(),
      reveal = walkRevealUniforms
    const radius = reveal.arsLens.value.z,
      fade = reveal.arsPlenumReveal.value
    if (
      document.hidden ||
      (!dirty && cam.matrixWorld.equals(lastCamera) && radius === lastRadius && fade === lastFade)
    )
      return
    dirty = false
    lastCamera.copy(cam.matrixWorld)
    lastRadius = radius
    lastFade = fade
    const free = inside && document.pointerLockElement !== canvas
    const pointerHit = free ? hitAt(uv, 'valve') : null
    const hit = pointerHit ?? (state.cameraState === 'walkthrough' ? hitAt(centre, 'valve') : null)
    const id = hit?.id ?? null
    if (state.hoveredValve !== id) state.setHoveredValve(id)
  }, 95)
  return {
    invalidate: () => {
      dirty = true
    },
    dispose() {
      window.clearInterval(timer)
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointerup', up, true)
      canvas.removeEventListener('pointermove', position)
      canvas.removeEventListener('pointerleave', reset)
      canvas.removeEventListener('pointercancel', reset)
      canvas.removeEventListener('ars-mep-targets', queryTargets)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', hidden)
    },
  }
}
