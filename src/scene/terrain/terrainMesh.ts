import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { cutMouth, nearMouth } from './portalCut'
import type { GroundSample, TerrainTile, TileInfo } from '../../geometry/siteElevations'
import { sampleTile, vertex } from '../../geometry/siteElevations'
import { buffer, floorSection, footprint, undergroundPlan } from '../../geometry/coords'
import { boreVoids } from '../../geometry/sectionVoids'
import { FLOORS } from '../../data/floors'

const meadow = new Color('#727b4e'),
  woodland = new Color('#455b47'),
  talus = new Color('#93938a')
const granite = new Color('#787b76'),
  snow = new Color('#e4e9e8')
const clamp = (v: number) => Math.min(1, Math.max(0, v))
const station = footprint(FLOORS.L1.bounds)
// Continuous value noise avoids sampling repeating bands at the coarser 5 m and 40 m survey steps.
function landGrain(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z)
  function corner(a: number, b: number) {
    let h = Math.imul(a, 1597334677) ^ Math.imul(b, 3812015801)
    h = Math.imul(h ^ (h >>> 16), 2246822519)
    return ((h ^ (h >>> 13)) >>> 0) / 4294967295
  }
  const fx = x - ix,
    fz = z - iz,
    u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz)
  return (
    (corner(ix, iz) * (1 - u) + corner(ix + 1, iz) * u) * (1 - v) +
    (corner(ix, iz + 1) * (1 - u) + corner(ix + 1, iz + 1) * u) * v
  )
}
export function terrainColor(s: GroundSample, x: number, z: number, out: Color) {
  const north = (1 - Math.cos(s.aspect)) / 2
  const grain = 0.65 * landGrain(x * 0.014, z * 0.014) + 0.35 * landGrain(x * 0.046, z * 0.046)
  out
    .copy(meadow)
    .lerp(woodland, clamp(0.24 + s.flow * 0.78 - s.curvature * 0.22 + s.height * 0.00018))
    .lerp(talus, clamp((s.slope - 25) / 12 + 0.2 * s.curvature))
    .lerp(granite, clamp((s.slope - 35) / 13))
    .lerp(snow, clamp((s.height - 320) / 205 + north * 0.4 + s.flow * 0.15 - s.slope * 0.006 + grain * 0.12))
    .multiplyScalar(0.88 + 0.2 * grain)
  return out
}
function axis(tile: TerrainTile, extras: number[]) {
  return [
    ...new Set([...Array.from({ length: tile.n }, (_, i) => i * tile.step - tile.span / 2), ...extras]),
  ].sort((a, b) => a - b)
}
export function tileSurface(tile: TerrainTile, children: TileInfo[]) {
  const core = tile.id === 'core'
  const xs = axis(tile, core ? [station.x0, station.x1] : []).map((x) => x + tile.cx),
    zs = axis(tile, core ? [station.z0, station.z1] : []).map((z) => z + tile.cz)
  const pos = new Float32Array(xs.length * zs.length * 3),
    col = new Float32Array(pos.length)
  const indices: number[] = [],
    extraPos: number[] = [],
    extraCol: number[] = [],
    color = new Color()
  for (let j = 0; j < zs.length; j++)
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i],
        z = zs[j],
        k = j * xs.length + i
      const s = core ? sampleTile(tile, x, z) : vertex(tile, k)
      pos.set([x, s.height, z], k * 3)
      terrainColor(s, x, z, color).toArray(col, k * 3)
      if (i === 0 || j === 0) continue
      const cx = (x + xs[i - 1]) / 2,
        cz = (z + zs[j - 1]) / 2
      if (children.some((t) => Math.max(Math.abs(cx - t.cx), Math.abs(cz - t.cz)) < t.span / 2)) continue
      if (core && cx > station.x0 && cx < station.x1 && cz > station.z0 && cz < station.z1) continue
      const a = k - xs.length - 1,
        b = k - xs.length,
        c = k - 1
      const mouth = tile.step <= 5 ? nearMouth(cx, cz, tile.step) : undefined
      if (!mouth) {
        indices.push(a, c, k, a, k, b)
        continue
      }
      for (const tri of [
        [a, c, k],
        [a, k, b],
      ]) {
        const polygons = cutMouth(
          tri.map((index) => [pos[index * 3], pos[index * 3 + 1], pos[index * 3 + 2]]),
          mouth,
        )
        if (!polygons) {
          indices.push(...tri)
          continue
        }
        for (const polygon of polygons) {
          const start = (pos.length + extraPos.length) / 3
          for (const pt of polygon) {
            extraPos.push(...pt)
            terrainColor(sampleTile(tile, pt[0], pt[2]), pt[0], pt[2], color)
            extraCol.push(color.r, color.g, color.b)
          }
          for (let q = 2; q < polygon.length; q++) indices.push(start, start + q - 1, start + q)
        }
      }
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(extraPos.length ? [...pos, ...extraPos] : pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(extraCol.length ? [...col, ...extraCol] : col, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}
// Intersect both triangles in each height-field cell, including the cell diagonal.
export function sectionFace(core: TerrainTile, z: number) {
  const fraction = ((z + core.span / 2) / core.step) % 1
  const xs = axis(core, [undergroundPlan.x0, undergroundPlan.x1, station.x0, station.x1])
  if (fraction > 1e-8)
    for (let i = 0; i < core.n - 1; i++) xs.push(-core.span / 2 + (i + fraction) * core.step)
  const voids = boreVoids(z)
  for (const opening of voids)
    for (const x of [opening.left, opening.right]) if (Math.abs(x) < core.span / 2) xs.push(x)
  xs.sort((a, b) => a - b)
  const points: number[] = [],
    surface: number[] = []
  const bed = floorSection('B4').slabBottom - 0.24
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1],
      b = xs[i]
    if (b - a < 1e-6) continue
    const inside =
      a >= undergroundPlan.x0 && b <= undergroundPlan.x1 && z >= undergroundPlan.z0 && z <= undergroundPlan.z1
    const ha = sampleTile(core, a, z).height,
      hb = sampleTile(core, b, z).height
    const topA = inside ? bed : ha,
      topB = inside ? bed : hb,
      bottom = -36
    function strip(lowA: number, lowB: number, highA: number, highB: number) {
      points.push(a, lowA, z, b, lowB, z, b, highB, z, a, lowA, z, b, highB, z, a, highA, z)
      surface.push(ha, hb, hb, ha, hb, ha)
    }
    const voidAt = voids.find((v) => v.left < (a + b) / 2 && v.right > (a + b) / 2)
    if (inside || !voidAt) {
      strip(bottom, bottom, topA, topB)
      if (inside && (b <= station.x0 || a >= station.x1 || z < station.z0 || z > station.z1))
        strip(buffer.top, buffer.top, ha, hb)
    } else {
      const ya = voidAt.invert(a),
        yb = voidAt.invert(b)
      strip(bottom, bottom, ya, yb)
      strip(ya + voidAt.height, yb + voidAt.height, topA, topB)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(points, 3))
  g.setAttribute('groundY', new Float32BufferAttribute(surface, 1))
  return g
}

// Sparse survey lines expose the terrain shape while preserving the visibility of the two adits.
export function surveyLines(tile: TerrainTile, interval: number, extent: number, skip: number) {
  const points: number[] = []
  for (let u = -extent; u <= extent; u += interval)
    for (let v = -extent; v < extent; v += interval / 2) {
      if (Math.abs(u) < skip && Math.abs(v + interval / 4) < skip) continue
      for (const swap of [false, true])
        for (const along of [v, v + interval / 2]) {
          const x = swap ? u : along,
            z = swap ? along : u
          points.push(x, sampleTile(tile, x, z).height + 0.04, z)
        }
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(points, 3))
  return g
}
