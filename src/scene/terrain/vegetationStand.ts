import { galleryChainage, siteFacilities } from '../../data/siteFacilities'
import { randomSource } from '../../geometry/random'
import { groundAt, pathLength, type TerrainAtlas } from '../../geometry/siteElevations'
import type { Point3 } from '../../types/shelter'

const facilities = siteFacilities
  .filter((f) => !['road', 'eastBore', 'cable'].includes(f.kind))
  .flatMap((f) => f.points)
const shades = ['#475d47', '#4e644e', '#394f43', '#586b54', '#637557', '#364e46', '#7a8061']

/** M4's survey clearances around the station, registered facilities and graded route. */
export function plantingClear(atlas: TerrainAtlas, x: number, z: number, margin = 0) {
  if (Math.abs(x) < 23 + margin && Math.abs(z) < 18 + margin) return false
  for (const [a, b] of facilities) if ((x - a) ** 2 + (z - b) ** 2 < (13 + margin) ** 2) return false
  for (let i = 1; i < atlas.road.length; i++) {
    const [a, , b] = atlas.road[i - 1],
      [u, , v] = atlas.road[i]
    const dx = u - a,
      dz = v - b
    const t = Math.max(0, Math.min(1, ((x - a) * dx + (z - b) * dz) / (dx * dx + dz * dz)))
    if ((x - a - t * dx) ** 2 + (z - b - t * dz) ** 2 < (6 + margin) ** 2) return false
  }
  return true
}

// Widths match SiteFacilities.drive, including the downhill passing bay and uphill drainage.
export function roadVerge(atlas: TerrainAtlas) {
  const length = pathLength(atlas.road)
  let chainage = 0
  const segments = atlas.road.slice(1).map(([u, , v], i) => {
    const [x, , z] = atlas.road[i],
      dx = u - x,
      dz = v - z,
      metres = Math.hypot(dx, dz)
    const start = chainage
    chainage += metres
    return { x, z, dx, dz, metres, start }
  })
  return (x: number, z: number) => {
    let nearest = Infinity
    for (const s of segments) {
      const rx = x - s.x,
        rz = z - s.z
      const t = Math.max(0, Math.min(1, (rx * s.dx + rz * s.dz) / (s.metres * s.metres)))
      const d = s.start + t * s.metres,
        uphill = rx * s.dz - rz * s.dx < 0
      let width = uphill ? 3.8 : 3.25
      if (d > length * 0.46 && d < length * 0.48 && !uphill) width = 4.9
      if (d > 31 && d < 65 && uphill) width = 4.815
      if (Math.abs(d - galleryChainage) < 9) width = Math.max(width, 4.2)
      nearest = Math.min(nearest, Math.hypot(rx - t * s.dx, rz - t * s.dz) - width)
    }
    return nearest
  }
}

export interface SurveyTree {
  kind: 'fir'
  x: number
  y: number
  z: number
  height: number
  width: number
  depth: number
  yaw: number
  lean: number
  tint: string
}
interface SurveyRock {
  kind: 'rock'
  x: number
  y: number
  z: number
  radius: number
  yaw: number
}
interface SurveyShrub {
  kind: 'bud'
  x: number
  y: number
  z: number
  yaw: number
}
export type SurveyPlanting = SurveyTree | SurveyRock | SurveyShrub

/** Both A/B versions consume the original random stream, including the legacy shrubs. */
export function surveyPlantings(atlas: TerrainAtlas) {
  const random = randomSource(87142)
  const result: SurveyPlanting[] = []
  for (let i = 0; i < 6200; i++) {
    const span = i < 900 ? 260 : 1500
    const x = (random() - 0.5) * span,
      z = (random() - 0.5) * span
    if (!plantingClear(atlas, x, z)) continue
    const s = groundAt(atlas, x, z),
      y = s.height
    const north = (1 - Math.cos(s.aspect)) / 2
    const grove = Math.sin(x / 37 + Math.sin(z / 28)) * Math.cos(z / 47) + s.flow * 0.8 + s.curvature * 0.15
    if (s.slope > 32 || grove < -0.46) {
      if (random() < 0.36)
        result.push({ kind: 'rock', x, y, z, radius: 0.3 + random() * 1.6, yaw: random() * 6 })
    } else if (
      grove > 0.03 &&
      y < 238 + 70 * north &&
      s.slope < 31 &&
      (Math.hypot(x, z) > 85 || (s.curvature > 0.12 && s.flow > 0.2 && random() < 0.32))
    ) {
      const height = (2.3 + random() ** 0.68 * 8.4) * (0.85 + 0.15 * north)
      const w = height * (0.15 + random() * 0.18)
      const tint = shades[Math.floor(random() * shades.length)],
        yaw = random() * Math.PI * 2
      const lean = Math.sin(x * 1.73 + z * 0.89) * 0.095
      result.push({
        kind: 'fir',
        x,
        y,
        z,
        height,
        width: w * 2.3,
        depth: w * (1.5 + random() * 0.85),
        tint,
        yaw,
        lean,
      })
    } else if (s.slope < 28 && s.flow + 0.4 * north > 0.33) {
      result.push({ kind: 'bud', x, y, z, yaw: random() * 6 })
    }
  }
  return result
}

/** Heights use the actual rendered triangle interpolation, including inset tile transitions. */
export function footingNormal(atlas: TerrainAtlas, x: number, z: number, step: number): Point3 {
  const dx = groundAt(atlas, x + step, z).height - groundAt(atlas, x - step, z).height
  const dz = groundAt(atlas, x, z + step).height - groundAt(atlas, x, z - step).height
  const n = Math.hypot(dx, 2 * step, dz)
  return [-dx / n, (2 * step) / n, -dz / n]
}

export interface MeadowTuft {
  kind: 'grass' | 'shrub'
  x: number
  y: number
  z: number
  width: number
  height: number
  yaw: number
  normal: Point3
}

/** Patch centres follow meadow slopes and flow; offsets break up the boundaries of each colony. */
export function meadowPlantings(atlas: TerrainAtlas) {
  const result: MeadowTuft[] = []
  const random = randomSource(632917)
  for (let patch = 0; patch < 4400; patch++) {
    const angle = 2 * Math.PI * random()
    const radius = (patch < 1300 ? 104 : 300) * Math.sqrt(random())
    const cx = radius * Math.cos(angle),
      cz = radius * Math.sin(angle)
    const sample = groundAt(atlas, cx, cz)
    if (sample.slope > 30 || sample.height > 248) continue
    const wet = sample.flow + 0.18 * (1 - Math.cos(sample.aspect)) - 0.18 * sample.curvature
    if (random() > 0.24 + wet * 0.62) continue
    const kind = random() < 0.055 + 0.13 * wet ? 'shrub' : 'grass'
    const tuftCount = kind === 'grass' ? 6 + Math.floor(random() * 13) : 2 + Math.floor(random() * 5)
    const spread = 1.4 + random() * 3
    for (let tuft = 0; tuft < tuftCount; tuft++) {
      const offset = 2 * Math.PI * random(),
        r = spread * Math.sqrt(random())
      const x = cx + r * Math.cos(offset),
        z = cz + r * Math.sin(offset)
      const height = kind === 'shrub' ? 0.35 + 0.52 * random() : 0.17 + 0.33 * random()
      const width = height * (kind === 'shrub' ? 1.6 : 1.32)
      const margin = width / 2 + height
      if (Math.hypot(x, z) + margin > 300 || !plantingClear(atlas, x, z, margin)) continue
      const local = groundAt(atlas, x, z)
      if (local.slope > 30 || local.height > 248) continue
      result.push({
        kind,
        x,
        y: local.height - 0.025,
        z,
        width,
        height,
        yaw: random() * 2 * Math.PI,
        normal: footingNormal(atlas, x, z, 0.22),
      })
    }
  }
  return result
}
