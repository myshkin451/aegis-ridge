import { EdgesGeometry, InstancedMesh, Matrix4, Mesh, Plane, Vector2, Vector3, Vector4 } from 'three'
import type { BufferGeometry, Camera, Intersection } from 'three'
import { FLOORS } from '../../data/floors'
import { footprint, shaftPlans } from '../../geometry/coords'
import { equipmentSolids } from '../../geometry/equipment'
import type { FloorId, Point3, RoomInstance } from '../../types/shelter'
import type { MeasuredPoint } from '../../store/useMeasurements'

export type DrawingCut = { kind: 'plan'; floor: FloorId; at: number } | { kind: 'section'; at: number }
export interface SnapEdge { a: Vector3; b: Vector3; name: string }

function rectangle(edges: SnapEdge[], pts: Point3[], name: string) {
  const corners = pts.map((p) => new Vector3(...p))
  for (let i = 0; i < 4; i++) edges.push({ a: corners[i], b: corners[(i + 1) % 4], name })
}

/** Plan dimensions use the horizontal projection. Sections use the intersection with the cutting plane. */
export function drawingEdges(cut: DrawingCut, rooms: RoomInstance[], reference: 'grid' | 'equipment' | 'all' = 'all') {
  const edges: SnapEdge[] = []
  function add(floor: FloorId, x0: number, x1: number, z0: number, z1: number, bottom: number, top: number, name: string) {
    if (cut.kind === 'plan') {
      if (floor !== cut.floor || bottom > cut.at) return
      rectangle(edges, [[x0, cut.at, z0], [x1, cut.at, z0], [x1, cut.at, z1], [x0, cut.at, z1]], name)
    } else if (cut.at >= z0 && cut.at <= z1) {
      rectangle(edges, [[x0, bottom, cut.at], [x1, bottom, cut.at], [x1, top, cut.at], [x0, top, cut.at]], name)
    }
  }
  for (const room of rooms) {
    const floor = room.floorId
    const level = FLOORS[floor].elevation
    const r = footprint(room.bounds)
    if (reference !== 'equipment')
      add(floor, r.x0, r.x1, r.z0, r.z1, level, level + (room.clearHeightOverride ?? FLOORS[floor].clearHeight), room.name + '房界')
    if (reference === 'grid') continue
    for (const unit of room.equipment) {
      for (const { center: [x, y, z], size: [w, h, d] } of equipmentSolids(unit))
        add(floor, x - w / 2, x + w / 2, z - d / 2, z + d / 2, level + y - h / 2, level + y + h / 2, unit.tagCode + ' 安装轮廓')
    }
  }
  if (reference === 'equipment') return edges
  for (const floor of Object.values(FLOORS)) {
    const r = footprint(floor.bounds)
    add(floor.id, r.x0, r.x1, r.z0, r.z1, floor.elevation, floor.elevation, floor.id + ' 楼板')
    for (const shaft of shaftPlans) {
      if (floor.elevation > FLOORS[shaft.topFloor].elevation) continue
      add(floor.id, shaft.x0, shaft.x1, shaft.z0, shaft.z1, floor.elevation, floor.elevation + floor.clearHeight, shaft.name + '井界')
    }
  }
  return edges
}

const edgeCache = new WeakMap<BufferGeometry, Vector3[]>()
/** Only use contour edges on the picked face. Coplanar triangle diagonals and back edges are excluded. */
export function surfaceEdges(hit: Intersection) {
  const mesh = hit.object
  if (!(mesh instanceof Mesh) || !hit.face || mesh.geometry.getAttribute('position').count > 6000) return []
  const geometry = mesh.geometry
  let vertices = edgeCache.get(geometry)
  if (!vertices) {
    const edges = new EdgesGeometry(geometry, 25)
    const pos = edges.getAttribute('position')
    vertices = Array.from({ length: pos.count }, (_, i) => new Vector3().fromBufferAttribute(pos, i))
    edgeCache.set(geometry, vertices)
    edges.dispose()
  }
  const transform = mesh.matrixWorld.clone()
  if (mesh instanceof InstancedMesh && hit.instanceId !== undefined) {
    const instance = new Matrix4()
    mesh.getMatrixAt(hit.instanceId, instance)
    transform.multiply(instance)
  }
  const localPoint = hit.point.clone().applyMatrix4(transform.clone().invert())
  const face = new Plane().setFromNormalAndCoplanarPoint(hit.face.normal, localPoint)
  const material = Array.isArray(mesh.material) ? mesh.material[hit.face.materialIndex] : mesh.material
  const planes: Plane[] = material.clippingPlanes ?? []
  const tag = hit.instanceId !== undefined && mesh.userData.equipmentTags?.[hit.instanceId]
  const name = tag || '构件'
  const result: SnapEdge[] = []
  for (let i = 0; i < vertices.length; i += 2) {
    const a = vertices[i], b = vertices[i + 1]
    if (Math.abs(face.distanceToPoint(a)) > .0001 || Math.abs(face.distanceToPoint(b)) > .0001) continue
    const start = a.clone().applyMatrix4(transform), end = b.clone().applyMatrix4(transform)
    let clipped = false
    for (const plane of planes) {
      const da = plane.distanceToPoint(start), db = plane.distanceToPoint(end)
      if (da < 0 && db < 0) { clipped = true; break }
      if (da < 0) start.lerp(end, da / (da - db))
      else if (db < 0) end.lerp(start, db / (db - da))
    }
    if (!clipped) result.push({ a: start, b: end, name })
  }
  return result
}

/** Screen-space picking radius stays constant under zoom. Recover the true perspective parameter in world space. */
export function closestFeature(
  edges: SnapEdge[], pointer: Vector2, camera: Camera, width: number, height: number,
  origin: Point3 | undefined, radius: number,
): MeasuredPoint | undefined {
  const clip = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  const ca = new Vector4(), cb = new Vector4(), px = new Vector2(), py = new Vector2(), axis = new Vector2()
  const world = new Vector3(), foot = new Vector3(), delta = new Vector3()
  let bestRank = 3, bestDist = Infinity, best: MeasuredPoint | undefined
  function consider(distance: number, rank: number, point: Vector3, label: string) {
    if (distance > radius || rank > bestRank || (rank === bestRank && distance >= bestDist)) return
    bestRank = rank
    bestDist = distance
    best = { world: point.toArray(), feature: label }
  }
  for (const { a, b, name } of edges) {
    ca.set(a.x, a.y, a.z, 1).applyMatrix4(clip)
    cb.set(b.x, b.y, b.z, 1).applyMatrix4(clip)
    if (ca.z < -ca.w || cb.z < -cb.w || ca.z > ca.w || cb.z > cb.w) continue
    px.set((ca.x / ca.w + 1) * width / 2, (1 - ca.y / ca.w) * height / 2)
    py.set((cb.x / cb.w + 1) * width / 2, (1 - cb.y / cb.w) * height / 2)
    consider(px.distanceTo(pointer), 0, a, name + '端点')
    consider(py.distanceTo(pointer), 0, b, name + '端点')
    axis.subVectors(py, px)
    const t = Math.max(0, Math.min(1, ((pointer.x - px.x) * axis.x + (pointer.y - px.y) * axis.y) / (axis.lengthSq() || 1)))
    const screenDistance = Math.hypot(px.x + t * axis.x - pointer.x, px.y + t * axis.y - pointer.y)
    if (screenDistance > radius) continue
    if (origin) {
      delta.subVectors(b, a)
      const f = foot.fromArray(origin).sub(a).dot(delta) / (delta.lengthSq() || 1)
      if (f > 0 && f < 1) {
        foot.copy(a).lerp(b, f)
        world.copy(foot).project(camera)
        const distance = Math.hypot((1 + world.x) * width / 2 - pointer.x, (1 - world.y) * height / 2 - pointer.y)
        consider(distance, 1, foot, name + '垂足')
      }
    }
    world.lerpVectors(a, b, t * ca.w / ((1 - t) * cb.w + t * ca.w))
    consider(screenDistance, 2, world, name + '边')
  }
  return best
}
