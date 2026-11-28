import { InstancedMesh, Matrix4, Vector3 } from 'three'
import type { Object3D } from 'three'
import type { DrawingCut, SnapEdge } from './snapping'

const corners = Array.from({ length: 8 }, (_, i) => new Vector3(
  (i & 1) - .5, ((i >> 1) & 1) - .5, ((i >> 2) & 1) - .5,
))
const cubeEdges = corners.flatMap((_, i) =>
  [1, 2, 4].filter(bit => !(i & bit)).map(bit => [i, i | bit]),
)

/** Intersect the actual architectural instances. A wall opening remains empty up to its lintel;
 * the casing, reveals, glazed panels, and the two sides of the masonry have separate positions. */
export function cutWallEdges(root: Object3D, cut: DrawingCut) {
  const result: SnapEdge[] = []
  const axis = cut.kind === 'plan' ? 1 : 2
  const matrix = new Matrix4(), placed = new Matrix4()
  const world = corners.map(() => new Vector3())
  const centre = new Vector3(), cross = new Vector3()
  root.traverseVisible(object => {
    if (!(object instanceof InstancedMesh) || object.userData.shape !== 'box') return
    const mat = object.material
    if (Array.isArray(mat) || mat.userData.walkSurface !== 'wall' || mat.opacity < .04) return
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, placed)
      matrix.multiplyMatrices(object.matrixWorld, placed)
      // Project the unit box's half-extents onto the cutting normal before transforming any vertices.
      const m = matrix.elements
      const radius = (Math.abs(m[axis]) + Math.abs(m[axis + 4]) + Math.abs(m[axis + 8])) / 2
      if (Math.abs(cut.at - m[12 + axis]) > radius + 1e-7) continue
      const polygon: Vector3[] = []
      function add(point: Vector3) {
        if (polygon.every(p => p.distanceToSquared(point) > 1e-12))
          polygon.push(point.clone().setComponent(axis, cut.at))
      }
      for (let j = 0; j < corners.length; j++) world[j].copy(corners[j]).applyMatrix4(matrix)
      for (const [ia, ib] of cubeEdges) {
        const a = world[ia], b = world[ib]
        const da = a.getComponent(axis) - cut.at, db = b.getComponent(axis) - cut.at
        if (Math.abs(da) < 1e-7) add(a)
        if (Math.abs(db) < 1e-7) add(b)
        if (da * db < 0) add(cross.lerpVectors(a, b, da / (da - db)))
      }
      if (polygon.length < 3) continue
      centre.set(0, 0, 0)
      for (const p of polygon) centre.add(p)
      centre.divideScalar(polygon.length)
      const vertical = axis === 1 ? 2 : 1
      const angle = (p: Vector3) => Math.atan2(p.getComponent(vertical) - centre.getComponent(vertical), p.x - centre.x)
      polygon.sort((a, b) => angle(a) - angle(b))
      const name = object.userData.cutLabels?.[i] ?? '建筑构件切面'
      for (let j = 0; j < polygon.length; j++)
        result.push({ a: polygon[j], b: polygon[(j + 1) % polygon.length], name })
    }
  })
  return result
}
