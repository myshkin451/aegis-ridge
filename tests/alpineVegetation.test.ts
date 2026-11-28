import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InstancedMesh, Matrix4, Mesh, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FLOORS } from '../src/data/floors'
import { galleryChainage, siteFacilities } from '../src/data/siteFacilities'
import { footprint } from '../src/geometry/coords'
import { freightCable } from '../src/geometry/freightCable'
import {
  decodeTile,
  groundAt,
  pathLength,
  type AtlasInfo,
  type TerrainAtlas,
} from '../src/geometry/siteElevations'
import { buildAlpineVegetation } from '../src/scene/terrain/alpineVegetation'
import { meadowPlantings, plantingClear, surveyPlantings } from '../src/scene/terrain/vegetationStand'

const dir = new URL('../public/terrain/', import.meta.url)
const fields: AtlasInfo = JSON.parse(readFileSync(new URL('atlas.json', dir), 'utf8'))
const atlas: TerrainAtlas = {
  road: fields.road,
  tiles: fields.tiles.map((t) => decodeTile(t, readFileSync(new URL(t.file, dir)))),
  insets: fields.insets.map((t) => decodeTile(t, readFileSync(new URL(t.file, dir)))),
}
const terrainY = (x: number, z: number) => groundAt(atlas, x, z).height

describe('outdoor survey, planted footprints and rendered LOD batches', () => {
  let stand: ReturnType<typeof buildAlpineVegetation>
  let template: Awaited<ReturnType<GLTFLoader['parseAsync']>>
  const map = new Texture()
  const batch = (name: string) => stand.group.getObjectByName(name) as InstancedMesh

  beforeAll(async () => {
    const bytes = readFileSync(new URL('../public/assets/vegetation/boulder-lods.glb', import.meta.url))
    template = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '')
    const geometry = (name: string) => (template.scene.getObjectByName(name) as Mesh).geometry
    stand = buildAlpineVegetation(
      atlas,
      {
        branch: map,
        grass: map,
        shrub: map,
        impostor: map,
        crop: map,
        crown: geometry('fir-crown'),
        rockLods: ['rock-near', 'rock-mid', 'rock-far'].map(geometry),
      },
      340,
    )
  })
  afterAll(() => {
    stand.dispose()
    template.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return
      o.geometry.dispose()
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) mat.dispose()
    })
    map.dispose()
  })

  it('keeps the surveyed conifer roots outside the station, roads and facilities, below their aspect-dependent treeline', () => {
    const trees = surveyPlantings(atlas).filter((p) => p.kind === 'fir')
    // Fingerprint f2a4f7c's seed sequence on a fixed five-channel triangle, independent
    // of future survey revisions. The real terrain below still has to pass every clearance.
    const bytes = Uint8Array.from(
      Array.from({ length: 4 }, (_, i) => [0, 64, 20 + 38 * i, 145, 85 + 25 * i, 70 * i]).flat(),
    )
    const fixture: TerrainAtlas = {
      road: [
        [-9, 0, 8],
        [120, 0, 32],
        [260, 0, 80],
      ],
      insets: [],
      tiles: [{ id: 'reference', cx: 0, cz: 0, n: 2, span: 2000, step: 2000, file: '', sha256: '', bytes }],
    }
    const roots = surveyPlantings(fixture)
      .filter((p) => p.kind === 'fir')
      .map((p) => p.x.toFixed(6) + ',' + p.z.toFixed(6))
      .join('\n')
    expect(createHash('sha256').update(roots).digest('hex')).toBe(
      '393afe0288bf2d327d5893af72964c2e0792b7c416a33756fbca271ef8ca5686',
    )
    expect(trees.length).toBeGreaterThan(700)
    for (const p of trees) {
      const s = groundAt(atlas, p.x, p.z)
      expect(plantingClear(atlas, p.x, p.z)).toBe(true)
      expect(p.y).toBe(s.height)
      expect(p.y).toBeLessThan(238 + 35 * (1 - Math.cos(s.aspect)))
      expect(s.slope).toBeLessThan(31)
    }
  })

  it('keeps rendered tree crowns clear of the actual road width, station, facility footprints and freight cable', () => {
    const cable = freightCable(atlas)
    const suspended = cable.spans.flat()
    const point = new Vector3(),
      matrix = new Matrix4()
    // SiteFacilities.drive widens the downhill lane at the passing bay and adds a
    // drainage edge, avalanche roof, guardrail and gabion foot at distinct chainages.
    const length = pathLength(atlas.road)
    function roadClearance(x: number, z: number) {
      let nearest = Infinity,
        chainage = 0
      for (let i = 1; i < atlas.road.length; i++) {
        const [a, , b] = atlas.road[i - 1],
          [u, , v] = atlas.road[i]
        const dx = u - a,
          dz = v - b,
          section = Math.hypot(dx, dz)
        const t = Math.min(1, Math.max(0, ((x - a) * dx + (z - b) * dz) / (section * section)))
        const d = chainage + t * section
        const bay = d > length * 0.46 && d < length * 0.48
        const uphillSide = (x - a) * dz - (z - b) * dx < 0
        const edge = uphillSide ? (d > 31 && d < 65 ? 4.815 : 3.8) : bay ? 4.9 : 3.25
        const width = Math.abs(d - galleryChainage) < 9 ? Math.max(4.2, edge) : edge
        nearest = Math.min(nearest, Math.hypot(x - a - t * dx, z - b - t * dz) - width)
        chainage += section
      }
      return nearest
    }
    // The station footprint comes from the blueprint. Use the full 10×4 solar field,
    // helipad and windsock envelope, a 1.8 m pylon envelope and a conservative radius
    // for the smaller assets (the widest is the pond with its 7.24 m stone perimeter).
    const station = footprint(FLOORS.L1.bounds)
    const [solarX, solarZ] = siteFacilities.find((f) => f.kind === 'solar')!.points[0]
    const [padX, padZ] = siteFacilities.find((f) => f.kind === 'helipad')!.points[0]
    const small = siteFacilities
      .filter(
        (f) =>
          !['station', 'eastBore', 'refuge', 'road', 'gallery', 'cable', 'solar', 'helipad'].includes(f.kind),
      )
      .flatMap((f) => f.points)
    function installationClearance(x: number, z: number) {
      const rect = (cx: number, cz: number, halfWidth: number, halfDepth: number) =>
        Math.max(Math.abs(x - cx) - halfWidth, Math.abs(z - cz) - halfDepth)
      let clearance = Math.min(
        rect(station.x, station.z, station.w / 2, station.d / 2),
        rect(solarX, solarZ, 4.5 * 2.08 + 2.01 / 2, 1.5 * 3 + 2.03 / 2),
        Math.hypot(x - padX, z - padZ) - 10.5,
        rect(padX + 10.85, padZ + 8, 1.1, 0.24),
      )
      for (const [a, b] of small) clearance = Math.min(clearance, Math.hypot(x - a, z - b) - 8.1)
      for (const [a, , b] of cable.tops) clearance = Math.min(clearance, Math.hypot(x - a, z - b) - 1.8)
      return clearance
    }
    let minRoadGap = Infinity,
      minFacilityGap = Infinity,
      minCableGap = Infinity
    for (const p of surveyPlantings(atlas)) {
      if (p.kind !== 'fir') continue
      const road = roadClearance(p.x, p.z),
        facilities = installationClearance(p.x, p.z)
      const nearbyCable = suspended.filter(([x, , z]) => Math.abs(x - p.x) < 12 && Math.abs(z - p.z) < 12)
      if (road > 12 && facilities > 12 && !nearbyCable.length) continue
      stand.update(new Vector3(p.x, p.y + 3, p.z), 0)
      const mesh = batch('fir-crowns'),
        vertices = mesh.geometry.getAttribute('position')
      let located = false
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix)
        if (Math.abs(matrix.elements[12] - p.x) < 0.001 && Math.abs(matrix.elements[14] - p.z) < 0.001) {
          located = true
          break
        }
      }
      expect(located).toBe(true)
      for (let j = 0; j < vertices.count; j++) {
        point.fromBufferAttribute(vertices, j).applyMatrix4(matrix)
        if (road <= 12) minRoadGap = Math.min(minRoadGap, roadClearance(point.x, point.z))
        if (facilities <= 12)
          minFacilityGap = Math.min(minFacilityGap, installationClearance(point.x, point.z))
        for (const [x, y, z] of nearbyCable)
          minCableGap = Math.min(minCableGap, Math.hypot(point.x - x, point.y - y, point.z - z))
      }
    }
    expect(minRoadGap).toBeGreaterThan(0)
    expect(minFacilityGap).toBeGreaterThan(0)
    expect(minCableGap).toBeGreaterThan(2)
  })

  it('places every meadow footprint inside 300 m, tangent to the surveyed grade, and excludes both card batches from shadows', () => {
    const tufts = meadowPlantings(atlas)
    expect(tufts.length).toBeGreaterThan(2500)
    for (const p of tufts) {
      expect(Math.hypot(p.x, p.z) + p.width / 2 + p.height).toBeLessThanOrEqual(300)
      expect(plantingClear(atlas, p.x, p.z, p.width / 2 + p.height)).toBe(true)
      expect(p.y).toBeCloseTo(terrainY(p.x, p.z) - 0.025, 5)
      expect(Math.hypot(...p.normal)).toBeCloseTo(1, 5)
      expect(p.normal[1]).toBeGreaterThan(0)
    }
    stand.update(new Vector3(54, 26, 64), 0)
    for (const name of ['meadow-grass', 'meadow-shrub']) {
      const mesh = batch(name)
      expect(mesh.count).toBeGreaterThan(20)
      expect(mesh.castShadow).toBe(false)
      // The opening precompiler force-enables shadows for tagged furniture finishes.
      expect(mesh.userData.finish).toBeUndefined()
    }
    for (const name of ['fir-trunks', 'fir-crowns', 'fir-octa', 'rock-0', 'rock-1', 'rock-2']) {
      expect(batch(name).castShadow).toBe(true)
    }
  })

  it('embeds every rock in the rendered triangles, clear of infrastructure, across three declining triangle budgets', () => {
    const lods = [0, 1, 2].map((n) => batch('rock-' + n))
    expect(lods[0].geometry.index!.count).toBeGreaterThan(lods[1].geometry.index!.count)
    expect(lods[1].geometry.index!.count).toBeGreaterThan(lods[2].geometry.index!.count)
    const visited = new Set<string>(),
      below = new Vector3(),
      point = new Vector3(),
      matrix = new Matrix4()
    for (const x of [-500, 0, 500])
      for (const z of [-500, 0, 500]) {
        stand.update(new Vector3(x, terrainY(x, z) + 3, z), 11)
        for (const mesh of lods)
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, matrix)
            const key = matrix.elements.slice(12, 15).join(',') + mesh.name
            if (visited.has(key)) continue
            visited.add(key)
            const position = mesh.geometry.getAttribute('position')
            const centre = below.setFromMatrixPosition(matrix)
            expect(plantingClear(atlas, centre.x, centre.z)).toBe(true)
            let minGap = Infinity,
              maxGap = -Infinity
            for (let j = 0; j < position.count; j++) {
              point.fromBufferAttribute(position, j).applyMatrix4(matrix)
              const gap = point.y - terrainY(point.x, point.z)
              minGap = Math.min(minGap, gap)
              maxGap = Math.max(maxGap, gap)
            }
            expect(minGap, key).toBeLessThan(0)
            expect(maxGap, key).toBeGreaterThan(0)
          }
      }
    expect(visited.size).toBeGreaterThan(1000)
  })
})
