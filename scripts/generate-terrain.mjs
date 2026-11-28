import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { bakeHorizonAngles, macroNormals } from './terrain-relief.mjs'

const survey = JSON.parse(await readFile(new URL('../src/data/siteSurvey.json', import.meta.url), 'utf8'))
const output = new URL('../public/terrain/', import.meta.url)
const seed = 145001
const layers = [
  { id: 'horizon', span: 10000, step: 40 },
  { id: 'mountain', span: 2400, step: 5, parent: 'horizon' },
  { id: 'site', span: 300, step: 1.25, parent: 'mountain' },
  { id: 'core', span: 80, step: 0.625, parent: 'site' },
  { id: 'east-mouth', span: 40, step: 0.625, parent: 'mountain', cx: 285, cz: 0 },
  { id: 'west-mouth', span: 40, step: 0.625, parent: 'site', cx: -60, cz: 25 },
]
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(n, b))
const mix = (a, b, t) => a + (b - a) * t
function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
function hash(x, z) {
  let n = Math.imul(x, 1597334677) ^ Math.imul(z, 3812015801) ^ seed
  n = Math.imul(n ^ (n >>> 16), 2246822507)
  return ((n ^ (n >>> 13)) >>> 0) / 2147483648 - 1
}
function noise(x, z) {
  const i = Math.floor(x),
    j = Math.floor(z)
  const u = smooth(0, 1, x - i),
    v = smooth(0, 1, z - j)
  return mix(mix(hash(i, j), hash(i + 1, j), u), mix(hash(i, j + 1), hash(i + 1, j + 1), u), v)
}
function natural(x, z) {
  const u = x + 94 * noise(x / 370, z / 370),
    v = z + 85 * noise(x / 430 + 5, z / 430)
  let ridges = 0,
    amplitude = 1,
    scale = 172,
    weight = 1
  for (let i = 0; i < 5; i++) {
    const crest = (1 - Math.abs(noise(u / scale + 11 * i, v / scale))) ** 2
    ridges += amplitude * crest * weight
    weight = 0.4 + 0.6 * crest
    amplitude *= 0.49
    scale *= 0.49
  }
  const crestZ = -795 + 98 * Math.sin(u / 360) + 48 * noise(u / 165, 19)
  const spine = Math.exp(-(((v - crestZ) / 328) ** 2))
  let h = 16 + 565 * spine - 325 * clamp(z / 750) + (ridges - 0.85) * (36 + 106 * spine)
  for (const [axis, width, depth] of [
    [284 + 47 * Math.sin(z / 240), 57, 47],
    [-282 + 61 * Math.sin(z / 187), 65, 63],
  ]) {
    h -= depth * Math.exp(-(((x - axis) / width) ** 2)) * (0.58 + 0.42 * Math.cos(z / 410))
  }
  const radius = Math.hypot(x, z)
  const shoulder = 2.8 - 0.235 * z + (ridges - 0.84) * 12 + 2.8 * Math.sin(x / 48)
  h = mix(shoulder, h, smooth(145, 330, radius))
  // The approach traverses one south-facing hillside. Preserve its regional grade before cutting the narrow road bed.
  const approach = smooth(15, 110, z) * (1 - smooth(212, 325, Math.abs(x))) * (1 - smooth(705, 845, z))
  h = mix(h, 1.5 - 0.435 * z + 10 * (ridges - 0.84) + 3.5 * Math.sin(x / 86 + z / 133), 0.92 * approach)

  if (radius > 1050) {
    const angle = Math.atan2(z, x)
    let skyline = -260
    for (let i = 0; i < 6; i++) {
      const ring = 1540 + i * 655 + 172 * Math.sin(angle * 3 + i * 1.65) + 97 * Math.cos(angle * 7 + i)
      const peak =
        320 + 48 * i + 29 * i * i + (73 + 14 * i) * Math.sin(angle * 5 + i) + (78 + 19 * i) * (ridges - 0.7)
      skyline = Math.max(skyline, -260 + peak * Math.exp(-(((radius - ring) / 248) ** 2)))
    }
    h = mix(h, skyline, smooth(1050, 1630, radius))
  }
  return h
}

// Rounded bends follow the surveyed [east, relative elevation, south] alignment.
function roundRoad(points) {
  const road = [points[0]]
  const lerp = (p, q, t) => p.map((v, i) => mix(v, q[i], t))
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[2])
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = points.slice(i - 1, i + 2)
    const incoming = dist(a, b),
      outgoing = dist(b, c)
    const u = [(b[0] - a[0]) / incoming, (b[2] - a[2]) / incoming],
      v = [(c[0] - b[0]) / outgoing, (c[2] - b[2]) / outgoing]
    const turn = Math.sign(u[0] * v[1] - u[1] * v[0])
    const angle = Math.acos(clamp(u[0] * v[0] + u[1] * v[1], -1, 1))
    if (angle < 0.001) {
      road.push(b)
      continue
    }
    const trim = Math.min(12 * Math.tan(angle / 2), incoming * 0.41, outgoing * 0.41),
      r = trim / Math.tan(angle / 2)
    const enter = lerp(b, a, trim / incoming),
      cx = enter[0] - turn * u[1] * r,
      cz = enter[2] + turn * u[0] * r
    const start = Math.atan2(enter[2] - cz, enter[0] - cx),
      n = Math.max(2, Math.ceil((angle * r) / 2))
    for (let k = 0; k <= n; k++) {
      const theta = start + (turn * angle * k) / n
      road.push([cx + r * Math.cos(theta), b[1], cz + r * Math.sin(theta)])
    }
  }
  road.push(points.at(-1))
  return road
}
const road = roundRoad(survey.road)
const chainage = [0]
for (let i = 1; i < road.length; i++)
  chainage.push(chainage[i - 1] + Math.hypot(road[i][0] - road[i - 1][0], road[i][2] - road[i - 1][2]))
for (let i = 0; i < road.length; i++)
  road[i][1] = (survey.road.at(-1)[1] * Math.max(0, chainage[i] - 18)) / (chainage.at(-1) - 18)
const bins = new Map()
const bin = (x, z) => Math.floor(x / 32) + ',' + Math.floor(z / 32)
for (let i = 1; i < road.length; i++) {
  const a = road[i - 1],
    b = road[i],
    dx = b[0] - a[0],
    dz = b[2] - a[2]
  const segment = { a, dx, dz, dy: b[1] - a[1], length2: dx * dx + dz * dz }
  for (
    let x = Math.floor((Math.min(a[0], b[0]) - 23) / 32);
    x <= Math.floor((Math.max(a[0], b[0]) + 23) / 32);
    x++
  )
    for (
      let z = Math.floor((Math.min(a[2], b[2]) - 23) / 32);
      z <= Math.floor((Math.max(a[2], b[2]) + 23) / 32);
      z++
    ) {
      const key = x + ',' + z
      if (!bins.has(key)) bins.set(key, [])
      bins.get(key).push(segment)
    }
}
function earthworks(h, x, z, step) {
  if (Math.abs(x) > 650 || z > 800 || z < -260) return h
  // Maintain a continuous rock shoulder above the eastern bore; daylight at its two ends.
  const bank = smooth(224, 255, x) * (1 - smooth(310, 353, x)) * (1 - smooth(12, 59, Math.abs(z - 1.5)))
  h = mix(
    h,
    7 -
      24 * smooth(252, 289, x) -
      0.27 * Math.max(0, x - 286) -
      0.13 * (z - 1.5) +
      1.1 * noise(x / 18, z / 18),
    bank,
  )
  const bench = smooth(7, 38, x) * (1 - smooth(252, 294, x)) * (1 - smooth(7, 56, Math.abs(z - 1.5)))
  h = mix(h, 9 + 4.1 * Math.sin((x - 26) / 63) + 1.4 * noise(x / 33, z / 33), bench)
  function pad(cx, cz, rx, rz, level, apron) {
    const d = Math.hypot(Math.max(0, Math.abs(x - cx) - rx), Math.max(0, Math.abs(z - cz) - rz))
    h = mix(h, level, 1 - smooth(0, apron, d))
  }
  pad(0, 0, 19, 13, 0, 17)
  pad(...survey.helipad, 10.5, 10.5, 3.1, 18)
  pad(...survey.solar, 11, 5, -2.3, 9)
  const [px, pz] = survey.pond
  const lake = Math.hypot((x - px) / 8, (z - pz) / 5)
  h = mix(h, -0.85 + 1.7 * smooth(0.68, 1.18, lake), 1 - smooth(1.18, 3.2, lake))
  // The portal apron and the rock headwall have different levels on either side of each lip.
  function mouth(point, ux, uz, sill, wide) {
    const dx = x - point[0],
      dz = z - point[1],
      along = dx * ux + dz * uz,
      across = Math.abs(dx * uz - dz * ux)
    const influence =
      (1 - smooth(wide, wide + 8, across)) * smooth(-31, -18, along) * (1 - smooth(9, 28, along))
    const shoulder = 3.6 * smooth(1.25, 3.5, across) * (1 - smooth(0, 7, along)) * smooth(-12, -4, along)
    const roof = (1 - smooth(-14, -4, along)) * (wide === 6 ? 11 : 17) + 3.2 * (1 - smooth(-2.8, -1.1, along))
    h = mix(h, sill + roof + shoulder, influence)
  }
  mouth(survey.westMouth, -0.6, 0.8, -10.2, 6)
  mouth(survey.eastMouth, 1, 0, -15.21, 8)
  pad(...survey.drain, 8, 7, -210, 20)
  const segments = bins.get(bin(x, z))
  if (segments) {
    let nearest = Infinity,
      level = 0
    for (const { a, dx, dz, dy, length2 } of segments) {
      const t = clamp(((x - a[0]) * dx + (z - a[2]) * dz) / length2)
      const d = Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz)
      if (d < nearest) {
        nearest = d
        level = a[1] + t * dy
      }
    }
    const flat = 4.6 + Math.min(step, 5) * 1.34
    h = mix(level - 0.12, h, smooth(flat, flat + 9.5, nearest))
  }
  // The perimeter bench ends below the sloping apron and its retaining face.
  const offSlab = Math.max(0, Math.abs(x + 1) - 15, Math.abs(z + 1) - 9)
  pad(-1, -1, 17.2, 11.2, -0.25 * smooth(0.75, 2.1, offSlab), 2.2)
  return h
}

const neighbours = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]
// D8 drainage. Transfer entrained material to the receiver, then relax talus above 35 degrees.
function drainage(h, n, step) {
  const route = new Int32Array(h.length).fill(-1),
    gradient = new Float32Array(h.length)
  for (let z = 1; z < n - 1; z++)
    for (let x = 1; x < n - 1; x++) {
      const i = z * n + x
      for (const [dx, dz] of neighbours) {
        const j = i + dz * n + dx,
          slope = (h[i] - h[j]) / (step * (dx && dz ? Math.SQRT2 : 1))
        if (slope > gradient[i]) {
          route[i] = j
          gradient[i] = slope
        }
      }
    }
  const order = Uint32Array.from(h, (_, i) => i).sort((a, b) => h[b] - h[a])
  const flux = new Float32Array(h.length).fill(1)
  for (const i of order) if (route[i] >= 0) flux[route[i]] += flux[i]
  return { route, gradient, flux, order }
}
function erode(h, n, step) {
  for (let pass = 0; pass < 4; pass++) {
    const { route, gradient, flux, order } = drainage(h, n, step)
    const sediment = new Float32Array(h.length),
      change = new Float32Array(h.length)
    for (const i of order) {
      const j = route[i]
      if (j < 0) {
        change[i] += sediment[i]
        continue
      }
      const capacity = step * 0.035 * Math.sqrt(flux[i]) * gradient[i]
      const exchange = clamp((capacity - sediment[i]) * 0.3, -sediment[i], (h[i] - h[j]) * 0.12)
      const slip = Math.max(0, gradient[i] - Math.tan((35 * Math.PI) / 180)) * step * 0.19
      change[i] -= exchange + slip
      change[j] += slip
      sediment[j] += sediment[i] + exchange
    }
    for (let i = 0; i < h.length; i++) h[i] += change[i]
  }
}
function interp(t, x, z) {
  const fx = clamp((x - t.cx + t.span / 2) / t.step, 0, t.n - 1),
    fz = clamp((z - t.cz + t.span / 2) / t.step, 0, t.n - 1)
  const i = Math.min(t.n - 2, Math.floor(fx)),
    j = Math.min(t.n - 2, Math.floor(fz)),
    k = j * t.n + i
  const u = fx - i,
    v = fz - j,
    h = t.height
  // Same NW-SE cell diagonal and linear interpolation as the rendered triangles.
  return u >= v
    ? h[k] * (1 - u) + h[k + 1] * (u - v) + h[k + t.n + 1] * v
    : h[k] * (1 - v) + h[k + t.n] * (v - u) + h[k + t.n + 1] * u
}

function encodeField(height, n, step) {
  const { flux } = drainage(height, n, step)
  const bytes = Buffer.alloc(n * n * 6)
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const i = z * n + x,
        offset = i * 6,
        h = height[i]
      const left = height[z * n + Math.max(0, x - 1)],
        right = height[z * n + Math.min(n - 1, x + 1)]
      const up = height[Math.max(0, z - 1) * n + x],
        down = height[Math.min(n - 1, z + 1) * n + x]
      const dx = (right - left) / (2 * step),
        dz = (down - up) / (2 * step)
      bytes.writeUInt16LE(Math.round((h + 512) * 32), offset)
      bytes[offset + 2] = Math.round((Math.atan(Math.hypot(dx, dz)) * 510) / Math.PI)
      bytes[offset + 3] = Math.round(
        127.5 + 127.5 * Math.tanh((3 * (left + right + up + down - 4 * h)) / step),
      )
      bytes[offset + 4] = Math.round(255 * clamp(Math.log1p(flux[i] - 1) / Math.log(1024)))
      bytes[offset + 5] = Math.round((255 * (Math.atan2(-dx, -dz) + Math.PI)) / (2 * Math.PI))
    }
  return bytes
}

await mkdir(output, { recursive: true })
async function publish(name, bytes) {
  const file = new URL(name, output)
  try {
    if ((await readFile(file)).equals(bytes)) return
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const temp = fileURLToPath(file) + '.' + randomUUID() + '.tmp'
  await writeFile(temp, bytes)
  await rename(temp, file)
}
const grids = new Map(),
  tiles = [],
  insets = []
for (const { id, span, step, cx = 0, cz = 0, parent: parentId } of layers) {
  const parent = grids.get(parentId)
  const n = 1 + span / step,
    height = new Float32Array(n * n)
  for (let i = 0; i < height.length; i++)
    height[i] = natural(cx + (i % n) * step - span / 2, cz + Math.floor(i / n) * step - span / 2)
  erode(height, n, step)
  for (let i = 0; i < height.length; i++) {
    const x = cx + (i % n) * step - span / 2,
      z = cz + Math.floor(i / n) * step - span / 2
    let h = earthworks(height[i], x, z, step)
    if (parent) {
      const edge = span / 2 - Math.max(Math.abs(x - cx), Math.abs(z - cz))
      h = mix(interp(parent, x, z), h, smooth(0, parent.step * 1.8, edge))
    }
    height[i] = Math.round(h * 32) / 32
  }
  const bytes = encodeField(height, n, step)
  const file = id + '.bin'
  await publish(file, bytes)
  const group = cx || cz ? insets : tiles
  group.push({
    id,
    span,
    step,
    n,
    file,
    cx,
    cz,
    parent: parentId,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
  grids.set(id, { span, step, n, height, cx, cz })
}
// V1 is also the surveyed boundary condition of the unchanged 2.4 km field.
await publish('atlas-v1.json', Buffer.from(JSON.stringify({ version: 1, seed, tiles, insets, road }) + '\n'))

// Oblique, finite watersheds replace the concentric ridge train outside the M4 mountain.
const ranges = [
  // centre (east, south), strike in radians, half-length, half-width, relief
  [-3670, -2670, 0.22, 2600, 660, 1080],
  [-2120, 470, 1.16, 2450, 540, 670],
  [-3650, 1340, 0.9, 2700, 650, 1000],
  [-810, 3260, -0.3, 3200, 580, 760],
  [1310, -3100, -0.48, 2950, 680, 940],
  [2230, -380, 1.11, 1440, 420, 520],
  [3600, 1410, 0.94, 2070, 505, 785],
  [4480, -1740, 1.18, 3180, 740, 1210],
  [2170, 4320, 0.08, 2660, 620, 1050],
  [-4770, 3870, -0.74, 2800, 680, 1110],
].map(([cx, cz, strike, length, width, relief]) => ({
  cx,
  cz,
  u: Math.cos(strike),
  v: Math.sin(strike),
  length,
  width,
  relief,
}))

function outerRelief(x, z) {
  const valley = -264 + 63 * noise(x / 1180 + 6, z / 1180)
  let top = valley
  const warp = 210 * noise(x / 820 + 19, z / 820) + 55 * noise(x / 260, z / 260 - 6)
  for (const range of ranges) {
    const dx = x - range.cx,
      dz = z - range.cz
    const along = dx * range.u + dz * range.v
    const across = (dz * range.u - dx * range.v + warp) / range.width
    if (Math.abs(across) > 3.2 || Math.abs(along) > range.length * 1.5) continue
    const taper = 1 - smooth(0.45, 1.5, Math.abs(along) / range.length)
    const saddle = 0.82 + 0.28 * noise(along / 710 + range.cz * 0.001, 12)
    const spur = 1 + 0.27 * noise(along / 240, across * 1.8)
    const profile = Math.exp(-Math.pow(Math.abs(across) / spur, 1.36))
    top = Math.max(top, valley + range.relief * taper * saddle * profile)
  }
  const uplift = smooth(10, 570, top - valley)
  const crease = Math.abs(noise((x + warp) / 116, z / 164 + 18))
  const channel = (1 - smooth(0, 0.24, crease)) * (15 + 29 * uplift)
  const outcrops = 23 * noise(x / 163, z / 141) + 10 * noise(x / 56, z / 47)
  return top + outcrops * (0.4 + 0.6 * uplift) - channel
}

const digest = (data) => createHash('sha256').update(data).digest('hex')
const revision = digest(
  Buffer.concat(
    await Promise.all([
      readFile(new URL(import.meta.url)),
      readFile(new URL('./terrain-relief.mjs', import.meta.url)),
      readFile(new URL('../src/data/siteSurvey.json', import.meta.url)),
    ]),
  ),
)
// pretest and prebuild share this reproducible bake; validate bytes before reusing it.
async function currentBake() {
  try {
    const info = JSON.parse(await readFile(new URL('atlas.json', output), 'utf8'))
    if (info.version !== 2 || info.revision !== revision) return false
    const files = [info.tiles[0], info.relief.horizons, info.relief.macroNormal]
    return (
      await Promise.all(files.map(async (f) => digest(await readFile(new URL(f.file, output))) === f.sha256))
    ).every(Boolean)
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return false
    throw error
  }
}
if (!(await currentBake())) {
  const legacy = grids.get('horizon')
  const span = legacy.span,
    fineStep = 10,
    fineN = 1 + span / fineStep
  const fine = new Float32Array(fineN * fineN)
  for (let j = 0; j < fineN; j++)
    for (let i = 0; i < fineN; i++)
      fine[j * fineN + i] = outerRelief(i * fineStep - span / 2, j * fineStep - span / 2)
  erode(fine, fineN, fineStep)
  // Join at exactly the same heights as the original parent, even between 40 m vertices.
  for (let j = 0; j < fineN; j++)
    for (let i = 0; i < fineN; i++) {
      const x = i * fineStep - span / 2,
        z = j * fineStep - span / 2
      const blend = smooth(1200, 1500, Math.max(Math.abs(x), Math.abs(z)))
      const k = j * fineN + i
      if (blend < 1) fine[k] = mix(interp(legacy, x, z), fine[k], blend)
    }
  const step = 20,
    n = 1 + span / step,
    height = new Float32Array(n * n)
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) height[j * n + i] = Math.round(fine[2 * j * fineN + 2 * i] * 32) / 32
  const outer = { cx: 0, cz: 0, span, n, step, height }
  const bytes = encodeField(height, n, step)
  async function asset(file, bytes) {
    await publish(file, bytes)
    return { file, sha256: digest(bytes) }
  }
  const outerInfo = { ...tiles[0], n, step, ...(await asset('horizon-v2.bin', bytes)) }
  const inner = grids.get('mountain')
  const patches = ['east-mouth', 'west-mouth', 'core', 'site'].map((key) => grids.get(key))
  function surface(x, z) {
    for (const tile of patches)
      if (Math.max(Math.abs(x - tile.cx), Math.abs(z - tile.cz)) <= tile.span / 2) return interp(tile, x, z)
    return interp(inner, x, z)
  }
  // The normal texture and horizon observers see the nested site, including its graded roads.
  for (let j = 0; j < inner.n; j++)
    for (let i = 0; i < inner.n; i++) {
      const x = i * inner.step - inner.span / 2,
        z = j * inner.step - inner.span / 2
      inner.height[j * inner.n + i] = surface(x, z)
      if (i % 2 === 0 && j % 2 === 0)
        fine[((z + span / 2) / fineStep) * fineN + (x + span / 2) / fineStep] = inner.height[j * inner.n + i]
    }
  const macroNormal = { n: fineN, ...(await asset('macro-normal.rg', macroNormals(fine, fineN, fineStep))) }
  const horizonN = 201
  const horizons = {
    n: horizonN,
    ...(await asset('horizon-angles.r8', bakeHorizonAngles(inner, outer, horizonN, interp, surface))),
  }
  const info = {
    version: 2,
    revision,
    seed,
    tiles: [outerInfo, ...tiles.slice(1)],
    insets,
    road,
    relief: { macroNormal, horizons },
  }
  await publish('atlas.json', Buffer.from(JSON.stringify(info) + '\n'))
}
console.log(
  'ARS-01 terrain: 20 m outer mesh, 10 m surface normals, 16 horizon bearings × 2 scales; M4 local surveys retained.',
)
