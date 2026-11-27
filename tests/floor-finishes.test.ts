import { expect, it } from 'vitest'
import { Box3, InstancedMesh, Matrix4, Vector3 } from 'three'
import { doors } from '../src/geometry/doors'
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
