import { readFileSync, statSync } from 'node:fs'
import { fieldPrints, finishScans, mipBytes, packScan, printLayerOffset, scanSize } from '../src/scene/assets/finishScans'
import { describe, expect, it } from 'vitest'
import { Box3, InstancedMesh, Matrix4, Vector3 } from 'three'
import { residentialLayouts } from '../src/data/roomLayouts/residential'
import { drawEquipment } from '../src/scene/rooms/roomModels'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'
import { pbrMaterial, type Finish } from '../src/scene/materials/pbrLibrary'

const dining = residentialLayouts.b2_commons.equipment.find((e) => e.visualKind === 'dining-table')!

describe('the B2 hybrid asset path', () => {
  it('resolves explicit visuals independently of floor and tag, including ten tagged chair instances', () => {
    const builder = new ModelBuilder()
    drawEquipment(builder, 'L1', { ...dining, tagCode: 'FUR-001' })
    const model = builder.build()
    try {
      const chairs = model.object.children.filter((mesh) => mesh.userData.shape === 'dining-chair')
      expect(chairs).toHaveLength(1)
      const batch = chairs[0] as InstancedMesh
      expect(batch.count).toBe(10)
      expect(batch.userData.batchTags).toEqual(['FUR-001'])
      batch.geometry.computeBoundingBox()
      for (const [i, placement] of dining.furniture!.entries()) {
        const matrix = new Matrix4()
        batch.getMatrixAt(i, matrix)
        const box = batch.geometry.boundingBox!.clone().applyMatrix4(matrix)
        const [w, h, d] = placement.moduleSizeM
        const size = box.getSize(new Vector3())
        expect(size.x).toBeCloseTo(d)
        expect(size.y).toBeCloseTo(h)
        expect(size.z).toBeCloseTo(w)
        expect(box.min.y).toBeCloseTo(dining.position[1] + placement.position[1])
      }
    } finally {
      model.dispose()
    }
  })

  it('retains the installed dining envelope for a blueprint saved before visualKind', () => {
    const builder = new ModelBuilder()
    drawEquipment(builder, 'B2', { ...dining, visualKind: undefined, furniture: undefined })
    const model = builder.build()
    try {
      const chairs = model.object.children.find((mesh) => mesh.userData.shape === 'dining-chair')!
      expect(new Box3().setFromObject(chairs).isEmpty()).toBe(false)
      expect((chairs as InstancedMesh).count).toBe(10)
      expect(chairs.userData.batchTags).toEqual([dining.tagCode])
    } finally {
      model.dispose()
    }
  })

  it('uses the same shader family for every sample finish', () => {
    const finishes: Finish[] = [
      'oak_int',
      'plaster',
      'fabric',
      'tile',
      'ceramic',
      'mirror',
      'pvc_clean',
      'rubber_gym',
      ...fieldPrints.map((art) => art.finish),
    ]
    for (const finish of finishes) {
      const material = pbrMaterial(finish)
      expect(material.customProgramCacheKey()).toBe('ars-solid')
      material.dispose()
    }
  })
})


it('packs linear roughness and both normal pairs correctly when scan downloads finish out of order', () => {
  const pixels = new Uint8Array(6 * 4)
  const rgba = (...channels: number[]) => new Uint8ClampedArray(channels)
  for (const i of [3, 1, 2, 0]) {
    packScan(pixels, i, rgba(i, i + 1, i + 2, 255), rgba(30 + i, 60 + i, 250, 255), rgba(90 + i, 0, 0, 255))
  }
  expect(Array.from(pixels)).toEqual([
    0, 1, 2, 90, 1, 2, 3, 91, 2, 3, 4, 92, 3, 4, 5, 93,
    30, 60, 31, 61, 32, 62, 33, 63,
  ])
})

it('ships four complete scan trios, three 1K art prints and both GLBs within the round budget', () => {
  const paths = [...finishScans.flatMap((scan) => [...scan.files]), ...fieldPrints.map((print) => print.file)]
  const local = (path: string) => new URL('../public/assets/' + path, import.meta.url)
  expect(finishScans.map((s) => s.finish)).toEqual(['oak_int', 'fabric', 'plaster', 'tile'])
  expect(new Set(paths).size).toBe(15)
  for (const path of paths) {
    const file = readFileSync(local(path))
    expect(file.toString('ascii', 8, 16), path).toBe('WEBPVP8 ')
    const w = file.readUInt16LE(26) & 0x3fff, h = file.readUInt16LE(28) & 0x3fff
    expect(Math.max(w, h), path).toBe(scanSize)
    if (!path.startsWith('art/')) expect(Math.min(w, h), path).toBe(scanSize)
  }
  const download = [...paths, 'pilot/dining-chair.glb', 'pilot/domestic.glb']
    .reduce((sum, path) => sum + statSync(local(path)).size, 0)
  expect(download).toBeLessThanOrEqual(4_000_000)
  expect(mipBytes(scanSize, printLayerOffset + fieldPrints.length)).toBe(50_331_636)
})
