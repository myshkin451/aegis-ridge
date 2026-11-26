import { Box3, BufferGeometry, DoubleSide, Line3, Ray, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { Doorway } from '../../geometry/doors'

export const WALK = { radius: 0.25, height: 1.75, eye: 1.65, step: 0.2, walk: 1.4, fast: 2.5 }
const down = new Vector3(0, -1, 0)
export class WalkCollision {
  readonly tree: MeshBVH
  private ray = new Ray()
  private bounds = new Box3()
  private capsule = new Line3()
  private closest = new Vector3()
  private axisPoint = new Vector3()
  private normal = new Vector3()
  private candidate = new Vector3()
  constructor(readonly geometry: BufferGeometry) {
    this.tree = new MeshBVH(geometry, { maxLeafTris: 12 })
  }
  floor(x: number, y: number, z: number) {
    this.ray.origin.set(x, y + WALK.step + 0.015, z)
    this.ray.direction.copy(down)
    const hit = this.tree.raycastFirst(this.ray, DoubleSide, 0, 2 * WALK.step + 0.05)
    return hit && Math.abs(hit.face?.normal.y ?? 0) > 0.65 ? hit.point.y : undefined
  }
  private stands(x: number, y: number, z: number) {
    const floor = this.floor(x, y, z)
    if (floor === undefined || Math.abs(floor - y) > 0.19) return false
    const segment = this.capsule
    segment.start.set(x, floor + WALK.radius, z)
    segment.end.set(x, floor + WALK.height - WALK.radius, z)
    this.bounds
      .makeEmpty()
      .expandByPoint(segment.start)
      .expandByPoint(segment.end)
      .expandByScalar(WALK.radius)
    return !this.tree.shapecast({
      intersectsBounds: (box) => box.intersectsBox(this.bounds),
      intersectsTriangle: (tri) =>
        Math.max(tri.a.y, tri.b.y, tri.c.y) > floor + WALK.step &&
        tri.closestPointToSegment(segment) < WALK.radius - 0.001,
    })
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
      this.tree.shapecast({
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
      })
      let blocked = false
      for (const door of doors) {
        if (Math.abs(door.base[1] - p.y) > 0.5) continue
        const x = p.x - door.base[0],
          z = p.z - door.base[2],
          c = Math.cos(door.yaw),
          s = Math.sin(door.yaw)
        const u = Math.abs(x * c - z * s),
          v = Math.abs(x * s + z * c),
          gap = (opening.get(door.id) ?? 0) * door.width * 0.52
        if (v < WALK.radius + 0.055 && u < door.width * 0.5 + WALK.radius && u + WALK.radius > gap) {
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
  }
}
