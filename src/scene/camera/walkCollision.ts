import { Box3, BufferGeometry, DoubleSide, Line3, Ray, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { FreightCar } from '../../geometry/freightCar'
import { leafOffset, leafThickness, type Doorway } from '../../geometry/doors'

export const WALK = { radius: 0.25, height: 1.75, eye: 1.65, step: 0.2, walk: 1.4, fast: 2.5 }
const down = new Vector3(0, -1, 0)

/** Plan distance to either leaf on its track, including the parked position beyond the jamb. */
export function doorBlocks(door: Doorway, px: number, pz: number, opening: number, radius = WALK.radius) {
  const x = px - door.base[0],
    z = pz - door.base[2]
  const c = Math.cos(door.yaw),
    s = Math.sin(door.yaw)
  const u = Math.abs(x * c - z * s),
    v = Math.abs(x * s + z * c - (door.trackOffset ?? 0))
  const centre = leafOffset(door, 1, opening)
  const edgeDistance = Math.max(0, Math.abs(u - centre) - door.width / 4)
  const faceDistance = Math.max(0, v - leafThickness / 2)
  return edgeDistance * edgeDistance + faceDistance * faceDistance < radius * radius
}

export class WalkCollision {
  readonly tree: MeshBVH
  private fittings?: MeshBVH
  setFittings(geometry: BufferGeometry) {
    this.fittings?.geometry.dispose()
    this.fittings = new MeshBVH(geometry, { maxLeafTris: 12 })
  }
  raycastFirst(ray: Ray, side: typeof DoubleSide, near: number, far: number) {
    const shell = this.tree.raycastFirst(ray, side, near, far)
    const equipment = this.fittings?.raycastFirst(ray, side, near, shell?.distance ?? far)
    return equipment ?? shell
  }
  private ray = new Ray()
  private bounds = new Box3()
  private capsule = new Line3()
  private closest = new Vector3()
  private axisPoint = new Vector3()
  private normal = new Vector3()
  private candidate = new Vector3()
  constructor(
    readonly geometry: BufferGeometry,
    readonly freightCar?: FreightCar,
  ) {
    this.tree = new MeshBVH(geometry, { maxLeafTris: 12 })
  }
  floor(x: number, y: number, z: number) {
    const car = this.freightCar
    if (car && Math.abs(y - car.elevation) <= WALK.step && car.deckAt(x, z)) return car.elevation
    this.ray.origin.set(x, y + WALK.step + 0.015, z)
    this.ray.direction.copy(down)
    const hit = this.raycastFirst(this.ray, DoubleSide, 0, 2 * WALK.step + 0.05)
    return hit && Math.abs(hit.face?.normal.y ?? 0) > 0.65 ? hit.point.y : undefined
  }
  stands(x: number, y: number, z: number, clearance = 0) {
    const floor = this.floor(x, y, z)
    if (floor === undefined || Math.abs(floor - y) > 0.19) return false
    if (this.freightCar?.hitsSide(x, floor, z, WALK.radius + clearance, WALK.height)) return false
    const segment = this.capsule
    segment.start.set(x, floor + WALK.radius, z)
    segment.end.set(x, floor + WALK.height - WALK.radius, z)
    this.bounds
      .makeEmpty()
      .expandByPoint(segment.start)
      .expandByPoint(segment.end)
      .expandByScalar(WALK.radius + clearance)
    // The capsule can otherwise be wholly inside a broad cabinet and never touch a side triangle.
    this.ray.origin.set(x, floor + 0.025, z)
    this.ray.direction.set(0, 1, 0)
    if (this.raycastFirst(this.ray, DoubleSide, 0.001, WALK.height - 0.025)) return false
    const contact: Parameters<MeshBVH['shapecast']>[0] = {
      intersectsBounds: (box) => box.intersectsBox(this.bounds),
      intersectsTriangle: (tri) =>
        Math.max(tri.a.y, tri.b.y, tri.c.y) > floor + WALK.step &&
        tri.closestPointToSegment(segment) < WALK.radius + clearance - 0.001,
    }
    return !(this.tree.shapecast(contact) || this.fittings?.shapecast(contact))
  }
  landing(feet: Vector3) {
    if (this.stands(feet.x, feet.y, feet.z)) return true
    // A picked tabletop or a shaft opening has no safe eye position. Find the nearest supported aisle.
    for (let radius = 0.25; radius <= 4; radius += 0.25)
      for (let angle = 0; angle < 16; angle++) {
        const x = feet.x + Math.cos((angle * Math.PI) / 8) * radius,
          z = feet.z + Math.sin((angle * Math.PI) / 8) * radius
        if (this.stands(x, feet.y, z)) {
          feet.x = x
          feet.z = z
          return true
        }
      }
    return false
  }
  /** Slide the capsule in short steps, then support its feet on an actual slab or stair tread. */
  move(
    feet: Vector3,
    dx: number,
    dz: number,
    doors: Doorway[] = [],
    opening: ReadonlyMap<string, number> = new Map(),
  ) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.09))
    for (let i = 0; i < steps; i++) {
      const p = this.candidate.copy(feet)
      p.x += dx / steps
      p.z += dz / steps
      const y = this.floor(p.x, p.y, p.z)
      if (y === undefined) continue
      p.y = y
      const segment = this.capsule
      segment.start.copy(p).y += WALK.radius
      segment.end.copy(p).y += WALK.height - WALK.radius
      this.bounds
        .makeEmpty()
        .expandByPoint(segment.start)
        .expandByPoint(segment.end)
        .expandByScalar(WALK.radius + 0.01)
      const slide: Parameters<MeshBVH['shapecast']>[0] = {
        intersectsBounds: (box) => box.intersectsBox(this.bounds),
        intersectsTriangle: (tri) => {
          if (Math.max(tri.a.y, tri.b.y, tri.c.y) <= y + WALK.step + 0.002) return false
          const n = tri.getNormal(this.normal)
          const d = tri.closestPointToSegment(segment, this.closest, this.axisPoint)
          if (d >= WALK.radius) return false
          if (Math.abs(n.y) > 0.8 && this.closest.y > p.y + 0.9) {
            p.copy(feet)
            return true
          }
          n.subVectors(this.axisPoint, this.closest)
          n.y = 0
          if (n.lengthSq() < 0.000001) return false
          n.normalize().multiplyScalar(WALK.radius - d + 0.0002)
          segment.start.add(n)
          segment.end.add(n)
          p.add(n)
          return false
        },
      }
      this.tree.shapecast(slide)
      this.fittings?.shapecast(slide)
      if (this.freightCar?.hitsSide(p.x, p.y, p.z, WALK.radius, WALK.height)) {
        // Slide along the side of the car, matching the capsule response along a static shaft wall.
        if (!this.freightCar.hitsSide(feet.x, p.y, p.z, WALK.radius, WALK.height)) p.x = feet.x
        else if (!this.freightCar.hitsSide(p.x, p.y, feet.z, WALK.radius, WALK.height)) p.z = feet.z
        else continue
      }
      let blocked = false
      for (const door of doors) {
        if (Math.abs(door.base[1] - p.y) > 0.5) continue
        if (doorBlocks(door, p.x, p.z, opening.get(door.id) ?? 0)) {
          blocked = true
          break
        }
      }
      if (!blocked && this.floor(p.x, p.y, p.z) !== undefined) feet.copy(p)
    }
    return feet
  }
  dispose() {
    this.geometry.dispose()
    this.fittings?.geometry.dispose()
  }
}
