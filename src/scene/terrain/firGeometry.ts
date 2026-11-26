import {
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
} from 'three'
import { randomSource } from '../../geometry/random'

// A bough gets narrower towards its tip. Oblique branchlets break up both sides of its silhouette.
export function needleMaterial() {
  const w = 128,
    h = 160,
    rgba = new Uint8Array(w * h * 4)
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const v = (j + 0.5) / h,
        u = ((i + 0.5) / w) * 2 - 1
      const spread = (0.12 + 0.86 * Math.sin(Math.PI * v) ** 0.64) * (1 - 0.32 * v)
      const lateral = Math.abs(u + 0.045 * Math.sin(11 * v))
      const twig = v * 19 - lateral * 3.8 + Math.sin(v * 8) * 0.4
      const rib = Math.abs(twig - Math.round(twig))
      const fringe = 0.7 + 0.3 * Math.cos(twig * Math.PI * 2)
      const needle = 0.13 * Math.cos(2 * Math.PI * (v * 69 + lateral * 8.5))
      const alpha = lateral < 0.043 || (lateral < spread * (fringe + needle) && rib < 0.49 - lateral * 0.17)
      const k = (j * w + i) * 4,
        light = 0.78 + 0.22 * v - 0.11 * lateral + 0.065 * Math.cos(twig * 6)
      rgba[k] = Math.round(230 * light)
      rgba[k + 1] = Math.round(245 * light)
      rgba[k + 2] = Math.round(231 * light)
      rgba[k + 3] = alpha ? 255 : 0
    }
  const map = new DataTexture(rgba, w, h)
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true
  return {
    map,
    material: new MeshStandardMaterial({
      map,
      roughness: 1,
      side: DoubleSide,
      alphaTest: 0.33,
      alphaToCoverage: true,
    }),
  }
}

export function firGeometry(distant = false) {
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [],
    random = randomSource(6731)
  const rings = distant ? 5 : 10
  for (let ring = 0; ring < rings; ring++) {
    const v = ring / rings,
      y = -0.43 + 0.93 * v,
      radius = 0.47 * (1 - v) ** 0.78
    const count = (distant ? 6 : 9) - Math.floor(v * 4),
      phase = ring * 2.399
    for (let i = 0; i < count; i++) {
      const angle = phase + ((i + random() * 0.38) * 2 * Math.PI) / count,
        reach = radius * (0.72 + random() * 0.34)
      const dx = Math.cos(angle),
        dz = Math.sin(angle),
        width = reach * (0.35 + random() * 0.15)
      const mid = 0.48 * reach,
        start = positions.length / 3
      const high = Math.min(0.5, y + 0.1 + random() * 0.025),
        tip = y - 0.026 - random() * 0.045
      positions.push(
        0.012 * dx,
        high,
        0.012 * dz,
        dx * mid - dz * width,
        y - 0.024,
        dz * mid + dx * width,
        dx * mid,
        y + 0.014,
        dz * mid,
        dx * mid + dz * width,
        y - 0.019,
        dz * mid - dx * width,
        dx * reach,
        tip,
        dz * reach,
      )
      uv.push(0.5, 0, 0, 0.43, 0.5, 0.43, 1, 0.43, 0.5, 1)
      for (const index of [0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3]) indices.push(start + index)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}
