import { describe, expect, it } from 'vitest'
import { Box3, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from 'three'
import { roomsOn } from '../src/data/defaultBlueprint'
import { drawEquipment } from '../src/scene/rooms/roomModels'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'
import type { EquipmentUnit, FloorId } from '../src/types/shelter'

function boundsByPlant(floor: FloorId, unit: EquipmentUnit) {
  const m = new ModelBuilder()
  drawEquipment(m, floor, unit)
  const built = m.build()
  const matrix = new Matrix4(),
    vertex = new Vector3(),
    origin = new Vector3(...unit.position)
  const measured: Box3[] = []
  try {
    for (const mesh of built.object.children) {
      if (!(mesh instanceof InstancedMesh) || !mesh.userData.shape.startsWith('crop-')) continue
      expect(mesh.material).toBeInstanceOf(MeshStandardMaterial)
      expect(mesh.material.side).toBe(DoubleSide)
      expect(mesh.material.alphaTest).toBeGreaterThan(0)
      expect(built.materials.some(({ material }) => material === mesh.material)).toBe(true)
      const vertices = mesh.geometry.getAttribute('position')
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix)
        const bounds = new Box3()
        for (let k = 0; k < vertices.count; k++)
          bounds.expandByPoint(vertex.fromBufferAttribute(vertices, k).applyMatrix4(matrix).sub(origin))
        measured.push(bounds)
      }
    }
  } finally {
    built.dispose()
  }
  expect(measured.length).toBeGreaterThan(0)
  return measured
}

describe('installed crop cards', () => {
  for (const room of roomsOn('B3'))
    for (const unit of room.equipment.filter((u) => /^GR-33[12]/.test(u.tagCode))) {
      it('keeps every ' + unit.tagCode + ' leaf inside its tray and below the light', () => {
        const leafy = unit.tagCode.startsWith('GR-331')
        const [width, , length] = unit.moduleSizeM
        const levels = Array.from({ length: leafy ? 5 : 2 }, (_, i) => {
          const y = leafy ? 0.23 + i * 0.525 : 0.34 + i * 1.15
          return new Box3(
            new Vector3(-(width - 0.24) / 2, y + (leafy ? 0.0525 : 0.14) + 0.0175, -(length - 0.28) / 2),
            new Vector3((width - 0.24) / 2, y + (leafy ? 0.417 : 0.971), (length - 0.28) / 2),
          ).expandByScalar(1e-6)
        })
        const populated = new Set<number>()
        for (const bounds of boundsByPlant('B3', unit)) {
          const index = levels.findIndex((tray) => tray.containsBox(bounds))
          if (index < 0) throw Error('Leaf intersects frame: ' + JSON.stringify(bounds))
          populated.add(index)
        }
        expect(populated.size).toBe(levels.length)
      })
    }

  for (const floor of ['B3', 'L2'] as const) {
    for (const room of roomsOn(floor)) {
      for (const unit of room.equipment.filter((u) => /^(BOT-211|AQ-341)/.test(u.tagCode))) {
        it('keeps ' + unit.tagCode + ' foliage within the planter or float', () => {
          const greenhouse = floor === 'L2'
          const box = greenhouse
            ? new Box3(new Vector3(-0.645, 0.372, -2.2125), new Vector3(0.645, 1.56, 2.2125))
            : new Box3(new Vector3(-0.74, 1.106, 0.93), new Vector3(0.74, 1.55, 1.43))
          box.expandByScalar(1e-6)
          expect(boundsByPlant(floor, unit).every((b) => box.containsBox(b))).toBe(true)
        })
      }
    }
  }
})
