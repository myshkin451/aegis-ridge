import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Material,
} from 'three'
import { groundAt, type TerrainAtlas } from '../../geometry/siteElevations'
import { randomSource } from '../../geometry/random'
import { outdoorCardMaterial, outdoorSolid, treeShadowMaterial } from '../materials/foliageMaterial'
import type { getFoliageAssets } from './foliageAssets'
import { footingNormal, meadowPlantings, plantingClear, roadVerge, surveyPlantings } from './vegetationStand'

const up = new Vector3(0, 1, 0)
const white = new Color(0xffffff)
const compose = (x: number, y: number, z: number, q: Quaternion, w: number, h: number, d: number) =>
  new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(w, h, d))

function slopeRotation(normal: [number, number, number], yaw: number) {
  return new Quaternion()
    .setFromUnitVectors(up, new Vector3(...normal))
    .multiply(new Quaternion().setFromAxisAngle(up, yaw))
}

/** Two intersecting sprays retain the outline of distinct tufts at grazing angles. */
function crossedCards() {
  const geometry = new BufferGeometry()
  const points: number[] = [],
    uv: number[] = [],
    indices: number[] = []
  for (let i = 0; i < 2; i++) {
    const a = (Math.PI * i) / 2,
      dx = Math.cos(a) * 0.5,
      dz = Math.sin(a) * 0.5
    points.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz)
    uv.push(0, 0, 1, 0, 1, 1, 0, 1)
    const base = i * 4
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function batch(
  group: Group,
  name: string,
  geometry: BufferGeometry,
  material: Material,
  capacity: number,
  casts: boolean,
) {
  const mesh = new InstancedMesh(geometry, material, capacity)
  mesh.name = name
  mesh.count = 0
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(
    DynamicDrawUsage,
  )
  // Instance bounds change with camera LOD. Distance filtering bounds the active set in all passes.
  mesh.frustumCulled = false
  mesh.castShadow = casts
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

interface Stamp {
  x: number
  y: number
  z: number
  matrix: Matrix4
  color: Color
}
function emit(mesh: InstancedMesh, stamp: Stamp, matrix = stamp.matrix) {
  mesh.setMatrixAt(mesh.count, matrix)
  mesh.setColorAt(mesh.count++, stamp.color)
}

export function buildAlpineVegetation(
  atlas: TerrainAtlas,
  assets: ReturnType<typeof getFoliageAssets>,
  treeDistance: number,
) {
  const group = new Group()
  group.name = '高山针叶林与倒石坡'
  const trees: (Stamp & { trunk: Matrix4; impostor: Matrix4 })[] = [],
    rocks: Stamp[] = []
  const random = randomSource(93411)
  const verge = roadVerge(atlas)
  function placeStone(x: number, z: number, radius: number, yaw: number) {
    if (!plantingClear(atlas, x, z, radius * 0.92)) return
    const y = groundAt(atlas, x, z).height
    const normal = footingNormal(atlas, x, z, Math.max(0.22, radius * 0.65))
    const q = slopeRotation(normal, yaw)
    // Lowest surface is 0.30 R below the triangle tangent; tilted flat slabs bite into the talus.
    const h = radius * 0.8,
      embed = h * 0.12
    const matrix = compose(
      x + normal[0] * embed,
      y + normal[1] * embed,
      z + normal[2] * embed,
      q,
      radius * 1.4,
      h,
      radius,
    )
    const color = new Color(0.9 + 0.1 * random(), 0.9 + 0.08 * random(), 0.86 + 0.1 * random())
    rocks.push({ x, y, z, matrix, color })
  }
  for (const p of surveyPlantings(atlas)) {
    if (p.kind === 'rock') {
      placeStone(p.x, p.z, p.radius, p.yaw)
      // Additional fragments collect on steep, eroded toes around the mapped boulders.
      const s = groundAt(atlas, p.x, p.z)
      if (Math.hypot(p.x, p.z) > 300 || s.slope < 25 || s.slope > 49) continue
      const count = Math.floor(2 + 4 * s.flow + Math.max(0, s.curvature) * 5)
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2,
          d = p.radius + 0.9 + 4 * random()
        placeStone(
          p.x + Math.cos(angle) * d,
          p.z + Math.sin(angle) * d,
          p.radius * (0.15 + 0.31 * random()),
          angle,
        )
      }
    } else if (p.kind === 'fir') {
      const q = new Quaternion().setFromEuler(new Euler(p.lean, p.yaw, 0.035))
      const y = p.y + p.height * 0.49
      // Keep the original roots, height and heading. Only trees beside the road need
      // narrower whorls to clear its full width, including the 4.9 m passing-bay edge.
      const lateralRoom = verge(p.x, p.z) - 0.065 * p.height - 0.1
      const whorl = Math.min(1, Math.max(0, lateralRoom) / (0.52 * Math.max(p.width, p.depth)))
      const width = p.width * whorl,
        depth = p.depth * whorl
      const matrix = compose(p.x, y, p.z, q, width, p.height, depth)
      // The baked tree occupies 0.56 reference units in X/Z and one unit in Y.
      const impostor = compose(p.x, y, p.z, q, width / 0.56, p.height, depth / 0.56)
      const trunk = compose(
        p.x,
        p.y + p.height * 0.465,
        p.z,
        q,
        p.width * 0.084,
        p.height * 0.98,
        p.width * 0.084,
      )
      const color = new Color(p.tint).lerp(white, 0.67)
      trees.push({ x: p.x, y: p.y, z: p.z, matrix, impostor, trunk, color })
    }
  }
  const tufts = meadowPlantings(atlas).map((p) => ({
    x: p.x,
    y: p.y,
    z: p.z,
    kind: p.kind,
    color: new Color().setScalar(0.76 + 0.24 * random()),
    matrix: compose(p.x, p.y, p.z, slopeRotation(p.normal, p.yaw), p.width, p.height, p.width),
  }))
  const time = { value: 0 }
  const bark = outdoorSolid(false, '#544b3c'),
    stone = outdoorSolid(true, '#ffffff')
  const branch = outdoorCardMaterial('branch', assets.branch, time),
    far = outdoorCardMaterial('impostor', assets.impostor, time)
  const grass = outdoorCardMaterial('ground', assets.grass, time),
    shrub = outdoorCardMaterial('ground', assets.shrub, time)
  const trunkGeometry = new CylinderGeometry(0.12, 0.56, 1, 7)
  const billboard = new PlaneGeometry(1.1, 1.1),
    tuft = crossedCards()
  const trunks = batch(group, 'fir-trunks', trunkGeometry, bark, trees.length, true)
  const crowns = batch(group, 'fir-crowns', assets.crown, branch, trees.length, true)
  const silhouettes = batch(group, 'fir-octa', billboard, far, trees.length, true)
  crowns.customDepthMaterial = treeShadowMaterial('branch', assets.branch, time)
  silhouettes.customDepthMaterial = treeShadowMaterial('impostor', assets.impostor, time)
  const stones = assets.rockLods.map((geometry, i) =>
    batch(group, 'rock-' + i, geometry, stone, rocks.length, true),
  )
  const grasses = batch(
    group,
    'meadow-grass',
    tuft,
    grass,
    tufts.filter((p) => p.kind === 'grass').length,
    false,
  )
  const shrubs = batch(group, 'meadow-shrub', tuft, shrub, tufts.length - grasses.instanceMatrix.count, false)
  const batches = [trunks, crowns, silhouettes, ...stones, grasses, shrubs]

  const last = new Vector3(Infinity, Infinity, Infinity)
  function update(eye: Vector3, seconds: number) {
    time.value = seconds
    if (last.distanceToSquared(eye) < 36) return
    last.copy(eye)
    for (const mesh of batches) mesh.count = 0
    const distance2 = (p: Stamp) => (eye.x - p.x) ** 2 + (eye.y - p.y) ** 2 + (eye.z - p.z) ** 2
    const detail = Math.min(150, treeDistance * 0.48)
    for (const p of trees) {
      const d = distance2(p)
      if (d < detail * detail) {
        emit(crowns, p)
        emit(trunks, p, p.trunk)
      } else if (d < (650 + 2 * treeDistance) ** 2) emit(silhouettes, p, p.impostor)
    }
    for (const p of rocks) {
      const d = distance2(p)
      if (d < 720 ** 2) emit(stones[d < 65 ** 2 ? 0 : d < 176 ** 2 ? 1 : 2], p)
    }
    for (const p of tufts) if (distance2(p) < 121 ** 2) emit(p.kind === 'grass' ? grasses : shrubs, p)
    for (const mesh of batches) {
      if (!mesh.count) continue
      mesh.instanceMatrix.clearUpdateRanges()
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16)
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.clearUpdateRanges()
      mesh.instanceColor!.addUpdateRange(0, mesh.count * 3)
      mesh.instanceColor!.needsUpdate = true
    }
  }
  // Seed all three LODs around the station for prewarming, including indoor deep links.
  update(new Vector3(), 0)
  return {
    group,
    update,
    dispose() {
      for (const mesh of batches) mesh.dispose()
      for (const resource of [
        bark,
        stone,
        branch,
        far,
        grass,
        shrub,
        crowns.customDepthMaterial!,
        silhouettes.customDepthMaterial!,
        trunkGeometry,
        billboard,
        tuft,
      ])
        resource.dispose()
    },
  }
}
