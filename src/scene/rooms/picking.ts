import { Box3, Mesh, Vector3, type Raycaster, type Scene, type Intersection } from 'three'
import { useShelterStore } from '../../store/useShelterStore'
import type { RoomInstance } from '../../types/shelter'
import { equipmentSolids } from '../../geometry/equipment'
import { FLOORS } from '../../data/floors'
import type { FloorId } from '../../types/shelter'

const inventoryFor = (rooms: RoomInstance[]) => rooms.flatMap((room) =>
  room.equipment.map((unit) => {
    const [x, y, z] = unit.position,
      [w, h, d] = unit.moduleSizeM,
      base = FLOORS[room.floorId].elevation + y
    const solids = equipmentSolids(unit).map((s) => {
      const centre = new Vector3(...s.center)
      centre.y += FLOORS[room.floorId].elevation
      return new Box3().setFromCenterAndSize(centre, new Vector3(...s.size))
    })
    return {
      room,
      unit,
      solids,
      box: new Box3(new Vector3(x - w / 2, base, z - d / 2), new Vector3(x + w / 2, base + h, z + d / 2)),
    }
  }),
)
let inventory = inventoryFor(useShelterStore.getState().installedRooms)
export const taggedEquipment = new Map(inventory.map(entry => [entry.unit.tagCode, entry]))
useShelterStore.subscribe((s, p) => {
  if (s.installedRooms === p.installedRooms) return
  inventory = inventoryFor(s.installedRooms)
  taggedEquipment.clear()
  for (const entry of inventory) taggedEquipment.set(entry.unit.tagCode, entry)
})
export function visibleHit(
  scene: Scene,
  ray: Raycaster,
  inspect: boolean,
  accepts?: (hit: Intersection) => boolean,
): Intersection | undefined {
  const candidates = inspect
    ? new Set(inventory.filter((e) => ray.ray.intersectsBox(e.box)).map((e) => e.unit.tagCode))
    : null
  const meshes: Mesh[] = []
  scene.traverseVisible((o) => {
    if (
      !(o instanceof Mesh) ||
      Array.isArray(o.material) ||
      o.material.opacity <= 0.22 ||
      !(o.material.isMeshStandardMaterial || o.geometry.boundsTree)
    )
      return
    if (o.userData.equipmentTags && o.parent?.userData.fitout) {
      if (!candidates?.size || !o.userData.batchTags?.some((tag: string) => candidates.has(tag))) return
    } else if (
      o.material.userData?.staticVegetationOpacity ||
      ['leaf', 'fir', 'distantFir', 'foliage'].includes(o.userData.shape)
    )
      return
    meshes.push(o)
  })
  return ray.intersectObjects(meshes, false).find((hit) => {
    const material = (hit.object as Mesh).material
    return (
      !Array.isArray(material) &&
      !material.clippingPlanes?.some((p) => p.distanceToPoint(hit.point) < 0) &&
      (!accepts || accepts(hit))
    )
  })
}

export function aimedEquipment(floor: FloorId, point: Vector3) {
  // The walk ray terminates on an actual wall or installation solid in the collision BVH.
  return inventory.find(
    ({ room, solids }) => room.floorId === floor && solids.some((s) => s.distanceToPoint(point) < 0.004),
  )
}
