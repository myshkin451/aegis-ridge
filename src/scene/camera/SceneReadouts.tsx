import { useEffect, useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Mesh, OrthographicCamera, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh'
import { FLOORS, GRID } from '../../data/floors'
import { altitude, worldToGrid } from '../../geometry/coords'
import { roomAt } from '../../geometry/viewGeometry'
import { useShelterStore } from '../../store/useShelterStore'
import type { SurveyRuntime } from './runtime'

export function SceneReadouts({ rt }: { rt: SurveyRuntime }) {
  const get = useThree((s) => s.get),
    gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene)
  const last = useRef(0),
    dirty = useRef(true),
    uv = useRef(new Vector2(0, 0)),
    cache = useRef(new Map<string, HTMLElement>())
  const kit = useMemo(
    () => ({
      ray: new Raycaster(),
      plane: new Plane(),
      centre: new Vector2(),
      p: new Vector3(),
      direction: new Vector3(),
    }),
    [],
  )
  useEffect(() => {
    const canvas = gl.domElement
    const accelerated = new Set<Mesh>()
    for (const g of scene.getObjectByName('山地测区')?.children.slice(0, 3) ?? [])
      g.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.boundsTree ??= new MeshBVH(o.geometry)
          o.raycast = acceleratedRaycast
          accelerated.add(o)
        }
      })
    const coords = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect()
      uv.current.set(((e.clientX - b.left) * 2) / b.width - 1, 1 - ((e.clientY - b.top) * 2) / b.height)
      dirty.current = true
    }
    let startX = 0,
      startY = 0
    const down = (e: PointerEvent) => {
      startX = e.clientX
      startY = e.clientY
    }
    const click = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4 || rt.moving) return
      const s = useShelterStore.getState()
      if (s.cameraState !== 'plan' && s.cameraState !== 'floorOrbit') return
      coords(e)
      kit.ray.setFromCamera(uv.current, get().camera)
      kit.plane.setComponents(0, 1, 0, -FLOORS[s.lastFloor].elevation)
      const p = kit.ray.ray.intersectPlane(kit.plane, kit.p)
      if (!p) return
      const room = roomAt(s.lastFloor, p.x, p.z)
      if (s.cameraState === 'floorOrbit' && room) s.setView('walkthrough', [p.x, p.y, p.z])
      else s.focusRoom(room?.id ?? null)
    }
    canvas.addEventListener('pointermove', coords)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerup', click)
    return () => {
      canvas.removeEventListener('pointermove', coords)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', click)
      for (const o of accelerated) {
        o.geometry.boundsTree = undefined
        o.raycast = Mesh.prototype.raycast
      }
    }
  }, [gl, scene, rt, get, kit])
  useFrame(({ camera, size }, dt) => {
    last.current += dt
    if (last.current < 0.115) return
    last.current = 0
    const s = useShelterStore.getState()
    if (!s.hud) return
    function el(id: string) {
      let node = cache.current.get(id)
      if (!node?.isConnected) {
        node = document.getElementById(id) ?? undefined
        if (node) cache.current.set(id, node)
      }
      return node
    }
    const content = (id: string, value: string) => {
      const e = el(id)
      if (e && e.textContent !== value) e.textContent = value
    }
    const walking = s.cameraState === 'walkthrough'
    if (
      dirty.current ||
      walking ||
      rt.controls?.active ||
      rt.moving ||
      gl.domElement.dataset.instrumentRevision !== String(s.cameraRevision)
    ) {
      dirty.current = false
      gl.domElement.dataset.instrumentRevision = String(s.cameraRevision)
      kit.ray.setFromCamera(walking ? kit.centre : uv.current, camera)
      kit.ray.firstHitOnly = true
      if (s.cameraState === 'section') {
        kit.plane.setComponents(0, 0, 1, -s.sectionZ)
        rt.hit =
          !!kit.ray.ray.intersectPlane(kit.plane, rt.readout) &&
          Math.abs(rt.readout.x) <= 40 &&
          rt.readout.y >= -36 &&
          rt.readout.y <= 13
      } else if (s.cameraState === 'plan') {
        kit.plane.setComponents(0, 1, 0, -(FLOORS[s.lastFloor].elevation + s.cutHeight))
        rt.hit = !!kit.ray.ray.intersectPlane(kit.plane, rt.readout)
      } else {
        const meshes: Mesh[] = []
        scene.traverseVisible((o) => {
          if (
            o instanceof Mesh &&
            (o.material.isMeshStandardMaterial || o.geometry.boundsTree) &&
            o.material.opacity > 0.22 &&
            o.userData.shape !== 'leaf' &&
            o.userData.shape !== 'fir' &&
            o.userData.shape !== 'distantFir'
          )
            meshes.push(o)
        })
        const hit = kit.ray.intersectObjects(meshes, false).find((hit) => {
          const m = (hit.object as Mesh).material
          return !Array.isArray(m) && !m.clippingPlanes?.some((p) => p.distanceToPoint(hit.point) < 0)
        })
        rt.hit = !!hit
        if (hit) rt.readout.copy(hit.point)
      }
    }
    const pos = rt.readout,
      g = worldToGrid(pos.x, pos.z),
      axis =
        g.gx >= 0 && g.gx < GRID.columns && g.gz >= 0 && g.gz < GRID.rows
          ? String.fromCharCode(65 + g.gx) + '/' + (g.gz + 1)
          : '—'
    content(
      'cursor-coords',
      rt.hit
        ? 'X ' + pos.x.toFixed(2) + '　Z ' + pos.z.toFixed(2) + '　▽ ' + pos.y.toFixed(3) + '　轴 ' + axis
        : 'X —　 Z —　 ▽ —　 轴 —',
    )
    camera.getWorldDirection(kit.direction)
    const azimuth = (Math.atan2(kit.direction.x, -kit.direction.z) * 180) / Math.PI
    el('north-needle')?.setAttribute('transform', 'rotate(' + -azimuth + ' 16 18)')
    const range =
      rt.hit && walking
        ? Math.max(1, camera.position.distanceTo(pos))
        : Math.max(0.5, camera.position.distanceTo(rt.target))
    const h =
      camera instanceof OrthographicCamera
        ? (camera.top - camera.bottom) / camera.zoom
        : 2 * range * Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360)
    const px = size.height / h
    const length = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].filter((l) => l * px < 179).at(-1) ?? 0.5
    const bar = el('scale-bar')
    if (bar) bar.style.width = Math.max(12, length * px) + 'px'
    content('scale-quarter', String(length / 4))
    content('scale-half', String(length / 2))
    content('scale-full', length + ' m')
    if (walking) {
      content('walk-room', rt.room || '竖井下潜')
      content('flight-level', '▽ ' + (rt.moving ? camera.position.y : rt.feet.y).toFixed(3) + ' m')
      content('walk-altitude', '海拔 ' + altitude(camera.position.y).toFixed(2) + ' m')
      const pin = el('map-heading')
      pin?.setAttribute(
        'transform',
        'translate(' + rt.feet.x + ' ' + rt.feet.z + ') rotate(' + (-rt.yaw * 180) / Math.PI + ')',
      )
      const gauge = el('pressure-control')
      if (gauge) gauge.hidden = !rt.nearby
      content(
        'pressure-text',
        rt.pressure >= 1 ? '已平压 · 开门' : '长按 E 泄压　' + Math.round((1 - rt.pressure) * 100) + '%',
      )
      el('pressure-hand')?.setAttribute('transform', 'rotate(' + (-55 + 110 * (1 - rt.pressure)) + ' 18 18)')
    }
  })
  return null
}
