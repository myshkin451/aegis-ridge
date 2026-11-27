import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

/** Cut a folded throw to the actual quilt's upper surface, in its normalized installation coordinates. */
export function foldedThrow(quilt: BufferGeometry, clearance = 0.012) {
  const pos = quilt.getAttribute('position')
  const indices = quilt.index
  const surface: {
    a: Vector3
    b: Vector3
    c: Vector3
    area: number
    minX: number
    maxX: number
    minZ: number
    maxZ: number
  }[] = []
  for (let i = 0; i < (indices?.count ?? pos.count); i += 3) {
    const a = new Vector3().fromBufferAttribute(pos, indices?.getX(i) ?? i)
    const b = new Vector3().fromBufferAttribute(pos, indices?.getX(i + 1) ?? i + 1).sub(a)
    const c = new Vector3().fromBufferAttribute(pos, indices?.getX(i + 2) ?? i + 2).sub(a)
    const area = b.z * c.x - b.x * c.z
    if (area <= 1e-9) continue
    const minZ = a.z + Math.min(0, b.z, c.z),
      maxZ = a.z + Math.max(0, b.z, c.z)
    if (minZ > -0.19 || maxZ < -0.47) continue
    surface.push({
      a,
      b,
      c,
      area,
      minX: a.x + Math.min(0, b.x, c.x),
      maxX: a.x + Math.max(0, b.x, c.x),
      minZ,
      maxZ,
    })
  }
  function height(x: number, z: number) {
    for (const s of surface) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue
      const dx = x - s.a.x,
        dz = z - s.a.z
      const u = (dz * s.c.x - dx * s.c.z) / s.area,
        v = (dx * s.b.z - dz * s.b.x) / s.area
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return s.a.y + u * s.b.y + v * s.c.y
    }
    throw Error('Folded throw extends beyond its duvet')
  }

  const nx = 26,
    nz = 10,
    stride = nx + 1
  const positions: number[] = [],
    faces: number[] = []
  function vertex(u: number, v: number, y: number, rim: number) {
    const x = 0.383 * u * (1 - 0.052 * v ** 8) + 0.004 * v + rim * u
    const z = -0.328 + 0.106 * v * (1 - 0.088 * u ** 8) + 0.004 * Math.sin(3 * u) + rim * 0.6 * v
    const loft = 0.145 + 0.015 * Math.sin(5.5 * u - 2 * v) + 0.016 * Math.exp(-((v - 0.69) ** 2) / 0.025)
    positions.push(x, height(x, z) + clearance + y * loft, z)
    return positions.length / 3 - 1
  }
  const quad = (a: number, b: number, c: number, d: number) => faces.push(a, b, c, a, c, d)
  for (const top of [false, true]) {
    const start = positions.length / 3
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) vertex((2 * i) / nx - 1, (2 * j) / nz - 1, top ? 1 : 0, 0)
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = start + j * stride + i
        if (top) quad(a, a + stride, a + stride + 1, a + 1)
        else quad(a, a + 1, a + stride + 1, a + stride)
      }
  }
  // Roll the selvage around the stack of cloth. The lower and upper faces share their rim normals.
  const perimeter = [
    ...Array.from({ length: nx }, (_, i) => i),
    ...Array.from({ length: nz }, (_, j) => j * stride + nx),
    ...Array.from({ length: nx }, (_, i) => nz * stride + nx - i),
    ...Array.from({ length: nz }, (_, j) => (nz - j) * stride),
  ]
  let previous = perimeter
  for (const [y, rim] of [
    [0.23, 0.006],
    [0.6, 0.009],
    [0.86, 0.006],
    [1, 0],
  ]) {
    const ring = perimeter.map((i) =>
      y === 1
        ? i + stride * (nz + 1)
        : vertex(((i % stride) * 2) / nx - 1, (Math.floor(i / stride) * 2) / nz - 1, y, rim),
    )
    for (let i = 0; i < ring.length; i++) {
      const next = (i + 1) % ring.length
      quad(previous[i], ring[i], ring[next], previous[next])
    }
    previous = ring
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(faces)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}
