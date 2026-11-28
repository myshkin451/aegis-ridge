import { expect, it } from 'vitest'
import { Box3, InstancedMesh, Matrix4, Vector3, DataArrayTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter } from 'three'
import { doors } from '../src/geometry/doors'
import { residentialFinishes } from '../src/scene/rooms/residentialFinishes'
import { setSurfaceSampling } from '../src/scene/materials/surfaceSampling'
import { cleanRoomPanels } from '../src/scene/rooms/floorFinishes'
import { roomStructure } from '../src/scene/utils/shellGeometry'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'

function instanceBounds(builder: ModelBuilder, finish: string) {
  const built = builder.build()
  const boxes: Box3[] = []
  try {
    for (const mesh of built.object.children) {
      if (!(mesh instanceof InstancedMesh) || mesh.userData.finish !== finish) continue
      mesh.geometry.computeBoundingBox()
      const matrix = new Matrix4()
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix)
        boxes.push(mesh.geometry.boundingBox!.clone().applyMatrix4(matrix))
      }
    }
    return boxes
  } finally {
    built.dispose()
  }
}

it('leaves the B3 door openings and corridor sightlines clear through the real wall finish', () => {
  const panels = instanceBounds(cleanRoomPanels(), 'pvc_clean')
  const shell = new ModelBuilder()
  roomStructure(shell, 'B3')
  const glazing = instanceBounds(shell, 'glass')
  expect(panels.length).toBeGreaterThan(0)
  expect(glazing.length).toBeGreaterThan(0)
  for (const door of doors.filter((d) => d.floor === 'B3' && d.axis !== 'bearing')) {
    const width = door.width - 0.08
    const size = door.axis === 'x' ? [width, door.height - 0.1, 0.46] : [0.46, door.height - 0.1, width]
    const opening = new Box3().setFromCenterAndSize(
      new Vector3(door.base[0], door.height / 2, door.base[2]),
      new Vector3(...size),
    )
    expect(panels.some((panel) => panel.intersectsBox(opening)), door.id).toBe(false)
  }
  for (const pane of glazing) {
    // Look through the full clear glazing, between the adjoining 340 mm columns.
    const opening = pane.clone().expandByVector(new Vector3(-0.48, -0.04, 0.22))
    expect(panels.some((panel) => panel.intersectsBox(opening))).toBe(false)
  }
})

it('keeps the back of the room lining clear of both the concrete perimeter and internal door frames', () => {
  const panels = instanceBounds(cleanRoomPanels(), 'pvc_clean')
  const west = panels.find(p => p.min.x < -15 && p.max.x - p.min.x < 0.013 && p.min.z > 2)
  const corridor = panels.find(p => p.min.z > 0 && p.max.z < 0.3 && p.max.x < -2)
  expect(west).toBeDefined()
  expect(corridor).toBeDefined()
  expect(west!.min.x - (-16 + 0.2)).toBeGreaterThanOrEqual(0.015)
  expect(corridor!.min.z - 0.105).toBeGreaterThanOrEqual(0.015)
})

it('renders each woven border in a biased batch with at least 3 mm clear above its rug', () => {
  const built = residentialFinishes().build()
  try {
    const marks = built.object.children.filter(m => m instanceof InstancedMesh && m.material.polygonOffset)
    expect(marks).toHaveLength(1)
    const stripes = marks[0] as InstancedMesh
    expect(stripes.count).toBe(3 * 2 * 3)
    const rugs = instanceBounds(residentialFinishes(), 'fabric').filter(b =>
      Math.abs(b.min.y - 0.023) < 1e-4 && Math.abs(b.max.y - 0.035) < 1e-4,
    )
    expect(rugs).toHaveLength(3)
    stripes.geometry.computeBoundingBox()
    const matrix = new Matrix4()
    for (let i = 0; i < stripes.count; i++) {
      stripes.getMatrixAt(i, matrix)
      const b = stripes.geometry.boundingBox!.clone().applyMatrix4(matrix)
      const rug = rugs.find(r => r.min.x < b.min.x && r.max.x > b.max.x && r.min.z < b.min.z && r.max.z > b.max.z)
      expect(rug).toBeDefined()
      expect(b.min.y - rug!.max.y).toBeGreaterThanOrEqual(0.003)
    }
  } finally {
    built.dispose()
  }
})

it('uses trilinear minification on 2D and array surfaces and respects the hardware sampling limit', () => {
  for (const t of [new DataTexture(), new DataArrayTexture()]) {
    try {
      for (const maximum of [16, 4, 1]) {
        setSurfaceSampling(t, maximum)
        expect(t.anisotropy).toBe(Math.min(8, maximum))
        expect(t.generateMipmaps).toBe(true)
        expect(t.minFilter).toBe(LinearMipmapLinearFilter)
        expect(t.magFilter).toBe(LinearFilter)
        const before = t.version
        setSurfaceSampling(t, maximum)
        expect(t.version).toBe(before)
      }
    } finally {
      t.dispose()
    }
  }
})
