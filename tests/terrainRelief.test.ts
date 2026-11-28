import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { makeSurveyTextures } from '../src/scene/terrain/surveyTextures'
import { facilityAnchor, siteFacilities } from '../src/data/siteFacilities'
import {
  decodeTile,
  groundAt,
  sampleTile,
  type AtlasInfo,
  type TileInfo,
} from '../src/geometry/siteElevations'

const base = new URL('../public/terrain/', import.meta.url)
const read = (file: string) => readFileSync(new URL(file, base))
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const info: AtlasInfo = JSON.parse(read('atlas.json').toString())
const baseline: AtlasInfo = JSON.parse(read('atlas-v1.json').toString())
const tile = (entry: TileInfo) => decodeTile(entry, read(entry.file))
const atlas = { tiles: info.tiles.map(tile), insets: info.insets.map(tile), road: info.road }
const maps = info.relief!
const angles = read(maps.horizons.file)
const normals = read(maps.macroNormal.file)

describe('V2 terrain against the signed M4 survey', () => {
  it('preserves the M4 source, local surveys and the entire graded road alignment', () => {
    expect(hash(read('atlas-v1.json'))).toBe(
      '9320dbd4094d8842561507c606259b1f5b0cf932de351bec299e00e8ba739670',
    )
    expect(info.tiles[0].step).toBe(20)
    expect(baseline.tiles[0].step).toBe(40)
    expect(info.tiles.slice(1)).toEqual(baseline.tiles.slice(1))
    expect(info.insets).toEqual(baseline.insets)
    expect(info.road).toEqual(baseline.road)
    for (const entry of [...baseline.tiles, ...baseline.insets])
      expect(hash(read(entry.file))).toBe(entry.sha256)

    // M4 ground at each facility anchor (metres, nearest mm), including both portal sills,
    // the gallery's chainage and the rock over the underground bore and refuge.
    const groundHeights = [
      -296.062, -7.318, -18.341, 0, -10.187, 11.95, 11.97, -15.219, 25.519, 28.281, -18.413, 28.075, -210,
      -7.869, 3.094, 4.081, 366.569, 5.725, -0.844,
    ]
    expect(siteFacilities).toHaveLength(groundHeights.length)
    for (const facility of siteFacilities) {
      const [x, , z] = facilityAnchor(facility, atlas)
      const mm = Math.round(groundAt(atlas, x, z).height * 1000) / 1000
      expect(mm, facility.name).toBe(groundHeights[facility.id - 1])
    }
  })

  it('joins the original 2.4 km triangle boundary at every five-metre station', () => {
    const [far, mountain] = atlas.tiles
    for (let s = -1200; s <= 1200; s += mountain.step) {
      for (const [x, z] of [
        [s, -1200],
        [s, 1200],
        [-1200, s],
        [1200, s],
      ])
        expect(
          Math.abs(sampleTile(far, x, z).height - sampleTile(mountain, x, z).height),
        ).toBeLessThanOrEqual(1 / 32)
    }
  })

  it('agrees with an independent dense ray sweep through the published triangles, across survey boundaries', () => {
    const n = maps.horizons.n
    expect(angles.length).toBe(32 * n * n)
    expect(hash(angles)).toBe(maps.horizons.sha256)
    let longObstructions = 0
    for (const [level, x, z] of [
      [0, 0, 0],
      [0, -408, 504],
      [0, 1104, -888],
      [0, 732, 624],
      [1, -2050, 2250],
      [1, 2500, -1350],
      [1, 3250, 900],
      [1, -4800, 4250],
    ]) {
      const span = level ? 10000 : 2400
      const ix = Math.round((x / span + 0.5) * (n - 1)),
        iz = Math.round((z / span + 0.5) * (n - 1))
      const h = groundAt(atlas, x, z).height
      for (let direction = 0; direction < 16; direction++) {
        const theta = (direction * Math.PI) / 8
        let best = 0,
          blocker = 0
        // Deliberately independent from the generator's bounded block traversal / edge intersections.
        for (let r = 20; ; r += 2) {
          const u = x + r * Math.cos(theta),
            v = z + r * Math.sin(theta)
          if (Math.max(Math.abs(u), Math.abs(v)) > 5000) break
          const slope = (groundAt(atlas, u, v).height - h) / r
          if (slope > best) {
            best = slope
            blocker = r
          }
        }
        const stored = (angles[((level * 16 + direction) * n + iz) * n + ix] * 90) / 255
        expect(
          Math.abs(stored - (Math.atan(best) * 180) / Math.PI),
          [level, x, z, direction].join('/'),
        ).toBeLessThan(0.8)
        if (blocker > 1000 && stored > 2) longObstructions++
      }
    }
    expect(longObstructions).toBeGreaterThan(10)
  })

  it('packs both sky-view grids and the two bracketing horizon bearings into the same samples', () => {
    const n = maps.horizons.n,
      pixels = n * n
    const textures = makeSurveyTextures({
      ...atlas,
      relief: {
        horizons: { n, bytes: Uint8Array.from(angles) },
        macroNormal: { n: maps.macroNormal.n, bytes: Uint8Array.from(normals) },
      },
    })
    try {
      expect(textures.horizons.image.depth).toBe(2)
      const data = textures.horizons.image.data!
      for (let bearing = 0; bearing < 16; bearing++) {
        textures.setBearing(bearing)
        for (let level = 0; level < 2; level++)
          for (const p of [0, pixels - 1, Math.floor(pixels / 2), 10703]) {
            const index = (level * pixels + p) * 4
            expect(data[index]).toBe(angles[(level * 16 + bearing) * pixels + p])
            expect(data[index + 1]).toBe(angles[(level * 16 + (bearing + 1) % 16) * pixels + p])
            let visibility = 0
            for (let d = 0; d < 16; d++)
              visibility += Math.cos((Math.PI / 2) * (angles[(level * 16 + d) * pixels + p] / 255)) ** 2
            expect(data[index + 2]).toBe(Math.round((255 * visibility) / 16))
          }
      }
    } finally {
      textures.dispose()
    }
  })

  it('encodes upward normals in world XZ aligned with the 20 m relief', () => {
    expect(maps.macroNormal.n).toBe(1001)
    expect(normals.length).toBe(1001 ** 2 * 2)
    expect(hash(normals)).toBe(maps.macroNormal.sha256)
    const far = atlas.tiles[0]
    let count = 0,
      meanDot = 0
    for (let z = -4500; z <= 4500; z += 140)
      for (let x = -4500; x <= 4500; x += 140) {
        if (Math.max(Math.abs(x), Math.abs(z)) <= 1400) continue
        const dx = (sampleTile(far, x - 20, z).height - sampleTile(far, x + 20, z).height) / 40
        const dz = (sampleTile(far, x, z - 20).height - sampleTile(far, x, z + 20).height) / 40
        const l = Math.hypot(dx, 1, dz)
        if (l < 1.02) continue
        const k = 2 * ((z / 10 + 500) * 1001 + x / 10 + 500)
        const nx = normals[k] / 127.5 - 1,
          nz = normals[k + 1] / 127.5 - 1
        const ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz))
        meanDot += (nx * dx + ny + nz * dz) / l
        count++
      }
    expect(count).toBeGreaterThan(1000)
    expect(meanDot / count).toBeGreaterThan(0.98)
  })
})
