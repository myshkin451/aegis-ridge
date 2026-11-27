// Deterministic, metre-scale survey models. Run with node scripts/generate-domestic-models.mjs.
import { writeFile } from 'node:fs/promises'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Vector3,
  QuadraticBezierCurve3,
  TubeGeometry,
} from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

const tau = Math.PI * 2
const signedPower = (n, power) => Math.sign(n) * Math.abs(n) ** power
const bell = (x, width) => Math.exp(-((x / width) ** 2))
function grid(columns, rows, point, invert = false, wrap = false) {
  const positions = [],
    indices = [],
    stride = columns + (wrap ? 0 : 1)
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i < stride; i++) positions.push(...point(i / columns, j / rows))
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < columns; i++) {
      const a = j * stride + i,
        b = a + stride,
        d = j * stride + ((i + 1) % stride),
        c = d + stride
      if (invert) indices.push(a, d, c, a, c, b)
      else indices.push(a, b, c, a, c, d)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function pillow() {
  // Full side gusset, pinched seam and an indentation from the sleeper's head.
  return grid(
    44,
    20,
    (u, v) => {
      const angle = tau * u,
        lat = Math.PI * (0.000001 + 0.999998 * v)
      const r = Math.sin(lat) ** 0.72,
        n = Math.cos(lat),
        seam = bell(v - 0.5, 0.037)
      const x = signedPower(Math.cos(angle), 0.52),
        z = signedPower(Math.sin(angle), 0.52)
      const creased = (0.65 * Math.sin(7 * angle + 0.6) + 0.35 * Math.sin(11 * angle)) * bell(v - 0.5, 0.16)
      const corner = Math.abs(x * z) ** 3
      const radius = r * (1 + 0.007 * seam - 0.02 * corner + 0.006 * creased)
      const dent = 0.13 * Math.max(0, n) ** 2 * bell(radius * x + 0.17, 0.42) * bell(radius * z - 0.06, 0.57)
      const y = n * (1 - 0.14 * corner * r ** 2) + 0.014 * creased * r - dent
      return [0.34 * x * radius, 0.11 * y, 0.235 * z * radius]
    },
    true,
    true,
  )
}

function duvet() {
  // Padded cloth rolls over the mattress edge before falling. Keep the folded head corner
  // on the sleeping surface and the side hem outside the foam, including the shallower bunk quilts.
  const nx = 24,
    nz = 30
  function cloth(u, v, bottom) {
    const side = Math.max(0, (Math.abs(u) - 0.76) / 0.24)
    const foot = Math.max(0, (-v - 0.70) / 0.30)
    const roll = (t, power) => 1 - Math.max(0, 1 - t) ** power
    const x = 0.53 * Math.sign(u) * (Math.min(Math.abs(u), 0.76) + 0.24 * roll(side, 2.7))
      + 0.004 * side * Math.sin(8 * v + 2.1 * u)
    const curl = Math.max(0, Math.min(1, (0.57 * u + v - 1.09) / 0.46))
    const z = 0.78 * (Math.max(v, -0.70) - 0.30 * roll(foot, 5))
      - 0.047 * curl * curl + 0.0035 * Math.sin(4.7 * u) * Math.max(v, 0) ** 6
    // Three asymmetric ridges fade separately: a long lifted bias fold, a looser
    // neighbouring roll and a short fan crease where the top has been turned down.
    const bias = u + 0.29 - 0.27 * v + 0.10 * Math.sin(3.4 * v)
    const fold1 = 0.038 * bell(bias, 0.16) * bell(v - 0.24, 0.64)
    const fold2 = 0.029 * bell(u - 0.25 + 0.25 * v + 0.10 * v * v, 0.21) * bell(v - 0.43, 0.52)
    const fold3 = 0.022 * bell(v - 0.68 - 0.40 * u + 0.13 * u * u, 0.115) * bell(u + 0.55, 0.38)
    const stitch = 0.003 * bell(Math.sin((v - 0.07 * u) * Math.PI * 2), 0.23)
    const y =
      0.047 + fold1 + fold2 + fold3 - stitch +
      0.0038 * Math.sin(10 * u + 2.4 * Math.sin(3.2 * v)) -
      (0.154 + 0.008 * Math.sin(7 * v + 1.8 * u)) * Math.max(side * side, foot * foot) +
      0.023 * Math.sin(Math.PI * 0.85 * curl) +
      (bottom ? -0.012 - (0.010 + 0.60 * (fold1 + fold2 + fold3)) * (1 - Math.max(foot, side)) : 0)
    return [x, y, z]
  }
  const top = grid(nx, nz, (u, v) => cloth(2 * u - 1, 2 * v - 1, false))
  const lower = grid(nx, nz, (u, v) => cloth(2 * u - 1, 2 * v - 1, true), true)
  const seams = [
    grid(nx, 1, (s, t) => cloth(2 * s - 1, -1, t === 0), true),
    grid(nx, 1, (s, t) => cloth(2 * s - 1, 1, t === 0)),
    grid(nz, 1, (s, t) => cloth(-1, 2 * s - 1, t === 0)),
    grid(nz, 1, (s, t) => cloth(1, 2 * s - 1, t === 0), true),
  ]
  return mergeGeometries([top, lower, ...seams])
}

function sofaCushion() {
  // Tailored boxed upholstery. Two raised welts sit above and below the straight side band.
  const bands = [0.001, 0.18, 0.275, 0.31, 0.345, 0.5, 0.655, 0.69, 0.725, 0.82, 0.999]
  return grid(
    32,
    10,
    (u, j) => {
      const v = bands[Math.round(j * 10)]
      const theta = tau * u,
        lat = Math.PI * v
      const core = Math.sin(lat) ** 0.36
      const piping = 0.014 * (bell(v - 0.31, 0.03) + bell(v - 0.69, 0.03))
      const x = signedPower(Math.cos(theta), 0.31),
        z = signedPower(Math.sin(theta), 0.31)
      const radius = core * (1 + piping)
      const dent = v < 0.5 ? 0.16 * bell(x * radius + 0.18, 0.58) * bell(z * radius - 0.12, 0.63) : 0
      const crease = 0.033 * bell(v - 0.32, 0.16) * Math.sin(7 * theta + 2.3 * v)
      return [
        0.47 * x * radius,
        0.128 * (signedPower(Math.cos(lat), 0.65) - dent + crease),
        0.475 * z * radius,
      ]
    },
    true,
    true,
  )
}

// Revolve a stack of asymmetric rounded rings. Continuing from the lip into the bowl
// produces a hollow enamel interior with continuous normals down to the drain.
function pottery(rings, segments) {
  return grid(
    segments,
    rings.length - 1,
    (u, v) => {
      const [w, h, d, offsetZ, p] = rings[Math.round(v * (rings.length - 1))]
      const a = tau * u
      return [w * signedPower(Math.cos(a), p), h, offsetZ + d * signedPower(Math.sin(a), p)]
    },
    false,
    true,
  )
}
function toilet() {
  const bowl = pottery(
    [
      [0.001, 0.014, 0.001, 0.048, 1],
      [0.15, 0.013, 0.21, 0.041, 0.84],
      [0.17, 0.026, 0.218, 0.036, 0.83],
      [0.163, 0.08, 0.204, 0.035, 0.82],
      [0.134, 0.18, 0.167, 0.044, 0.84],
      [0.161, 0.24, 0.206, 0.025, 0.91],
      [0.223, 0.29, 0.274, 0.005, 1],
      [0.269, 0.349, 0.327, -0.009, 1],
      [0.286, 0.393, 0.339, -0.012, 0.93],
      [0.291, 0.415, 0.344, -0.016, 0.91],
      [0.285, 0.437, 0.341, -0.017, 0.9],
      [0.274, 0.449, 0.33, -0.017, 0.91],
      [0.235, 0.451, 0.286, -0.022, 0.97],
      [0.216, 0.442, 0.267, -0.025, 1],
      [0.215, 0.421, 0.264, -0.025, 1],
      [0.205, 0.396, 0.253, -0.025, 1],
      [0.195, 0.359, 0.236, -0.021, 1],
      [0.15, 0.315, 0.175, -0.004, 1],
      [0.09, 0.273, 0.096, 0.022, 0.93],
      [0.044, 0.258, 0.058, 0.033, 0.95],
      [0.039, 0.243, 0.052, 0.036, 1],
      [0.001, 0.24, 0.001, 0.036, 1],
    ],
    58,
  )
  const tank = new RoundedBoxGeometry(0.55, 0.923, 0.2, 2, 0.032).translate(0, 0.473, 0.33)
  const lid = new RoundedBoxGeometry(0.559, 0.027, 0.212, 2, 0.012).translate(0, 0.944, 0.33)
  for (const part of [tank, lid]) part.deleteAttribute('uv')
  return mergeGeometries([bowl, mergeVertices(tank), mergeVertices(lid)])
}
function basin() {
  return pottery(
    [
      [0.001, 0.005, 0.001, 0, 1],
      [0.258, 0.006, 0.19, 0, 0.45],
      [0.287, 0.02, 0.218, 0, 0.44],
      [0.319, 0.066, 0.247, 0, 0.49],
      [0.347, 0.135, 0.282, 0, 0.52],
      [0.351, 0.176, 0.285, 0, 0.46],
      [0.35, 0.195, 0.282, 0, 0.41],
      [0.344, 0.205, 0.276, 0, 0.39],
      [0.328, 0.21, 0.259, -0.003, 0.42],
      [0.306, 0.209, 0.232, -0.008, 0.52],
      [0.295, 0.197, 0.224, -0.011, 0.58],
      [0.276, 0.158, 0.205, -0.014, 0.62],
      [0.228, 0.114, 0.165, -0.014, 0.7],
      [0.147, 0.079, 0.11, 0.009, 0.8],
      [0.048, 0.061, 0.045, 0.025, 1],
      [0.023, 0.056, 0.023, 0.026, 1],
      [0.021, 0.043, 0.021, 0.026, 1],
      [0.001, 0.04, 0.001, 0.026, 1],
    ],
    56,
  )
}
function shade() {
  const rings = [
    [0.343, 1],
    [0.349, 0.988],
    [0.356, 0.959],
    [0.48, 0.135],
    [0.498, 0.042],
    [0.499, 0.016],
    [0.489, 0.008],
    [0.481, 0.037],
    [0.474, 0.124],
    [0.35, 0.951],
    [0.337, 0.985],
    [0.337, 1],
  ]
  return grid(
    80,
    rings.length - 1,
    (s, t) => {
      const a = s * tau,
        [r, y] = rings[Math.round(t * (rings.length - 1))]
      const pleat = 0.014 * Math.cos(20 * a) * (0.75 + 0.25 * Math.sin(Math.PI * y))
      return [0.61 * (r + pleat) * Math.cos(a), 0.22 * y, 0.61 * (r + pleat) * Math.sin(a)]
    },
    true,
    true,
  )
}
function houseplant() {
  // Heart-shaped pothos foliage. Each petiole follows an arc from a different point in the crown.
  const parts = []
  for (let i = 0; i < 17; i++) {
    const a = i * 2.399963,
      h = 0.15 + (i % 6) * 0.046,
      reach = 0.074 + ((i * 7) % 11) * 0.014
    const dir = new Vector3(Math.cos(a), 0, Math.sin(a)),
      side = new Vector3(-dir.z, 0, dir.x)
    const start = new Vector3(0.015 * Math.cos(2 * a), 0.01, 0.016 * Math.sin(2 * a))
    const tip = dir.clone().multiplyScalar(reach)
    tip.y = h
    const arch = dir.clone().multiplyScalar(reach * 0.37)
    arch.y = h + 0.036
    const stem = new TubeGeometry(new QuadraticBezierCurve3(start, arch, tip), 5, 0.0027, 5, false)
    stem.deleteAttribute('uv')
    parts.push(stem)
    const length = 0.115 + (i % 4) * 0.024,
      width = 0.052 + (i % 3) * 0.014
    for (const front of [true, false])
      parts.push(
        grid(
          4,
          7,
          (u, v) => {
            const across = u * 2 - 1
            const shoulders = (0.54 + 0.46 * Math.sin(v * Math.PI)) * (1 - 0.995 * v ** 1.5)
            const notch = 0.021 * Math.abs(across) ** 0.65 * (1 - v) ** 4
            const offset = tip
              .clone()
              .addScaledVector(dir, length * v - notch)
              .addScaledVector(side, width * across * shoulders)
            offset.y +=
              0.037 * Math.sin(v * Math.PI) -
              0.087 * v * v +
              0.018 * (1 - Math.abs(across)) * Math.sin(Math.PI * (0.12 + 0.88 * v)) -
              0.015 * across * across * shoulders
            if (!front) offset.y -= 0.0014
            return offset.toArray()
          },
          front,
        ),
      )
  }
  return mergeGeometries(parts)
}

const models = {
  pillow: pillow(),
  duvet: duvet(),
  'sofa-cushion': sofaCushion(),
  'wc-bowl': toilet(),
  basin: basin(),
  'pleated-shade': shade(),
  houseplant: houseplant(),
}
const scene = new Scene()
const material = new MeshStandardMaterial({ name: 'Remap at installation' })
for (const [name, geometry] of Object.entries(models)) {
  const mesh = new Mesh(geometry, material)
  mesh.name = name
  scene.add(mesh)
  console.log(name, geometry.index.count / 3, 'tris')
}
// GLTFExporter only uses FileReader for in-memory binary chunks.
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer()
    this.onloadend?.()
  }
}
const data = await new GLTFExporter().parseAsync(scene, { binary: true })
await writeFile(new URL('../public/assets/pilot/domestic.glb', import.meta.url), new Uint8Array(data))
console.log(data.byteLength, 'bytes')
