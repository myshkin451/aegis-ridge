import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Mesh, Vector3 } from 'three'
import type { Object3D } from 'three'

// Bake only positions. The stencil and walk BVH do not need a second copy of any material or texture.
export function appendSolids(
  root: Object3D,
  vertices: number[],
  include: (mesh: Mesh) => boolean,
  closedOnly = false,
) {
  root.updateWorldMatrix(true, true)
  const matrix = new Matrix4(),
    instance = new Matrix4(),
    point = new Vector3()
  root.traverse((mesh) => {
    if (!(mesh instanceof Mesh) || !include(mesh)) return
    const geometry = mesh.geometry,
      pos = geometry.getAttribute('position'),
      indices = geometry.getIndex()
    const ranges: [number, number][] =
      closedOnly && !mesh.userData.closedSolid
        ? (mesh.userData.closedRanges ?? [])
        : [[0, indices?.count ?? pos.count]]
    const count = mesh instanceof InstancedMesh ? mesh.count : 1
    for (let i = 0; i < count; i++) {
      matrix.copy(mesh.matrixWorld)
      if (mesh instanceof InstancedMesh) {
        mesh.getMatrixAt(i, instance)
        matrix.multiply(instance)
      }
      for (const [begin, length] of ranges)
        for (let j = begin; j < begin + length; j++) {
          point.fromBufferAttribute(pos, indices ? indices.getX(j) : j).applyMatrix4(matrix)
          vertices.push(point.x, point.y, point.z)
        }
    }
  })
}
export function positionGeometry(vertices: number[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  g.computeBoundingSphere()
  return g
}
