import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import {
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  disposeDomesticAssets,
  domesticKinds,
  installDomesticAssets,
  isDomestic,
  setDomesticWalkthrough,
  takeDomesticGeometry,
} from '../src/scene/assets/domesticAssets'
import { roomModels } from '../src/scene/rooms/roomModels'
import { residentialFinishes } from '../src/scene/rooms/residentialFinishes'

function checkThrowSurfaces(floor: Group) {
  const material = new MeshBasicMaterial({ side: DoubleSide })
  try {
    for (const [cover, support, beds] of [
      ['throw', 'duvet', 1],
      ['standard-throw', 'standard-duvet', 13],
    ] as const) {
      const runner = floor.children.find((m) => m.userData.shape === cover) as InstancedMesh
      const quilt = floor.children.find((m) => m.userData.shape === support) as InstancedMesh
      expect(runner.count).toBe(beds)
      expect(runner.instanceMatrix.array).toEqual(quilt.instanceMatrix.array)
      // Full triangle/triangle intersection includes the underside and rounded selvage.
      const source = quilt.geometry.clone()
      const bvh = new MeshBVH(source)
      expect(bvh.intersectsGeometry(runner.geometry, new Matrix4()), cover + ' crosses ' + support).toBe(
        false,
      )
      source.dispose()
      const blanket = new Mesh(runner.geometry, material),
        base = new Mesh(quilt.geometry, material)
      const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0))
      const scaleY = beds === 1 ? 0.22 : 0.09
      for (let i = 0; i <= 10; i++)
        for (let j = 0; j <= 6; j++) {
          ray.ray.origin.set(-0.34 + i * 0.068, 2, -0.421 + j * 0.03)
          const hits = ray.intersectObject(blanket),
            quiltTop = ray.intersectObject(base)[0].point.y
          expect(hits.length).toBeGreaterThanOrEqual(2)
          const underneath = hits[hits.length - 1].point.y
          expect((underneath - quiltTop) * scaleY).toBeLessThan(0.006)
          expect((hits[0].point.y - underneath) * scaleY).toBeGreaterThan(0.01)
        }
    }
  } finally {
    material.dispose()
  }
}

it('installs every shipped domestic shell on the B2 batches within its geometry budget and restores each fallback', async () => {
  const bytes = await readFile(new URL('../public/assets/pilot/domestic.glb', import.meta.url))
  const file = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '')
  const library = takeDomesticGeometry(file.scene)
  const floors = [roomModels('B2').build(), residentialFinishes().build()]
  const meshes = floors
    .flatMap((m) => m.object.children)
    .filter((m): m is InstancedMesh => m instanceof InstancedMesh && isDomestic(m.userData.domesticKind))
  const fallbacks = meshes.map((m) => m.geometry)
  try {
    expect([...library.keys()].sort()).toEqual([...domesticKinds].sort())
    expect(new Set(meshes.map((m) => m.userData.domesticKind))).toEqual(new Set(['pillow','duvet','wc-bowl','basin','pleated-shade']))
    const budget = {
      pillow: 2000,
      duvet: 4000,
      'sofa-cushion': 8000,
      'wc-bowl': 6000,
      basin: 6000,
      'pleated-shade': 2500,
      houseplant: 3500,
    }
    for (const [name, g] of library) {
      expect(g.index!.count / 3).toBeLessThanOrEqual(budget[name])
      for (const v of g.boundingBox!.getSize(new Vector3()).toArray()) expect(v).toBeCloseTo(1)
    }
    checkThrowSurfaces(floors[0].object)
    setDomesticWalkthrough(true)
    installDomesticAssets(library)
    checkThrowSurfaces(floors[0].object)
    for (const [i, m] of meshes.entries()) {
      expect(m.geometry).toBe(library.get(m.userData.domesticKind))
      expect(m.geometry).not.toBe(fallbacks[i])
      expect((m.material as MeshStandardMaterial).customProgramCacheKey()).toBe(
        m.userData.finish === 'fabric' ? 'ars-scan-curved' : 'ars-solid',
      )
    }
    for (const kind of ['pillow', 'duvet']) {
      const tags: string[] = []
      const bunks = new Map<string, number[]>()
      for (const mesh of meshes.filter((m) => m.userData.domesticKind === kind)) {
        for (let i = 0; i < mesh.count; i++) {
          const tag = mesh.userData.equipmentTags[i]
          tags.push(tag)
          if (tag !== 'CAB-209') continue
          const matrix = new Matrix4()
          mesh.getMatrixAt(i, matrix)
          const { x, y, z } = new Vector3().setFromMatrixPosition(matrix)
          const location = x + '/' + z
          if (!bunks.has(location)) bunks.set(location, [])
          bunks.get(location)!.push(y)
        }
      }
      expect(tags.filter(tag => tag !== 'SOF-203').sort()).toEqual([
        'CAB-201',
        'CAB-202',
        'CAB-203',
        'CAB-204',
        'CAB-205',
        'CAB-206',
        'CAB-207',
        'CAB-207',
        'CAB-208',
        'CAB-208',
        'CAB-209',
        'CAB-209',
        'CAB-209',
        'CAB-209',
      ])
      expect(bunks.size).toBe(2)
      for (const tiers of bunks.values()) {
        expect(tiers).toHaveLength(2)
        expect(Math.abs(tiers[1] - tiers[0])).toBeCloseTo(1.05)
      }
    }
    setDomesticWalkthrough(false)
    for (const [i, m] of meshes.entries()) expect(m.geometry).toBe(fallbacks[i])
    setDomesticWalkthrough(true)
    disposeDomesticAssets(library)
    for (const [i, m] of meshes.entries()) expect(m.geometry).toBe(fallbacks[i])
  } finally {
    setDomesticWalkthrough(false)
    installDomesticAssets(null)
    floors.forEach((f) => f.dispose())
  }
})
