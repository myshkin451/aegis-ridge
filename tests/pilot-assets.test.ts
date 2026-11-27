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
    ]
    for (const finish of finishes) {
      const material = pbrMaterial(finish)
      expect(material.customProgramCacheKey()).toBe('ars-solid')
      material.dispose()
    }
  })
})
