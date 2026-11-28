import { expect, it } from 'vitest'
import { BoxGeometry, FrontSide, Mesh, MeshBasicMaterial, Raycaster, ShaderMaterial, Vector3 } from 'three'
import { defaultBlueprint } from '../src/data/defaultBlueprint'
import { FLOORS } from '../src/data/floors'
import { doors, leafOffset, leafThickness } from '../src/geometry/doors'
import { footprint } from '../src/geometry/coords'
import { mountGaugeFace } from '../src/scene/atmosphere/DeconGauge'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'
import { partition } from '../src/scene/utils/shellGeometry'

it('frames the room-side dial with every corner clear of the partition and sliding leaf travel', () => {
  const room = defaultBlueprint.rooms.find((r) => r.id === 'b1_decon')!
  const anchor = room.cameraAnchors.find((a) => a.name === '门旁压差表')!
  const door = doors.find((d) => d.id === room.id)!
  const floorY = FLOORS.B1.elevation
  const eye = new Vector3(...anchor.position)
  eye.y += floorY
  const aim = new Vector3(...anchor.target)
  aim.y += floorY
  const face = mountGaugeFace(new ShaderMaterial({ side: FrontSide }))
  face.updateMatrixWorld()
  const wallBuilder = new ModelBuilder()
  const bounds = footprint(room.bounds)
  partition(wallBuilder, room.floorId, 'x', door.base[2], bounds.x0, bounds.x1, FLOORS.B1.clearHeight)
  const wall = wallBuilder.build()
  wall.object.position.y = floorY
  wall.object.updateMatrixWorld(true)
  const leaf = new Mesh(new BoxGeometry(door.width / 2, door.height, leafThickness), new MeshBasicMaterial())
  const ray = new Raycaster()
  try {
    expect(aim.distanceTo(face.position)).toBeLessThan(0.001)
    expect(eye.z).toBeLessThan(face.position.z)
    expect(face.position.z).toBeLessThan(door.base[2])
    const corners = face.geometry.getAttribute('position')
    const nearestX = face.position.x - face.geometry.parameters.width / 2
    expect(nearestX - (door.base[0] + leafOffset(door, 1, 1) + door.width / 4)).toBeGreaterThan(0.1)
    for (const open of [0, 0.5, 1]) {
      leaf.position.set(
        door.base[0] + leafOffset(door, 1, open),
        floorY + door.height / 2,
        door.base[2] + door.trackOffset!,
      )
      leaf.updateMatrixWorld()
      for (let i = 0; i < corners.count; i++) {
        const point = new Vector3()
          .fromBufferAttribute(corners, i)
          .multiplyScalar(0.99)
          .applyMatrix4(face.matrixWorld)
        ray.set(eye, point.clone().sub(eye).normalize())
        ray.far = eye.distanceTo(point) + 0.001
        expect(ray.intersectObjects([wall.object, leaf, face], true)[0]?.object).toBe(face)
      }
    }
  } finally {
    face.geometry.dispose()
    face.material.dispose()
    leaf.geometry.dispose()
    leaf.material.dispose()
    wall.dispose()
  }
})
