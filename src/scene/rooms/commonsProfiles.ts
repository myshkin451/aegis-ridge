import {
  BufferGeometry,
  Float32BufferAttribute,
  CatmullRomCurve3,
  LatheGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// Cross sections in normalized local metres. The inside return on each vessel catches
// a narrow rim highlight; handles are continuous cast tubes with a round cross section.
const sections = {
  'pendant-dome': [
    [0.01, 0.5],
    [0.1, 0.5],
    [0.13, 0.41],
    [0.24, 0.36],
    [0.35, 0.2],
    [0.45, -0.08],
    [0.495, -0.4],
    [0.5, -0.46],
    [0.475, -0.49],
    [0.456, -0.38],
    [0.41, -0.1],
    [0.31, 0.15],
    [0.2, 0.31],
    [0.08, 0.38],
    [0.01, 0.38],
  ],
  'stoneware-cup': [
    [0.01, -0.49],
    [0.28, -0.49],
    [0.34, -0.47],
    [0.39, -0.39],
    [0.47, 0.32],
    [0.48, 0.46],
    [0.46, 0.5],
    [0.42, 0.5],
    [0.41, 0.42],
    [0.34, -0.29],
    [0.3, -0.36],
    [0.01, -0.36],
  ],
  'turned-bottle': [
    [0.01, -0.5],
    [0.34, -0.5],
    [0.39, -0.45],
    [0.4, 0.07],
    [0.39, 0.12],
    [0.23, 0.24],
    [0.15, 0.31],
    [0.15, 0.45],
    [0.18, 0.46],
    [0.18, 0.5],
    [0.11, 0.5],
    [0.11, 0.32],
    [0.01, 0.3],
  ],
  'fruit-bowl': [
    [0.01, -0.48],
    [0.19, -0.48],
    [0.24, -0.37],
    [0.28, -0.3],
    [0.38, -0.01],
    [0.48, 0.33],
    [0.5, 0.45],
    [0.48, 0.49],
    [0.455, 0.4],
    [0.36, 0.02],
    [0.25, -0.23],
    [0.12, -0.28],
    [0.01, -0.28],
  ],
} as const
export type CommonsProfile = keyof typeof sections | 'sofa-wrap' | 'rolled-grip' | 'gooseneck' | 'joinery-edge'
/** Cross section follows the scanned sofa seat and welt over the back, in fractions of its measured height/depth. */
function woolThrow() {
  const profile = [
    [-0.542, 0.38],
    [-0.53, 0.7],
    [-0.498, 0.86],
    [-0.468, 0.94],
    [-0.42, 0.988],
    [-0.36, 1.023],
    [-0.313, 1.02],
    [-0.267, 0.96],
    [-0.222, 0.88],
    [-0.182, 0.75],
    [-0.14, 0.62],
    [-0.083, 0.591],
    [0.064, 0.601],
    [0.19, 0.602],
  ]
  const course = new CatmullRomCurve3(profile.map(([z, y]) => new Vector3(0, y, z)))
  const position: number[] = [],
    index: number[] = []
  const cols = 34,
    rows = 46,
    sample = new Vector3(),
    tangent = new Vector3()
  for (let j = 0; j <= rows; j++) {
    const t = j / rows
    course.getPointAt(t, sample)
    course.getTangentAt(t, tangent)
    for (let i = 0; i <= cols; i++) {
      const u = i / cols,
        fold = 0.018 + 0.014 * Math.sin(u * 24 + 0.65 * Math.sin(t * 4)) + 0.009 * Math.cos(u * 41 + t * 2)
      const scallop = Math.sin(u * 19) * 0.012
      position.push(
        u - 0.5 + 0.024 * Math.sin(t * 7 + u * 1.2),
        sample.y + fold * tangent.z + scallop * (1 - t) ** 5,
        sample.z - fold * tangent.y + 0.013 * Math.sin(u * 9) * t ** 4,
      )
      if (i < cols && j < rows) {
        const k = j * (cols + 1) + i,
          next = k + cols + 1
        index.push(k, next, k + 1, k + 1, next, next + 1)
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(position, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}
export function commonsProfile(kind: CommonsProfile) {
  if (kind === 'sofa-wrap') return woolThrow()
  if (kind === 'joinery-edge') return new RoundedBoxGeometry(1, 1, 1, 2, 0.029)
  if (kind === 'rolled-grip' || kind === 'gooseneck') {
    const curve =
      kind === 'gooseneck'
        ? [
            [0, -0.47, -0.4],
            [0, 0.18, -0.4],
            [0, 0.42, -0.25],
            [0, 0.44, 0.19],
            [0, 0.31, 0.38],
            [0, 0.1, 0.38],
          ]
        : [
            [0, 0.39, -0.42],
            [0, 0.42, 0.12],
            [0, 0.29, 0.39],
            [0, -0.12, 0.36],
            [0, -0.31, 0.15],
            [0, -0.37, -0.4],
          ]
    const geometry = new TubeGeometry(
      new CatmullRomCurve3(curve.map(([x, y, z]) => new Vector3(x, y, z))),
      22,
      kind === 'gooseneck' ? 0.043 : 0.077,
      10,
      false,
    )
    geometry.computeBoundingBox()
    const size = geometry.boundingBox!.getSize(new Vector3())
    geometry.center().scale(1 / size.x, 1 / size.y, 1 / size.z)
    return geometry
  }
  return new LatheGeometry(
    sections[kind].map(([r, y]) => new Vector2(r, y)),
    40,
  )
}
