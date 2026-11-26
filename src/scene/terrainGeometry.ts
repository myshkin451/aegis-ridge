import { Color, MathUtils } from 'three'
import { ADIT, FLOORS } from '../data/floors'
import { aditCentreZ, buffer, floorSection, footprint, undergroundPlan as site } from './utils/coords'
import {
  contains,
  difference,
  intersection,
  lid,
  outline,
  rectangle,
  union,
  walls,
} from './utils/planGeometry'
import type { MultiPolygon, Polygon, Ring } from './utils/planGeometry'
import { ModelBuilder } from './utils/modelBuilder'

export const BED = floorSection('B4').slabBottom - 2.2
const foundation = floorSection('B4').slabBottom
const entry = floorSection(ADIT.floorId).floor
const hollow = rectangle(site.x0, site.x1, site.z0, site.z1)
const tunnel = rectangle(-65, site.x0 + 0.02, aditCentreZ - ADIT.width / 2, aditCentreZ + ADIT.width / 2)
const exposed = union(rectangle(-70, site.x0, site.z0, 70), rectangle(site.x0, site.x1, site.z1, 70))
const TAU = Math.PI * 2
const westEdge = -28.25
const westSlope = 0.32
const surveyEdge = (z: number) => westEdge + westSlope * (z - 4.15)
// The survey boundary crosses the road at grade, then recedes toward the
// natural western slope so the B1 portal comes to daylight on its own ledge.
const terrainExtent: Polygon = [
  [
    [surveyEdge(-70), -70],
    [70, -70],
    [70, 70],
    [surveyEdge(70), 70],
    [surveyEdge(-70), -70],
  ],
]
export const driveway = roadSections()

function contour(cx: number, cz: number, rx: number, rz: number, phase: number): Polygon {
  const ring: Ring = []
  for (let i = 0; i < 100; i++) {
    const a = (TAU * i) / 100
    const r =
      1 + 0.056 * Math.sin(3 * a + phase) + 0.055 * Math.cos(5 * a - 0.8) + 0.024 * Math.sin(8 * a + 0.6)
    ring.push([cx + rx * r * Math.cos(a), cz + rz * r * Math.sin(a)])
  }
  ring.push(ring[0])
  return [ring]
}

function landAt(y: number): MultiPolygon {
  if (y <= 0) {
    const t = MathUtils.clamp((y - BED) / -BED, 0, 1)
    return intersection(
      terrainExtent,
      contour(1.2 * t, -2 - 3.9 * t, 38 - 10 * t, 31.5 - 7 * t, 0.3 + t * 0.25),
    )
  }
  // Two saddles share the same bench, then resolve into separate crests uphill.
  const t = y / 14.7
  const east = contour(4 + 4.7 * t, -18.4 - 1.35 * t, 19.8 * (1 - t * 0.88), 7.3 * (1 - t * 0.88), 1.8)
  const westT = Math.min(1, y / 8.5)
  const west = contour(-10.8 - westT, -16.7 - westT, 9.2 * (1 - westT * 0.94), 5.9 * (1 - westT * 0.94), 2.3)
  return intersection(landAt(0), y < 8.5 ? union(east, west) : [east])
}

interface Terrace {
  bottom: number
  top: number
  land: MultiPolygon
  kept: MultiPolygon
  removed: MultiPolygon
}

function makeTerraces() {
  const levels = new Set([BED, foundation, entry, entry + ADIT.height, buffer.bottom, 0])
  for (let y = -24; y < 0; y += 1.2) {
    const h = Math.round(y * 100) / 100
    if ([...levels].every((v) => Math.abs(v - h) > 0.19)) levels.add(h)
  }
  for (let i = 1; i <= 16; i++) levels.add(i * 0.85)
  const sorted = [...levels].sort((a, b) => a - b)
  return sorted.slice(1).map((top, i): Terrace => {
    const bottom = sorted[i]
    const land = landAt(top)
    let solid = land
    if (bottom >= foundation && top <= buffer.top) solid = difference(land, hollow)
    if (bottom >= entry && top <= entry + ADIT.height) solid = difference(solid, tunnel)
    if (top <= 0 && top > driveway[driveway.length - 1].y) {
      const bench = roadExcavation(top)
      if (bench) solid = difference(solid, bench)
    }
    const cut = bottom >= foundation
    return {
      bottom,
      top,
      land,
      kept: cut ? difference(solid, exposed) : solid,
      removed: cut ? intersection(solid, exposed) : [],
    }
  })
}
const terraces = makeTerraces()

export function groundHeight(x: number, z: number) {
  for (let i = terraces.length - 1; i >= 0; i--) {
    if (terraces[i].land.some((p) => contains(p[0], x, z))) return terraces[i].top
  }
  return BED
}

export function terrainBody(part: 'kept' | 'removed' | 'wire') {
  const m = new ModelBuilder('granite')
  const colors = ['#46515c', '#505963', '#555f66', '#49525d', '#586068', '#4a565e']
  terraces.forEach((layer, i) => {
    const { bottom, top } = layer
    if (part === 'wire') {
      outline(m, layer.land, top, '#a4c2cb')
      if (i % 3 === 0) {
        for (const poly of layer.land)
          for (let k = 0; k < poly[0].length - 1; k += 6) {
            const [x, z] = poly[0][k]
            m.line([x, bottom, z], [x, top, z], '#8094a3')
          }
      }
      return
    }
    const plan = layer[part]
    if (!plan.length) return
    const next = terraces[i + 1]?.[part]
    const exposedTop = next?.length ? difference(plan, next) : plan
    const rock = top <= 0 ? colors[i % colors.length] : '#6e766e'
    const soil = top < -9 ? '#68727b' : top < -2 ? '#747e7a' : '#788774'
    const topColor = top > 6 ? '#959c90' : soil
    walls(m, plan, bottom, top, rock)
    lid(m, exposedTop, top, topColor)
    // Chamfer-like fine arris catches the light on the laminated relief model.
    outline(m, plan, top + 0.012, new Color(rock).lerp(new Color('#b7b7a3'), 0.19))
    if (i === 0) lid(m, plan, bottom, rock, true)
  })
  return m
}

export function randomSource(seed: number) {
  let n = seed
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0
    return n / 4294967296
  }
}

/** Whorls of uneven drooping branches give each model tree its own silhouette. */
function pine(m: ModelBuilder, x: number, y: number, z: number, height: number, random: () => number) {
  const radius = height * (0.2 + random() * 0.055)
  const lean = (random() - 0.5) * 0.18
  m.box('#554b3d', [x, y + height * 0.25, z], [0.13, height * 0.5, 0.13], 'wood')
  const palette = ['#354a43', '#425c4c', '#506b56', '#61765d', '#768368']
  for (let row = 0; row < 5; row++) {
    const r = radius * (1 - row * 0.15)
    const base = y + height * (0.15 + row * 0.143)
    const apex = Math.min(y + height, base + height * (0.41 - row * 0.023))
    const phase = random() * TAU
    for (let j = 0; j < 13; j++) {
      const a = (j * TAU) / 13 + phase,
        b = ((j + 1) * TAU) / 13 + phase,
        mid = (a + b) / 2
      const reach = r * (0.92 + random() * 0.2)
      const ax = x + Math.cos(a) * r * 0.73,
        az = z + Math.sin(a) * r * 0.73
      const bx = x + Math.cos(b) * r * 0.73,
        bz = z + Math.sin(b) * r * 0.73
      const tip: [number, number, number] = [
        x + Math.cos(mid) * reach,
        base - height * 0.04 * random(),
        z + Math.sin(mid) * reach,
      ]
      const peak: [number, number, number] = [x + lean, apex, z]
      const color = new Color(palette[row]).multiplyScalar(0.88 + random() * 0.24)
      m.tri([ax, base + 0.13, az], peak, tip, color)
      m.tri(tip, peak, [bx, base + 0.13, bz], color)
    }
  }
}

export function landscape(part: 'kept' | 'removed') {
  const m = new ModelBuilder()
  const random = randomSource(9187)
  const road = roadPoints()
  const station = footprint(FLOORS.L1.bounds)
  const groves = [
    [-17, -13, 7],
    [-7, -18, 7],
    [8, -21, 9],
    [22, -11, 6],
    [21, 3, 6],
    [24, 13, 6],
    [-23, 5, 6],
    [3, 19, 7],
    [-12, 19, 6],
    [-27, -9, 6],
  ]
  const placed: [number, number][] = []
  for (let i = 0; i < 250; i++) {
    const [cx, cz, r] = groves[i % groves.length]
    const a = random() * TAU,
      d = Math.sqrt(random()) * r
    const x = cx + Math.cos(a) * d,
      z = cz + Math.sin(a) * d,
      h = groundHeight(x, z)
    if (
      h < BED + 0.5 ||
      (x > station.x0 - 2 && x < station.x1 + 2 && z > station.z0 - 2 && z < station.z1 + 2)
    )
      continue
    if (road.some((p) => Math.hypot(x - p[0], z - p[1]) < 2.8)) continue
    if (placed.some((p) => Math.hypot(x - p[0], z - p[1]) < 1.9)) continue
    const removed = (x < site.x0 && z >= site.z0) || (x <= site.x1 && z >= site.z1)
    if (removed !== (part === 'removed')) continue
    placed.push([x, z])
    pine(m, x, h, z, 2.3 + random() * 3.6, random)
  }
  for (let i = 0; i < 160; i++) {
    const x = random() * 68 - 34,
      z = random() * 52 - 27,
      y = groundHeight(x, z)
    const removed = (x < site.x0 && z >= site.z0) || (x <= site.x1 && z >= site.z1)
    if (removed !== (part === 'removed') || y < BED + 0.6 || (Math.abs(x) < 15 && Math.abs(z) < 11)) continue
    if (road.some((p) => Math.hypot(x - p[0], z - p[1]) < 2.4)) continue
    const size = 0.45 + random() * 1.15
    m.part(
      'rock',
      'stone',
      '#89908a',
      [x, y + size * 0.1, z],
      [size * 1.5, size * 0.7, size],
      [0.2, random() * 5, 0.13],
    )
  }
  return m
}

// Cubic Bézier centreline from the garage apron around the western spur.
function roadPoints(): [number, number][] {
  const segments = [
    [
      [-9, 9.65],
      [-9, 13.7],
      [-14.5, 14.25],
      [-18.6, 12.45],
    ],
    [
      [-18.6, 12.45],
      [-22.1, 11.0],
      [-22.6, 6.7],
      [-24.45, 5.3],
    ],
    [
      [-24.45, 5.3],
      [-25.65, 4.3],
      [-26.9, 4.15 - 1.35 * westSlope],
      [westEdge, 4.15],
    ],
  ]
  const result: [number, number][] = []
  for (const s of segments)
    for (let i = 0; i <= 18; i++) {
      if (i === 0 && result.length) continue
      const t = i / 18,
        a = 1 - t,
        out = [0, 0]
      for (let k = 0; k < 2; k++)
        out[k] = a ** 3 * s[0][k] + 3 * a * a * t * s[1][k] + 3 * a * t * t * s[2][k] + t ** 3 * s[3][k]
      result.push([out[0], out[1]])
    }
  return result
}

function roadSections() {
  const points = roadPoints()
  let length = 0
  return points.map(([x, z], i) => {
    const prev = points[Math.max(0, i - 1)],
      next = points[Math.min(points.length - 1, i + 1)]
    const dx = next[0] - prev[0],
      dz = next[1] - prev[1],
      len = Math.hypot(dx, dz)
    const end = i === points.length - 1
    const nx = (end ? -westSlope / Math.hypot(1, westSlope) : -dz / len) * 1.56
    const nz = (end ? -1 / Math.hypot(1, westSlope) : dx / len) * 1.56
    length += Math.hypot(x - prev[0], z - prev[1])
    return { x, z, nx, nz, y: 0.08 - Math.max(0, length - 1) * 0.13 }
  })
}

function roadExcavation(top: number): Polygon | undefined {
  const lower = driveway.filter((p) => p.y - 0.08 < top)
  if (lower.length < 2) return
  const left: Ring = lower.map((s) => [s.x + s.nx * 1.045, s.z + s.nz * 1.045])
  const right: Ring = lower.map((s) => [s.x - s.nx * 1.045, s.z - s.nz * 1.045])
  return [[...left, ...right.reverse(), left[0]]]
}

export function approachRoad() {
  const m = new ModelBuilder(),
    edges = driveway
  for (let i = 1; i < edges.length; i++) {
    const a = edges[i - 1],
      b = edges[i],
      ay = a.y,
      by = b.y
    const left: [number, number, number] = [a.x + a.nx, ay, a.z + a.nz]
    const right: [number, number, number] = [a.x - a.nx, ay, a.z - a.nz]
    const nextL: [number, number, number] = [b.x + b.nx, by, b.z + b.nz]
    const nextR: [number, number, number] = [b.x - b.nx, by, b.z - b.nz]
    m.quad(left, nextL, nextR, right, '#777a77')
    for (const [p, q] of [
      [left, nextL],
      [nextR, right],
    ]) {
      // Sample inside the survey boundary at the end of the road.
      const lowP = Math.min(p[1] - 1.2, groundHeight(p[0] + 0.08, p[2]) - 0.06)
      const lowQ = Math.min(q[1] - 1.2, groundHeight(q[0] + 0.08, q[2]) - 0.06)
      m.quad(p, [p[0], lowP, p[2]], [q[0], lowQ, q[2]], q, '#666860')
      m.line(p, q, '#a7a797')
    }
    if (i % 4 < 2) m.beam([a.x, ay + 0.035, a.z], [b.x, by + 0.035, b.z], 0.075, 0.036, '#d9c9a3', 'wood')
    if (i % 5 === 0) m.box('#d5c9ae', [left[0], ay + 0.27, left[2]], [0.11, 0.55, 0.11])
  }
  return m
}
