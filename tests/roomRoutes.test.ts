import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { FLOORS, FLOOR_ORDER, UNDERGROUND } from '../src/data/floors'
import { roomsOn } from '../src/data/defaultBlueprint'
import { equipmentSolids } from '../src/geometry/equipment'
import { shaftPlans } from '../src/geometry/coords'
import { surveyRoomRoutes, routeKey } from '../src/scene/camera/roomRoutes'
import { WalkCollision, WALK } from '../src/scene/camera/walkCollision'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'
import { addSlab, roomStructure, shaftFrames, stairStructure } from '../src/scene/utils/shellGeometry'
import { appendSolids, positionGeometry } from '../src/scene/utils/solidGeometry'

function undergroundWorld() {
  const vertices: number[] = []
  for (const id of UNDERGROUND) {
    const floor = FLOORS[id],
      m = new ModelBuilder()
    addSlab(m, id)
    roomStructure(m, id)
    shaftFrames(m, 0, floor.pitch, FLOOR_ORDER[FLOOR_ORDER.indexOf(id) - 1])
    stairStructure(m, id, 0, -Infinity, floor.pitch)
    for (const room of roomsOn(id))
      for (const unit of room.equipment)
        for (const solid of equipmentSolids(unit)) m.box('#999999', solid.center, solid.size, 'steel')
    const model = m.build()
    model.object.position.y = floor.elevation
    appendSolids(model.object, vertices, (mesh) => mesh.userData.finish !== 'lamp')
    model.dispose()
  }
  return new WalkCollision(positionGeometry(vertices))
}

it('finds a supported capsule route from the freight landing to every underground camera anchor', () => {
  const world = undergroundWorld()
  try {
    const routes = surveyRoomRoutes(world),
      freight = shaftPlans.find((s) => s.id === 'freight')!
    for (const id of UNDERGROUND) {
      const y = FLOORS[id].elevation
      for (const room of roomsOn(id))
        for (const anchor of room.cameraAnchors) {
          const [x, height, z] = anchor.position
          const label = room.id + ' / ' + anchor.name
          const path = routes.get(id + routeKey(x, z))
          expect.soft(path, label).toBeDefined()
          if (!path) continue
          expect(path[0].distanceTo(new Vector3(freight.x, y + WALK.eye, -1)), label).toBeLessThan(0.001)
          expect(path.at(-1)!.distanceTo(new Vector3(x, y + height, z)), label).toBeLessThan(0.001)
          const feet = new Vector3(x, y, z)
          expect(world.landing(feet), label).toBe(true)
          expect(feet.distanceTo(new Vector3(x, y, z)), label).toBeLessThan(0.001)
          for (let i = 1; i < path.length; i++) {
            const a = path[i - 1],
              b = path[i]
            const steps = Math.ceil(a.distanceTo(b) / 0.06)
            for (let k = 1; k <= steps; k++) {
              const t = k / steps
              const px = a.x + t * (b.x - a.x),
                pz = a.z + t * (b.z - a.z)
              expect(world.stands(px, y, pz), label + ' at ' + px.toFixed(2) + ', ' + pz.toFixed(2)).toBe(
                true,
              )
            }
          }
        }
    }
  } finally {
    world.dispose()
  }
}, 20000)
