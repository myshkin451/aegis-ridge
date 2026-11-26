import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import {
  adits,
  eastTransfer,
  facilityAnchor,
  galleryChainage,
  refuge,
  serviceLinks,
  siteFacilities,
} from '../src/data/siteFacilities'
import { FLOORS } from '../src/data/floors'
import { roomsOn } from '../src/data/defaultBlueprint'
import { freightCable } from '../src/geometry/freightCable'
import { altitude, footprint, shaftPlans } from '../src/geometry/coords'
import { decodeTile, groundAt, pathLength, pointAlong, sampleTile } from '../src/geometry/siteElevations'
import type { AtlasInfo, TerrainAtlas } from '../src/geometry/siteElevations'
import { tileSurface, sectionFace } from '../src/scene/terrain/terrainMesh'

const dir = new URL('../public/terrain/', import.meta.url)
const manifest: AtlasInfo = JSON.parse(readFileSync(new URL('atlas.json', dir), 'utf8'))
const atlas: TerrainAtlas = {
  road: manifest.road,
  insets: manifest.insets.map((t) => decodeTile(t, readFileSync(new URL(t.file, dir)))),
  tiles: manifest.tiles.map((t) => decodeTile(t, readFileSync(new URL(t.file, dir)))),
}

describe('published erosion atlas', () => {
  it('delivers four nested five-channel fields with matching file digests', () => {
    expect(atlas.tiles.map((t) => t.span)).toEqual([10000, 2400, 300, 80])
    expect(atlas.insets.map((t) => t.id)).toEqual(['east-mouth', 'west-mouth'])
    for (const tile of [...atlas.tiles, ...atlas.insets]) {
      expect(createHash('sha256').update(tile.bytes).digest('hex')).toBe(tile.sha256)
      for (const channel of [2, 3, 4, 5]) {
        const values = new Set<number>()
        for (let i = 0; i < tile.n * tile.n; i += 7) values.add(tile.bytes[i * 6 + channel])
        expect(values.size).toBeGreaterThan(12)
      }
    }
  })
  it('matches parent triangles all along each finer tile boundary', () => {
    for (const child of [...atlas.tiles.slice(1), ...atlas.insets]) {
      const parent = atlas.tiles.find((t) => t.id === child.parent)!,
        r = child.span / 2
      let worst = 0
      for (let j = 0; j < child.n; j++)
        for (const sign of [-1, 1]) {
          const u = -r + j * child.step
          for (const [x, z] of [
            [child.cx + u, child.cz + sign * r],
            [child.cx + sign * r, child.cz + u],
          ])
            worst = Math.max(
              worst,
              Math.abs(sampleTile(child, x, z).height - sampleTile(parent, x, z).height),
            )
        }
      expect(worst).toBeLessThanOrEqual(1 / 32)
    }
  })
  it('puts the level station between a high northern ridge, twin ravines and a southern valley', () => {
    for (const x of [-16, 0, 14]) for (const z of [-9, 0, 8]) expect(groundAt(atlas, x, z).height).toBe(0)
    const ridge = Math.max(
      ...Array.from({ length: 41 }, (_, i) => groundAt(atlas, (i - 20) * 13, -790).height),
    )
    expect(ridge).toBeGreaterThan(550)
    expect(ridge).toBeLessThan(690)
    expect(groundAt(atlas, 50, 730).height).toBeLessThan(-270)
    for (const x of [-270, 300]) {
      const trough = Math.min(
        ...Array.from({ length: 15 }, (_, i) => groundAt(atlas, x + (i - 7) * 6, 410).height),
      )
      const bank = Math.max(groundAt(atlas, x - 110, 410).height, groundAt(atlas, x + 110, 410).height)
      expect(bank - trough).toBeGreaterThan(18)
    }
  })
  it('generates planar geological faces following sampled rock and excluding the building void', () => {
    for (const z of [-4, -2.35, 6.25]) {
      const g = sectionFace(atlas.tiles[3], z),
        pos = g.getAttribute('position'),
        surface = g.getAttribute('groundY')
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i),
          y = pos.getY(i)
        expect(pos.getZ(i)).toBeCloseTo(z, 5)
        if (x > -16 && x < 16) expect(y < -23 || (x >= 14 && y >= -0.301)).toBe(true)
        expect(surface.getX(i)).toBeCloseTo(groundAt(atlas, x, z).height, 4)
      }
      g.dispose()
    }
  })
})
describe('civil routes in the rendered survey', () => {
  it('locates all 19 numbered facilities and connects the road, avalanche gallery and valley gate', () => {
    expect(siteFacilities.map((f) => f.id)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1))
    expect(new Set(siteFacilities.map((f) => f.kind)).size).toBe(19)
    for (const f of siteFacilities) expect(facilityAnchor(f, atlas).every(Number.isFinite)).toBe(true)
    const garage = footprint(roomsOn('L1').find((r) => r.id === 'l1_garage')!.bounds)
    expect(atlas.road[0]).toEqual([garage.x, 0, garage.z1])
    expect(facilityAnchor(siteFacilities[1], atlas)).toEqual(pointAlong(atlas.road, galleryChainage))
    const gate = facilityAnchor(siteFacilities[0], atlas),
      end = atlas.road.at(-1)!
    expect(gate[0]).toBe(end[0])
    expect(gate[2]).toBe(end[2])
    let worstGrade = 0,
      worstGround = 0
    for (let i = 1; i < atlas.road.length; i++) {
      const a = atlas.road[i - 1],
        b = atlas.road[i],
        len = Math.hypot(b[0] - a[0], b[2] - a[2])
      worstGrade = Math.max(worstGrade, Math.abs(b[1] - a[1]) / len)
      for (let d = 0; d < len; d += 2) {
        const [x, y, z] = pointAlong([a, b], d)
        for (const lateral of [-3, 0, 3]) {
          const dx = ((b[2] - a[2]) * lateral) / len,
            dz = ((a[0] - b[0]) * lateral) / len
          worstGround = Math.max(worstGround, groundAt(atlas, x + dx, z + dz).height - y)
        }
      }
    }
    expect(worstGrade).toBeLessThan(0.13)
    expect(worstGround, 'rock protrusion on the graded carriageway').toBeLessThan(0.09)
  })
  it('connects both real floor openings, the B2 transfer and the halfway refuge to daylight', () => {
    const { east, west } = adits,
      start = east.points[0],
      end = east.points.at(-1)!
    expect(pathLength(west.points)).toBeCloseTo(60)
    expect(pathLength(east.points)).toBeCloseTo(270)
    expect((start[1] - end[1]) / pathLength(east.points)).toBeCloseTo(0.003, 8)
    expect([east.width, east.height]).toEqual([2.5, 2.8])
    expect(eastTransfer.at(-1)).toEqual(start)
    expect(eastTransfer[0][0]).toBeLessThan(shaftPlans[4].x0)
    expect(eastTransfer[0][2]).toBe(shaftPlans[4].z)
    expect(refuge[0]).toBeCloseTo((start[0] + end[0]) / 2)
    expect(west.points[0][0]).toBe(footprint(roomsOn('B1').find((r) => r.id === 'b1_decon')!.bounds).x0)
    expect(start[0]).toBe(footprint(FLOORS.B2.bounds).x1)
    for (const adit of [east, west]) {
      const [x, y, z] = adit.points.at(-1)!
      expect(adit.points[0][1]).toBe(FLOORS[adit.floor].elevation)
      expect(Math.abs(groundAt(atlas, x, z).height - y)).toBeLessThan(0.055)
    }
    expect(altitude(end[1])).toBeCloseTo(1434.79)
    for (let d = 24; d <= 246; d++) {
      const [x, y, z] = pointAlong(east.points, d),
        cover = groundAt(atlas, x, z).height - (y + east.height)
      expect(cover).toBeGreaterThanOrEqual(14)
      expect(cover).toBeLessThanOrEqual(29)
    }
  })
  it('opens the two bore voids in their own sections and retains the rock beside them', () => {
    const material = new MeshBasicMaterial({ side: DoubleSide })
    for (const bore of Object.values(adits)) {
      const [start] = bore.points,
        x = start[0] + (bore.id === 'west' ? -8 : 8)
      for (const [offset, solid] of [
        [0, false],
        [bore.width, true],
      ] as const) {
        const z = start[2] + offset,
          geometry = sectionFace(atlas.tiles[3], z)
        const ray = new Raycaster(new Vector3(x, start[1] + 1.4, z + 2), new Vector3(0, 0, -1))
        expect(ray.intersectObject(new Mesh(geometry, material)).length > 0).toBe(solid)
        geometry.dispose()
      }
    }
    material.dispose()
  })
  it('keeps the sagging freight cable and its suspended buckets clear of the hillside', () => {
    const { tops, spans } = freightCable(atlas)
    expect(spans.length).toBe(tops.length - 1)
    const minimum = Math.min(...spans.flat().map(([x, y, z]) => y - groundAt(atlas, x, z).height))
    expect(minimum).toBeGreaterThanOrEqual(4)
  })
  it('places the gravity and air terminals on the correct sides and elevations', () => {
    const at = (kind: string) => facilityAnchor(siteFacilities.find((f) => f.kind === kind)!, atlas)
    expect(at('spring')[1]).toBeGreaterThan(FLOORS.B3.elevation)
    expect(altitude(at('drain')[1])).toBeCloseTo(1240, 1)
    expect(FLOORS.B4.elevation - at('drain')[1]).toBeCloseTo(187.2, 1)
    expect(at('westIntake')[0]).toBeLessThan(0)
    expect(at('eastIntake')[0]).toBeGreaterThan(0)
    expect(at('exhaust')[1]).toBeLessThan(0)
    expect(serviceLinks.map((l) => l.source + '>' + l.target)).toEqual([
      'spring>b3_water',
      'b4_drainage>drain',
      'westIntake>wet',
      'eastIntake>wet',
      'wet>exhaust',
    ])
  })
})
describe('daylight openings in the triangle meshes', () => {
  const material = new MeshBasicMaterial({ side: DoubleSide })
  const tiles = [...atlas.tiles.slice(1), ...atlas.insets]
  const meshes = tiles.map(
    (t) =>
      new Mesh(
        tileSurface(
          t,
          tiles.filter((child) => child.parent === t.id),
        ),
        material,
      ),
  )
  afterAll(() => {
    meshes.forEach((m) => m.geometry.dispose())
    material.dispose()
  })
  it.each(Object.values(adits))('$id bore is open at eye height with a solid rock shoulder', (adit) => {
    const a = adit.points.at(-2)!,
      b = adit.points.at(-1)!,
      d = new Vector3(a[0] - b[0], 0, a[2] - b[2]).normalize()
    const cast = (offset: number) => {
      const origin = new Vector3(b[0] - d.x * 12 + d.z * offset, b[1] + 1.4, b[2] - d.z * 12 - d.x * offset)
      return new Raycaster(origin, d, 0.01, 38).intersectObjects(meshes).length
    }
    expect(cast(0)).toBe(0)
    expect(cast(adit.width / 2 + 1.3)).toBeGreaterThan(0)
  })
})
