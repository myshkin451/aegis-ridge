import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Matrix4, Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { Camera } from 'three'
import { FLOORS } from '../../data/floors'
import { footprint } from '../../geometry/coords'
import { floorAt } from '../../geometry/viewGeometry'
import { dimensionText, useMeasurements } from '../../store/useMeasurements'
import type { Dimension, MeasuredPoint } from '../../store/useMeasurements'
import { useOperationsStore } from '../../store/useOperationsStore'
import { useShelterStore } from '../../store/useShelterStore'
import type { Point3 } from '../../types/shelter'
import type { SurveyRuntime } from '../camera/runtime'
import { visibleHit } from '../rooms/picking'
import { closestFeature, drawingEdges, surfaceEdges } from './snapping'
import type { DrawingCut } from './snapping'
import { cutWallEdges } from './wallSections'

function drawAnnotations(
  ctx: CanvasRenderingContext2D, w: number, h: number, camera: Camera,
  dimensions: Dimension[], start: MeasuredPoint | null, cursor: MeasuredPoint | null,
) {
  const probe = new Vector3()
  const project = (point: Point3) => {
    probe.fromArray(point).project(camera)
    return probe.z < -1 || probe.z > 1 ? null : new Vector2((probe.x + 1) * w / 2, (1 - probe.y) * h / 2)
  }
  const line = (a: Vector2, b: Vector2, color: string, dotted = false) => {
    ctx.strokeStyle = color
    ctx.setLineDash(dotted ? [4, 4] : [])
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  const label = (text: string, x: number, y: number) => {
    ctx.fillStyle = '#eceeea'
    ctx.fillRect(x - ctx.measureText(text).width / 2 - 3, y - 8, ctx.measureText(text).width + 6, 16)
    ctx.fillStyle = '#15181a'
    ctx.fillText(text, x, y)
  }
  function dimension(d: Dimension, provisional = false) {
    const a = project(d.a.world), b = project(d.b.world)
    if (!a || !b || a.distanceTo(b) < 1) return
    const along = b.clone().sub(a).normalize()
    const normal = new Vector2(-along.y, along.x)
    if (normal.y > 0) normal.negate()
    const da = a.clone().addScaledVector(normal, 12), db = b.clone().addScaledVector(normal, 12)
    const color = provisional ? '#c0372a' : '#15181a'
    // A light under-stroke keeps a single hairline legible on both rock and white floor plans.
    for (const halo of [true, false]) {
      ctx.lineWidth = halo ? 2 : 1
      const ink = halo ? '#eceeea' : color
      for (const p of [a, b]) line(p, p.clone().addScaledVector(normal, 17), ink)
      line(da, db, ink, provisional)
      const tick = along.clone().add(normal).normalize().multiplyScalar(4)
      for (const p of [da, db]) line(p.clone().sub(tick), p.clone().add(tick), ink)
    }
    label(dimensionText(d), (da.x + db.x) / 2, (da.y + db.y) / 2)
  }
  ctx.clearRect(0, 0, w, h)
  ctx.font = '12px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  dimensions.forEach((d) => dimension(d))
  if (start && cursor) dimension({ a: start, b: cursor }, true)
  for (const mark of [start, cursor]) {
    const p = mark && project(mark.world)
    if (!p) continue
    ctx.setLineDash([])
    ctx.lineWidth = 2
    ctx.strokeStyle = '#eceeea'
    ctx.strokeRect(p.x - 4, p.y - 4, 8, 8)
    ctx.lineWidth = 1
    ctx.strokeStyle = '#c0372a'
    ctx.strokeRect(p.x - 4, p.y - 4, 8, 8)
  }
  if (cursor) {
    const p = project(cursor.world)
    if (p) label(cursor.feature, p.x, p.y + 19)
  }
}

function ActiveDimensions({ rt }: { rt: SurveyRuntime }) {
  const get = useThree((s) => s.get)
  const gl = useThree((s) => s.gl)
  const enabled = useMeasurements((s) => s.enabled)
  const reference = useMeasurements((s) => s.reference)
  const rooms = useOperationsStore((s) => s.rooms)
  const state = useShelterStore((s) => s.cameraState)
  const floor = useShelterStore((s) => s.lastFloor)
  const h = useShelterStore((s) => s.cutHeight), z = useShelterStore((s) => s.sectionZ)
  const cut = useMemo((): DrawingCut | null => state === 'plan'
    ? { kind: 'plan', at: FLOORS[floor].elevation + h, floor }
    : state === 'section' ? { kind: 'section', at: z } : null, [state, floor, h, z])
  const edges = useMemo(() => cut ? drawingEdges(cut, rooms, reference === 'grid' ? 'grid' : 'equipment') : [],
    [cut, rooms, reference])
  const ink = useRef<HTMLCanvasElement | null>(null)
  const pointer = useRef<Vector2 | null>(null), cursor = useRef<MeasuredPoint | null>(null)
  const changed = useRef(true)
  const previous = useRef({ camera: new Matrix4(), projection: new Matrix4(), dpr: 0, w: 0, h: 0, hud: false,
    data: useMeasurements.getState(), view: useShelterStore.getState() })
  const pick = useMemo(() => {
    const ray = new Raycaster(), uv = new Vector2(), plane = new Plane(), world = new Vector3()
    let physicalEdges: ReturnType<typeof drawingEdges> | undefined
    return (screen: Vector2, touch = false): MeasuredPoint | null => {
      const { camera, scene, size } = get()
      uv.set(screen.x / size.width * 2 - 1, 1 - screen.y / size.height * 2)
      ray.setFromCamera(uv, camera)
      const snap = (candidates: ReturnType<typeof drawingEdges>) =>
        closestFeature(candidates, screen, camera, size.width, size.height, useMeasurements.getState().start?.world, touch ? 12 : 7)
      if (cut) {
        if (cut.kind === 'plan') plane.setComponents(0, 1, 0, -cut.at)
        else plane.setComponents(0, 0, 1, -cut.at)
        if (!ray.ray.intersectPlane(plane, world)) return null
        if (reference === 'physical') physicalEdges ??= [...cutWallEdges(scene, cut), ...edges]
        const feature = snap(physicalEdges ?? edges)
        if (feature) return { ...feature, floor: cut.kind === 'plan' ? cut.floor : floorAt(feature.world[1]) }
        if (cut.kind === 'plan') {
          const r = footprint(FLOORS[cut.floor].bounds)
          if (world.x < r.x0 || world.x > r.x1 || world.z < r.z0 || world.z > r.z1) return null
        } else if (Math.abs(world.x) > 40 || world.y < -36 || world.y > 13) return null
        return { world: world.toArray(), feature: cut.kind === 'plan' ? '平面点' : '剖面点', floor: cut.kind === 'plan' ? cut.floor : floorAt(world.y) }
      }
      const hit = visibleHit(scene, ray, true)
      if (!hit) return null
      const feature = snap(surfaceEdges(hit)) ?? { world: hit.point.toArray(), feature: '模型表面' }
      const exterior = useShelterStore.getState().mode === 'exterior'
      return { ...feature, floor: exterior && feature.world[1] < 0 ? undefined : floorAt(feature.world[1]) }
    }
  }, [cut, edges, reference, get])
  useEffect(() => {
    const sheet = document.createElement('canvas')
    sheet.className = 'measurement-overlay'
    sheet.setAttribute('aria-hidden', 'true')
    sheet.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
    gl.domElement.parentElement!.appendChild(sheet)
    ink.current = sheet
    return () => { sheet.remove(); ink.current = null }
  }, [gl])
  useEffect(() => {
    cursor.current = null
    pointer.current = null
    changed.current = true
    if (!enabled) return
    const canvas = gl.domElement
    const oldCursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    const point = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return document.pointerLockElement === canvas
        ? new Vector2(r.width / 2, r.height / 2)
        : new Vector2(e.clientX - r.left, e.clientY - r.top)
    }
    let start: { id: number; p: Vector2 } | undefined
    const down = (e: PointerEvent) => {
      if (!e.isPrimary) { start = undefined; return }
      if (e.button === 0) start = { id: e.pointerId, p: point(e) }
    }
    const move = (e: PointerEvent) => {
      pointer.current = e.buttons ? null : point(e)
      changed.current = true
    }
    const leave = () => { pointer.current = null; changed.current = true }
    const cancel = () => { start = undefined; leave() }
    const up = (e: PointerEvent) => {
      const click = start
      start = undefined
      if (!click || click.id !== e.pointerId || !e.composedPath().includes(canvas) || !useShelterStore.getState().hud) return
      const p = point(e)
      if (click.p.distanceTo(p) > 4) return
      e.preventDefault()
      if (rt.moving) return
      const mark = pick(p, e.pointerType === 'touch')
      if (mark) useMeasurements.getState().mark(mark)
      else useMeasurements.setState({ message: '此处没有可量取的表面，请选择模型或图面。' })
      pointer.current = e.pointerType === 'touch' ? null : p
      changed.current = true
    }
    const dblclick = (e: MouseEvent) => { e.preventDefault(); e.stopImmediatePropagation() }
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('dblclick', dblclick, true)
    window.addEventListener('pointerup', up, true)
    return () => {
      canvas.style.cursor = oldCursor
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('dblclick', dblclick, true)
      window.removeEventListener('pointerup', up, true)
    }
  }, [gl, enabled, pick, rt])
  const lastPick = useRef(-Infinity)
  useFrame(({ camera, size, clock }) => {
    const sheet = ink.current, s = useMeasurements.getState()
    if (!sheet) return
    const last = previous.current
    const view = useShelterStore.getState(), hud = view.hud
    sheet.hidden = !hud
    if (!hud) { last.hud = false; return }
    const dpr = Math.min(window.devicePixelRatio, 2)
    const resized = last.w !== size.width || last.h !== size.height || last.dpr !== dpr
    const cameraChanged = !last.camera.equals(camera.matrixWorldInverse) || !last.projection.equals(camera.projectionMatrix)
    const clippingChanged = view.box !== last.view.box || view.mode !== last.view.mode ||
      view.sectionZ !== last.view.sectionZ || view.floor !== last.view.floor || view.cameraState !== last.view.cameraState
    if (!resized && !cameraChanged && !clippingChanged && !changed.current && s === last.data && last.hud) return
    const ctx = sheet.getContext('2d')
    if (!ctx) return
    if (resized) {
      sheet.width = Math.round(size.width * dpr)
      sheet.height = Math.round(size.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const hovering = enabled && pointer.current && !rt.moving && !rt.controls?.currentAction
    const defer = !!hovering && clock.elapsedTime - lastPick.current < 0.08
    if (!hovering) cursor.current = null
    else if (!defer) {
      cursor.current = pick(pointer.current!)
      lastPick.current = clock.elapsedTime
    }
    if (defer && !cameraChanged && !clippingChanged && !resized && s === last.data && last.hud) return
    const visible = (point: MeasuredPoint) => {
      const [x, y, z] = point.world
      if (view.cameraState === 'plan' || view.cameraState === 'floorOrbit' || view.cameraState === 'walkthrough')
        return point.floor === view.lastFloor
      if (view.cameraState === 'section') return z <= view.sectionZ + .001
      if (view.cameraState === 'sectionBox' && view.mode !== 'xray') {
        const box = view.box
        return x >= box.west && x <= box.east && y >= box.bottom && y <= box.top && z >= box.north && z <= box.south
      }
      return view.mode !== 'exterior' || !point.floor?.startsWith('B')
    }
    drawAnnotations(ctx, size.width, size.height, camera,
      s.dimensions.filter(d => visible(d.a) && visible(d.b)), s.start && visible(s.start) ? s.start : null, cursor.current)
    last.camera.copy(camera.matrixWorldInverse)
    last.projection.copy(camera.projectionMatrix)
    Object.assign(last, { w: size.width, h: size.height, dpr, data: s, hud, view })
    changed.current = defer
  })
  return null
}

export function MeasurementScene({ rt }: { rt: SurveyRuntime }) {
  const needed = useMeasurements((s) => s.enabled || s.dimensions.length > 0)
  return needed ? <ActiveDimensions rt={rt} /> : null
}
