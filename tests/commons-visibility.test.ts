import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { FLOORS } from '../src/data/floors'
import { atriumFootprint } from '../src/geometry/atrium'
import { commonsEquipmentVisibility, insideCommons, seesUpperShaft, visibleBelowSlab } from '../src/scene/rooms/commonsVisibility'

const floor = FLOORS.B2.elevation

describe('B2 room visibility', () => {
  it('retains views through the farm glazing and restores the upper shaft near the corridor', () => {
    const eye = new Vector3(-12, floor + 1.65, 7)
    const farBox = new Box3(new Vector3(9, floor-3, 3), new Vector3(12, floor-2, 5))
    const crops = new Box3(new Vector3(-14, floor-3.5, 3), new Vector3(-11, floor-1, 7))
    expect(insideCommons(eye)).toBe(true)
    expect(visibleBelowSlab(crops, eye, [atriumFootprint])).toBe(true)
    expect(visibleBelowSlab(farBox, eye, [atriumFootprint])).toBe(false)
    expect(seesUpperShaft(eye)).toBe(false)
    eye.set(-10, floor+1.65, .3)
    expect(seesUpperShaft(eye)).toBe(true)
    eye.z = -.2
    expect(insideCommons(eye)).toBe(false)
  })

  it('keeps original instance indices and restores the entire batch outside the commons', () => {
    const root = new Group()
    root.position.y = floor
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 3)
    mesh.userData.equipmentTags = ['seat','bed','bed']
    for (const [i, x] of [-14,0,2].entries()) mesh.setMatrixAt(i, new Matrix4().makeTranslation(x, .65, 8))
    root.add(mesh)
    const matrices = mesh.instanceMatrix.array.slice()
    const mask = commonsEquipmentVisibility(root, 'B2')
    mask.update(new Vector3(-14, floor+1.65, 7))
    expect(mesh.count).toBe(1)
    mask.update(null)
    expect(mesh.count).toBe(3)
    expect(mesh.instanceMatrix.array).toEqual(matrices)
    mesh.geometry.dispose()
    mesh.material.dispose()
    mesh.dispose()
  })
})
