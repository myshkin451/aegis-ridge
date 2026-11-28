import { Box3, InstancedMesh, Matrix4, Vector3, type Object3D } from 'three'
import { roomsOn } from '../../data/defaultBlueprint'
import { FLOORS, SLAB } from '../../data/floors'
import { atriumFootprint } from '../../geometry/atrium'
import { footprint, shaftsAt } from '../../geometry/coords'
import { doors } from '../../geometry/doors'

const room = footprint(roomsOn('B2').find((r) => r.id === 'b2_commons')!.bounds)
const slabY = FLOORS.B2.elevation
const shafts = shaftsAt(slabY)
const entrance = doors.find((d) => d.id === 'b2_commons')!
const margin = .12

export function insideCommons(eye: Vector3) {
  return eye.y > slabY + .5 && eye.y < slabY + 3.55 &&
    eye.x > room.x0 + margin && eye.x < room.x1 - margin &&
    eye.z > room.z0 + margin && eye.z < room.z1 - margin
}

type Opening = Pick<typeof atriumFootprint, 'x0' | 'x1' | 'z0' | 'z1'>

/** All five shafts lie north of the commons. A ray to any shaft must first fit through
 * the north glass / doorway. Test an expanded projected rectangle so jambs never pop. */
function shaftInSight(eye: Vector3, shaft: Opening, targetY: number) {
  const t0 = (eye.z - room.z0) / (eye.z - shaft.z0)
  const t1 = (eye.z - room.z0) / (eye.z - shaft.z1)
  const x0 = eye.x + Math.min(t0*(shaft.x0-eye.x), t1*(shaft.x0-eye.x)) - margin
  const x1 = eye.x + Math.max(t0*(shaft.x1-eye.x), t1*(shaft.x1-eye.x)) + margin
  const a = eye.y + t0*(targetY-eye.y) - slabY
  const b = eye.y + t1*(targetY-eye.y) - slabY
  const low = Math.min(a,b) - margin, high = Math.max(a,b) + margin
  const throughWindow = high >= 1.06 && low <= 2.6 && x1 >= room.x0 && x0 <= room.x1
  const doorX = entrance.base[0], half = entrance.width/2
  const throughDoor = high >= 0 && low <= entrance.height && x1 >= doorX-half && x0 <= doorX+half
  return throughWindow || throughDoor
}

export function seesUpperShaft(eye: Vector3) {
  return shafts.some((shaft) => shaftInSight(eye, shaft, FLOORS.B1.elevation - SLAB))
}

/** Project the actual B3 installation envelope onto the solid B2 slab.
 * Each extremum of this perspective projection is at a corner of the box. */
export function visibleBelowSlab(bounds: Box3, eye: Vector3, openings: readonly Opening[]) {
  if (bounds.max.y >= slabY - margin) return true
  const near = (eye.y - slabY) / (eye.y - bounds.max.y)
  const far = (eye.y - slabY) / (eye.y - bounds.min.y)
  const ax = bounds.min.x - eye.x, bx = bounds.max.x - eye.x
  const az = bounds.min.z - eye.z, bz = bounds.max.z - eye.z
  const x0 = eye.x + Math.min(near*ax, far*ax) - margin
  const x1 = eye.x + Math.max(near*bx, far*bx) + margin
  const z0 = eye.z + Math.min(near*az, far*az) - margin
  const z1 = eye.z + Math.max(near*bz, far*bz) + margin
  return openings.some((a) => x1 >= a.x0 && x0 <= a.x1 && z1 >= a.z0 && z0 <= a.z1)
}

/** Equipment stamps are contiguous within each instanced batch. Shortening its draw count leaves
 * instance IDs, picking, colors and matrices intact; other views simply restore the full count. */
export function commonsEquipmentVisibility(root: Object3D, floor: 'B2' | 'B3') {
  const batches: { mesh: InstancedMesh; full: number; originallyVisible: boolean; runs: { end: number; bounds: Box3 }[] }[] = []
  const matrix = new Matrix4(), box = new Box3()
  root.updateWorldMatrix(true, true)
  root.traverse((mesh) => {
    if (!(mesh instanceof InstancedMesh)) return
    const tags = mesh.userData.equipmentTags as (string | undefined)[] | undefined
    if (!tags) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    const runs: { end: number; bounds: Box3 }[] = []
    for (let i = 0; i < mesh.count; i++) {
      if (i === 0 || tags[i] !== tags[i-1]) runs.push({ end: 0, bounds: new Box3() })
      mesh.getMatrixAt(i, matrix)
      box.copy(mesh.geometry.boundingBox!).applyMatrix4(matrix.premultiply(mesh.matrixWorld))
      const run = runs[runs.length-1]
      run.bounds.union(box)
      run.end = i+1
    }
    batches.push({ mesh, full: mesh.count, originallyVisible: mesh.visible, runs })
  })
  return {
    update(eye: Vector3 | null) {
      const openings = floor === 'B3' && eye
        ? [atriumFootprint, ...shafts.filter((shaft) => shaftInSight(eye, shaft, slabY))]
        : []
      for (const { mesh, full, originallyVisible, runs } of batches) {
        if (!eye) {
          mesh.count = full
          mesh.visible = originallyVisible
          continue
        }
        let count = 0
        for (let i = runs.length - 1; i >= 0; i--) {
          const { bounds, end } = runs[i]
          // At B2 the only openings out of the commons are along its northern corridor wall.
          // East-wing furniture south of that wall is behind a continuous opaque partition.
          const visible = floor === 'B3' ? visibleBelowSlab(bounds, eye, openings) :
            bounds.min.x <= room.x1 + margin || bounds.min.z <= room.z0 + margin
          if (visible) { count = end; break }
        }
        mesh.count = count
        mesh.visible = originallyVisible && count > 0
      }
    },
  }
}
