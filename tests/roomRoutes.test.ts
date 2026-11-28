import { crew } from '../src/data/crew'
import { inspectionPath } from '../src/scene/camera/inspectionRoute'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { FLOORS, UNDERGROUND } from '../src/data/floors'
import { roomsOn } from '../src/data/defaultBlueprint'
import { adits, eastTransfer } from '../src/data/siteFacilities'
import { equipmentSolids } from '../src/geometry/equipment'
import { footprint, shaftPlans } from '../src/geometry/coords'
import { doors, roomDoor } from '../src/geometry/doors'
import {
  bedrooms,
  eastLinkDoorX,
  escapeLobby,
  laundry,
  publicBath,
  quietHall,
  westVestibule,
} from '../src/geometry/residentialPlan'
import { routeKey, routeToWalkPosition, surveyRoomRoutes } from '../src/scene/camera/roomRoutes'
import { WalkCollision, WALK } from '../src/scene/camera/walkCollision'
import { enclosure, structure, verticalCore } from '../src/scene/FloorSliceGroup'
import { eastBore } from '../src/scene/terrain/SiteFacilities'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'
import { appendSolids, positionGeometry } from '../src/scene/utils/solidGeometry'

function undergroundWorld() {
  const vertices: number[] = []
  function append(builder: ModelBuilder, elevation = 0) {
    const model = builder.build()
    model.object.position.y = elevation
    appendSolids(model.object, vertices, (mesh) => mesh.userData.finish !== 'lamp')
    model.dispose()
  }
  for (const id of UNDERGROUND) {
    for (const builder of [structure(id), verticalCore(id), enclosure(id, 'rear'), enclosure(id, 'front')])
      append(builder, FLOORS[id].elevation)
    const equipment = new ModelBuilder()
    for (const room of roomsOn(id))
      for (const unit of room.equipment)
        for (const solid of equipmentSolids(unit)) equipment.box('#999999', solid.center, solid.size)
    append(equipment, FLOORS[id].elevation)
  }
  append(eastBore())
  return new WalkCollision(positionGeometry(vertices))
}

let world: WalkCollision
let routes: Map<string, Vector3[]>
beforeAll(() => {
  world = undergroundWorld()
  routes = surveyRoomRoutes(world)
}, 20000)
afterAll(() => world?.dispose())

function sample(path: Vector3[], visit: (pos: Vector3) => void) {
  visit(path[0])
  const p = new Vector3()
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i]
    const steps = Math.ceil(a.distanceTo(b) / 0.06)
    for (let k = 1; k <= steps; k++) visit(p.lerpVectors(a, b, k / steps))
  }
}

type Bounds = Pick<ReturnType<typeof footprint>, 'x0' | 'x1' | 'z0' | 'z1'>
const indoors = (r: Bounds, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1
it.each(UNDERGROUND)(
  '%s reaches every camera from the main corridor without crossing another room or shaft',
  (id) => {
    const y = FLOORS[id].elevation,
      freight = shaftPlans.find((s) => s.id === 'freight')!
    for (const room of roomsOn(id)) {
      for (const anchor of room.cameraAnchors) {
        const [x, height, z] = anchor.position,
          eye = new Vector3(x, y + height, z)
        const toLaundry = room.id === 'b2_bath_laundry' && indoors(laundry, x, z)
        const forbidden = [
          ...roomsOn(id)
            .filter((r) => r !== room && !(toLaundry && r.id === 'b2_quarters'))
            .map((r) => ({ id: r.id, ...footprint(r.bounds) })),
          ...shaftPlans,
        ]
        const label = room.id + ' / ' + anchor.name
        // The guided arrival and the manual walker's return use different reconnection/simplification paths.
        for (const path of [routes.get(id + routeKey(x, z)), routeToWalkPosition(world, id, eye)]) {
          expect.soft(path, label).toBeDefined()
          if (!path) continue
          expect(path[0].distanceTo(new Vector3(freight.x, y + WALK.eye, -1)), label).toBeLessThan(0.001)
          expect(path.at(-1)!.distanceTo(eye), label).toBeLessThan(0.001)
          sample(path, (p) => {
            const where = label + ' at ' + p.x.toFixed(2) + ', ' + p.z.toFixed(2)
            expect(world.stands(p.x, y, p.z), where).toBe(true)
            expect(forbidden.find((r) => indoors(r, p.x, p.z))?.id, where).toBeUndefined()
            if (id === 'B2') {
              const otherBedroom = bedrooms.find((b) => !indoors(b, x, z) && indoors(b, p.x, p.z))
              expect(otherBedroom?.id, where).toBeUndefined()
            }
            if (toLaundry) {
              // Only the shared vestibule and the first two metres of its connecting hall serve this door.
              if (p.z > 0 && p.x > laundry.x1)
                expect(p.x <= westVestibule.x1 && p.z <= quietHall.z1, where).toBe(true)
              expect(indoors(publicBath, p.x, p.z), where + ' via public WC').toBe(false)
            }
          })
          walkPath(
            path.map((p) => new Vector3(p.x, y, p.z)),
            allOpen,
            label,
          )
        }
      }
    }
  },
)

// Exercise the same incremental capsule movement and leaf opening fractions as a manual visitor.
const allOpen = new Map(doors.map((d) => [d.id, 1]))
function walkPath(path: Vector3[], opening: ReadonlyMap<string, number>, label: string) {
  const feet = path[0].clone()
  for (const target of path.slice(1)) {
    world.move(feet, target.x - feet.x, target.z - feet.z, doors, opening)
    expect(Math.hypot(feet.x - target.x, feet.z - target.z), label + ' to ' + target.toArray()).toBeLessThan(
      0.035,
    )
    expect(Math.abs(feet.y - target.y), label + ' floor support').toBeLessThan(WALK.step)
  }
}

it.each(UNDERGROUND)(
  '%s crosses each room’s actual entrance when open and stops at the shut leaves',
  (floor) => {
    for (const room of roomsOn(floor)) {
      const door = roomDoor(room)
      const normal = new Vector3(Math.sin(door.yaw), 0, Math.cos(door.yaw))
      const centre = new Vector3(...door.base).addScaledVector(normal, door.trackOffset ?? 0)
      const a = centre.clone().addScaledVector(normal, -0.57)
      const b = centre.clone().addScaledVector(normal, 0.57)
      for (const p of [a, b])
        expect(world.stands(p.x, p.y, p.z), room.id + ' jamb approach ' + p.toArray()).toBe(true)
      walkPath([a, b], allOpen, room.id)
      const closed = new Map(allOpen)
      closed.set(door.id, 0)
      const stopped = world.move(a.clone(), b.x - a.x, b.z - a.z, doors, closed)
      expect(stopped.clone().sub(centre).dot(normal), room.id + ' closed').toBeLessThan(0)
    }
  },
)

const b2Y = FLOORS.B2.elevation
const b2 = (x: number, z: number) => new Vector3(x, b2Y, z)
const tunnel = adits.east.points[0]
function safeEgress(path: Vector3[], label: string, closed?: string) {
  const opening = new Map(allOpen)
  if (closed) opening.set(closed, 0)
  sample(path, (p) => {
    expect(world.stands(p.x, p.y, p.z), label + ' at ' + p.toArray()).toBe(true)
    expect(bedrooms.find((r) => indoors(r, p.x, p.z))?.id, label).toBeUndefined()
  })
  walkPath(path, opening, label)
}

it('takes the B2 stair landing to the main corridor and through the fire lobby into the east passage', () => {
  const path = eastTransfer.map((p) => new Vector3(...p))
  const [landing, corridor, lobby] = path
  expect(landing.x).toBeGreaterThan(12)
  expect(landing.x).toBeLessThan(12.92)
  expect(corridor.x).toBeCloseTo(11.3)
  expect(corridor.z).toBeLessThan(0)
  expect(lobby.x).toBe(corridor.x)
  expect(indoors(escapeLobby, lobby.x, lobby.z)).toBe(true)
  expect(path.at(-1)!.toArray()).toEqual(tunnel)
  safeEgress([...path, b2(tunnel[0] + 1, tunnel[2])], 'stair to east passage')
})

it('allows independent west and east escape from the quiet hall with the opposite exit shut', () => {
  const midHall = b2((quietHall.x0 + quietHall.x1) / 2, (quietHall.z0 + quietHall.z1) / 2)
  const westX = (westVestibule.x0 + westVestibule.x1) / 2
  const westDoor = doors.find((d) => d.id === 'hall-west')!
  const eastDoor = doors.find((d) => d.id === 'hall-east')!
  expect(westDoor?.kind).toBe('acoustic')
  expect(eastDoor?.kind).toBe('fire')
  safeEgress([midHall, b2(westX, midHall.z), b2(westX, -1)], 'west exit', eastDoor.id)
  safeEgress(
    [midHall, b2(eastLinkDoorX, midHall.z), b2(eastLinkDoorX, tunnel[2]), b2(tunnel[0] + 1, tunnel[2])],
    'east exit',
    westDoor.id,
  )
})

it('reaches the reserve dorm directly from the vestibule and the separate laundry entrance from the quiet hall', () => {
  const start = b2(-1, -1)
  const reserveEntry = doors.find((d) => d.id === 'b2-reserve')!
  const threshold = new Vector3(...reserveEntry.base)
  const dormPath = [start, b2(start.x, threshold.z), b2(threshold.x + 0.6, threshold.z)]
  sample(dormPath, (p) => {
    expect(indoors(quietHall, p.x, p.z)).toBe(false)
    expect(bedrooms.some((r) => !r.onCall && indoors(r, p.x, p.z))).toBe(false)
  })
  walkPath(dormPath, allOpen, 'reserve dorm')
  const laundryDoor = doors.find((d) => d.id === 'laundry-access')!
  const laundryPath = [
    start,
    b2(start.x, laundryDoor.base[2]),
    b2(laundryDoor.base[0] - 0.6, laundryDoor.base[2]),
  ]
  safeEgress(laundryPath, 'quiet hall to laundry', 'b2_bath_laundry')
})

it('guides the private laundry camera through the west vestibule and the laundry doorway in order', () => {
  const suite = roomsOn('B2').find((r) => r.id === 'b2_bath_laundry')!
  const camera = suite.cameraAnchors.find(({ position: [x, , z] }) => indoors(laundry, x, z))
  expect(camera, 'laundry inspection anchor').toBeDefined()
  const [x, height, z] = camera!.position
  const compartments = [
    ['vestibule', westVestibule],
    ['hall', quietHall],
    ['laundry', laundry],
    ['public WC', publicBath],
    ['east lobby', escapeLobby],
  ] as const
  const eye = new Vector3(x, b2Y + height, z)
  for (const path of [routes.get('B2' + routeKey(x, z)), routeToWalkPosition(world, 'B2', eye)]) {
    expect(path).toBeDefined()
    const zones: string[] = []
    sample(path!, (p) => {
      const occupied = compartments.find(([, r]) => indoors(r, p.x, p.z))?.[0]
      if (occupied && occupied !== zones.at(-1)) zones.push(occupied)
    })
    expect(zones).toEqual(['vestibule', 'hall', 'laundry'])
  }
})

it.each(crew)('walks every stop on $name’s morning route through the actual room and stair openings', member => {
  const opened = new Map(doors.map(d => [d.id, 1]))
  let feet: Vector3 | undefined
  for (const [i, stop] of member.route.entries()) {
    const path = inspectionPath(routes, member.route[i - 1], stop)
    expect(path, member.name + ' / ' + stop.roomId).toBeDefined()
    if (!path) continue
    feet ??= path[0].clone()
    // Follow the same 1.4 m/s walk, approach damping and corner tolerance as the live guide.
    const dt = 1 / 30, blend = 1 - Math.exp(-dt / 0.095)
    let vx = 0, vz = 0
    for (const p of path) {
      const distance = feet.distanceTo(p)
      const frames = Math.ceil((distance / WALK.walk + 3) / dt)
      for (let n = 0; n < frames && feet.distanceTo(p) >= 0.13; n++) {
        const x = p.x - feet.x, z = p.z - feet.z, d = Math.hypot(x, z)
        const speed = d < 0.065 ? 0 : Math.min(WALK.walk, d * 4)
        vx += ((x / (d || 1)) * speed - vx) * blend
        vz += ((z / (d || 1)) * speed - vz) * blend
        world.move(feet, vx * dt, vz * dt, doors, opened)
      }
      expect(feet.distanceTo(p), member.name + ' / ' + stop.roomId + ' at ' + p.toArray()).toBeLessThan(0.13)
    }
  }
})
