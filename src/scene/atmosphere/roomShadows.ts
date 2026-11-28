import { DirectionalLight, Mesh, Object3D, Scene, SpotLight, type WebGLRenderer } from 'three'
import { useShelterStore } from '../../store/useShelterStore'
import { UNDERGROUND } from '../../data/floors'

/** Three r180 tests shadow casters against the viewer's layers. Bound the indoor pass
 * explicitly so nearby terrain, CSM casters and other floors never enter its depth map. */
export function shadowPasses(scene: Scene) {
  const candidates: { mesh: Mesh; floor: string; restore: boolean }[] = []
  const csm: DirectionalLight[] = []
  const spots: SpotLight[] = []
  let inventory = useShelterStore.getState().installedRooms
  function collect() {
    candidates.length = csm.length = spots.length = 0
    scene.traverse((object) => {
      if (object instanceof SpotLight && object.castShadow) spots.push(object)
      if (object instanceof DirectionalLight && object.castShadow) csm.push(object)
      if (!(object instanceof Mesh)) return
      let floor = ''
      for (let parent: Object3D | null = object; parent; parent = parent.parent)
        if (UNDERGROUND.some((id) => id === parent?.name)) {
          floor = parent.name
          break
        }
      candidates.push({ mesh: object, floor, restore: object.castShadow })
    })
  }
  collect()
  let interiorUpdates = 0,
    cascadeUpdates = 0
  return function render(gl: WebGLRenderer, floor: string, draw: () => void) {
    const installed = useShelterStore.getState().installedRooms
    if (inventory !== installed) { inventory = installed; collect() }
    const local = gl.shadowMap.needsUpdate && spots.some((spot) => spot.shadow.needsUpdate)
    const cascades = gl.shadowMap.needsUpdate && csm.some((l) => l.shadow.needsUpdate)
    if (local)
      for (const entry of candidates) {
        const mesh = entry.mesh
        entry.restore = mesh.castShadow
        mesh.castShadow =
          mesh.userData.localDoorShadow ||
          (entry.floor === floor && (entry.restore || mesh.userData.localFurnitureShadow)) ||
          false
      }
    try {
      draw()
    } finally {
      if (local) {
        for (const { mesh, restore } of candidates) mesh.castShadow = restore
        if (spots.every((spot) => !spot.shadow.needsUpdate)) interiorUpdates++
      }
    }
    if (cascades && csm.every((l) => !l.shadow.needsUpdate)) cascadeUpdates++
    const d = gl.domElement.dataset
    if (d.interiorShadowUpdates !== String(interiorUpdates)) d.interiorShadowUpdates = String(interiorUpdates)
    if (d.csmShadowUpdates !== String(cascadeUpdates)) d.csmShadowUpdates = String(cascadeUpdates)
  }
}
