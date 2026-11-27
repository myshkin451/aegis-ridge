import { BufferGeometry, Float32BufferAttribute } from 'three'

/** Closed, metre-scaled linens. The hem follows gravity outside the mattress and the pillow pinches at its seam. */
export function beddingGeometry(kind: 'duvet' | 'pillow', nx = 28, nz = 36) {
  const stride = nx + 1,
    layerSize = stride * (nz + 1)
  const positions: number[] = [],
    indices: number[] = []
  for (let layer = 0; layer <= 1; layer++) {
    for (let iz = 0; iz <= nz; iz++)
      for (let ix = 0; ix <= nx; ix++) {
        const u = (ix * 2) / nx - 1,
          v = (iz * 2) / nz - 1
        const a = Math.abs(u),
          b = Math.abs(v)
        let x = u * 0.5,
          z = v * 0.5,
          y: number
        if (kind === 'pillow') {
          const loft = Math.pow(Math.max(0, (1 - a ** 2.7) * (1 - b ** 2.7)), 0.55)
          const creases = Math.sin(19 * u + 3 * v) * b ** 5 + Math.sin(17 * v + 3 * u) * a ** 5
          x *= 1 - 0.12 * b ** 3
          z *= 1 - 0.15 * a ** 3
          y = (layer === 0 ? 0.48 : -0.42) * loft + 0.05 * creases * loft
        } else {
          const hem = Math.max(a ** 8, Math.max(-v, 0) ** 9)
          const sideWave = Math.sin(13 * v + 1.7 * u)
          const folds = 0.077 * Math.cos(12 * u + 1.8 * Math.sin(v * 3)) + 0.047 * Math.sin(v * 13 - u * 4)
          const foldedCorner = Math.max(0, (u + v - 1.15) / 0.85)
          x *= 1 - a ** 5 * (0.022 + 0.02 * sideWave)
          z += 0.011 * Math.cos(6 * u) * b ** 5 - 0.075 * foldedCorner
          y = 0.281 + folds - (0.62 + 0.08 * sideWave) * hem + 0.38 * foldedCorner
          if (layer === 1) y -= 0.06
        }
        positions.push(x, y, z)
      }
  }
  const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d)
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * stride + ix,
        b = a + stride,
        c = b + 1,
        d = a + 1
      quad(a, b, c, d)
      quad(a + layerSize, d + layerSize, c + layerSize, b + layerSize)
      if (ix === 0) quad(a, a + layerSize, b + layerSize, b)
      if (ix === nx - 1) quad(d, c, c + layerSize, d + layerSize)
      if (iz === 0) quad(a, d, d + layerSize, a + layerSize)
      if (iz === nz - 1) quad(b, b + layerSize, c + layerSize, c)
    }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
