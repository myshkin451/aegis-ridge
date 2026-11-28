import { expect, it } from 'vitest'
import {
  BoxGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Ray,
  Vector3,
} from 'three'
import { FLOORS, UNDERGROUND } from '../src/data/floors'
import { roomsOn } from '../src/data/defaultBlueprint'
import { ElevatorBank, elevatorSpecs } from '../src/geometry/elevators'
import { footprint } from '../src/geometry/coords'
import { bedrooms } from '../src/geometry/residentialPlan'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'
import { closedDoors, roomStructure } from '../src/scene/utils/shellGeometry'
import { enclosure, structure, verticalCore } from '../src/scene/FloorSliceGroup'
import { adits } from '../src/data/siteFacilities'
import { doors, type WallAxis } from '../src/geometry/doors'
import { defaultBox, moveFace, rulerFraction } from '../src/geometry/viewGeometry'
import { stairRun } from '../src/geometry/stairs'
import { appendSolids, positionGeometry } from '../src/scene/utils/solidGeometry'
import { morphProjection } from '../src/scene/camera/projection'
import { WALK, WalkCollision } from '../src/scene/camera/walkCollision'
import type { Point3 } from '../src/types/shelter'
import { useShelterStore as store } from '../src/store/useShelterStore'

function world(boxes: { centre: Point3; size: Point3 }[]) {
  const group = new Group(),
    coords: number[] = []
  for (const box of boxes) {
    const m = new Mesh(new BoxGeometry(...box.size))
    m.position.set(...box.centre)
    group.add(m)
  }
  appendSolids(group, coords, () => true)
  group.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose()
      o.material.dispose()
    }
  })
  return new WalkCollision(positionGeometry(coords))
}
it('measures the 6 m buffer and 4.2 m storeys on one ruler and snaps all six box faces without inversions', () => {
  expect((rulerFraction(-6) - rulerFraction(0)) / (rulerFraction(-14.4) - rulerFraction(-10.2))).toBeCloseTo(
    6 / 4.2,
  )
  for (const [a, b] of [
    ['east', 'west'],
    ['north', 'south'],
    ['west', 'east'],
    ['south', 'north'],
    ['top', 'bottom'],
    ['bottom', 'top'],
  ] as const) {
    expect(Math.abs(moveFace(defaultBox, a, defaultBox[b])[a] - defaultBox[b])).toBeCloseTo(0.3)
  }
  expect(moveFace(defaultBox, 'top', -14.29).top).toBeCloseTo(-14.4)
  expect(moveFace(defaultBox, 'east', 8.18).east).toBe(8)
})
it('restores the study camera, floor and local section independently of previous studies', () => {
  store.setState(store.getInitialState())
  store.getState().photograph('shot-05')
  expect(store.getState()).toMatchObject({ floor: 'B3', cameraState: 'walkthrough', time: '21:30' })
  store.getState().setView('plan')
  store.getState().setCutHeight(140)
  expect(store.getState().cutHeight).toBeLessThan(FLOORS.B3.pitch)
  store.getState().photograph('shot-03')
  store.getState().photograph('shot-01')
  expect(store.getState()).toMatchObject({
    floor: 'ALL',
    cold: false,
    sectionPerspective: false,
    sectionZ: -3.75,
    cutHeight: 1.2,
    lastFloor: 'B2',
  })
})
it('slides beside a wall, stops at the edge of a slab and respects a pressure door until it opens', () => {
  const room = world([
    { centre: [0, -0.1, 0], size: [10, 0.2, 10] },
    { centre: [1, 1, 0], size: [0.1, 2, 8] },
  ])
  const p = new Vector3(0, 0, 0)
  room.move(p, 2, 1)
  expect(p.x).toBeLessThan(0.71)
  expect(p.z).toBeGreaterThan(0.9)
  room.move(p, 0, 8)
  expect(p.z).toBeLessThanOrEqual(5.001)
  const door = { ...doors[0], base: [0, 0, 0] as Point3, yaw: 0 },
    open = new Map([[door.id, 1]])
  p.set(0, 0, -1)
  room.move(p, 0, 2, [door])
  expect(p.z).toBeLessThan(-WALK.radius)
  room.move(p, 0, 2, [door], open)
  expect(p.z).toBeGreaterThan(1)
  room.dispose()
})
it.each(['personnel', 'escape'] as const)(
  'walks up and down the rendered %s tread sequence without jumping between flights',
  (kind) => {
    const run = stairRun(kind, 'B4')!,
      w = world(run.plates)
    const points = run.plates.map((p) => new Vector3(p.centre[0], p.centre[1] + p.size[1] / 2, p.centre[2]))
    const feet = points[0].clone()
    for (const waypoints of [points, points.slice().reverse()]) {
      for (const point of waypoints) {
        w.move(feet, point.x - feet.x, point.z - feet.z)
        expect(feet.distanceTo(point)).toBeLessThan(0.03)
      }
    }
    w.dispose()
  },
)
it('places both portal locks at the floor and bearing of the actual bore discharge', () => {
  for (const b of Object.values(adits)) {
    const d = doors.find((d) => d.id === b.id + '-portal')!,
      p = b.points.at(-1)!,
      a = b.points.at(-2)!
    expect(d.base).toEqual(p)
    expect(d.floor).toBe(b.floor)
    expect(d.yaw).toBeCloseTo(Math.atan2(p[0] - a[0], p[2] - a[2]))
  }
})

it('keeps metre scale on the focal plane and maps the near and far clip planes throughout the projection change', () => {
  const camera = new PerspectiveCamera(45, 1.6, 0.07, 16000),
    height = 38,
    aspect = 1.6,
    focus = 110
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    morphProjection(camera, height, aspect, focus, fraction)
    const p = new Vector3(4, 6, -focus).applyMatrix4(camera.projectionMatrix)
    expect(p.x).toBeCloseTo(8 / (height * aspect))
    expect(p.y).toBeCloseTo(12 / height)
    expect(new Vector3(0, 0, -camera.near).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(-1)
    expect(new Vector3(0, 0, -camera.far).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(1)
  }
})

it.each(UNDERGROUND)(
  '%s seals all room edges and places leaves only in surveyed passable openings',
  (floor) => {
    const partitions = new ModelBuilder()
    roomStructure(partitions, floor)
    const walls = partitions.build(),
      vertices: number[] = [],
      leaves: number[] = []
    for (const model of [walls, enclosure(floor, 'front').build(), enclosure(floor, 'rear').build()]) {
      appendSolids(model.object, vertices, () => true)
      model.dispose()
    }
    const panels = closedDoors(floor).build()
    appendSolids(panels.object, leaves, () => true)
    panels.dispose()

    const masonry = new WalkCollision(positionGeometry(vertices))
    const shutters = new WalkCollision(positionGeometry(leaves))
    const ray = new Ray()
    function cross(axis: WallAxis, fixed: number, along: number, y: number, world: WalkCollision) {
      if (axis === 'x') {
        ray.origin.set(along, y, fixed - 0.32)
        ray.direction.set(0, 0, 1)
      } else {
        ray.origin.set(fixed - 0.32, y, along)
        ray.direction.set(1, 0, 0)
      }
      return !!world.tree.raycastFirst(ray, DoubleSide, 0, 0.64)
    }
    try {
      const outlines = [
        ...roomsOn(floor).map((r) => footprint(r.bounds)),
        ...(floor === 'B2' ? bedrooms : []),
      ]
      for (const r of outlines) {
        function wall(axis: WallAxis, fixed: number, start: number, end: number) {
          for (let p = start + 0.06; p < end; p += 0.12) {
            const label = floor + ' / ' + axis + ' / ' + fixed + ' / ' + p.toFixed(2)
            expect(cross(axis, fixed, p, 1.4, masonry) || cross(axis, fixed, p, 1.4, shutters), label).toBe(
              true,
            )
            expect(cross(axis, fixed, p, 3.78, masonry), label + ' plenum').toBe(true)
          }
        }
        wall('x', r.z0, r.x0, r.x1)
        wall('x', r.z1, r.x0, r.x1)
        wall('z', r.x0, r.z0, r.z1)
        wall('z', r.x1, r.z0, r.z1)
      }
      for (const d of doors.filter((d) => d.floor === floor)) {
        if (d.axis === 'bearing') continue
        const along = d.axis === 'x' ? d.base[0] : d.base[2],
          fixed = d.axis === 'x' ? d.base[2] : d.base[0]
        for (const offset of [-0.33, -0.01, 0.01, 0.33]) {
          const u = along + d.width * offset
          expect(cross(d.axis, fixed, u, 1.4, masonry), d.id + ' aperture').toBe(false)
          expect(cross(d.axis, fixed, u, 1.4, shutters), d.id + ' panel').toBe(true)
        }
      }
    } finally {
      masonry.dispose()
      shutters.dispose()
    }
  },
)

it('glazes exactly the declared public and growing rooms in the actual wall meshes', () => {
  const installed = new Set<string>()
  for (const id of UNDERGROUND) {
    const builder = new ModelBuilder()
    roomStructure(builder, id)
    const model = builder.build()
    try {
      for (const mesh of model.object.children) {
        if (!(mesh instanceof InstancedMesh) || mesh.userData.finish !== 'glass') continue
        for (let i = 0; i < mesh.count; i++) {
          const matrix = new Matrix4()
          mesh.getMatrixAt(i, matrix)
          const centre = new Vector3().setFromMatrixPosition(matrix)
          const owner = roomsOn(id).find((room) => {
            const r = footprint(room.bounds)
            return (
              centre.x > r.x0 &&
              centre.x < r.x1 &&
              (Math.abs(centre.z - r.z0) < 1e-4 || Math.abs(centre.z - r.z1) < 1e-4)
            )
          })
          expect(owner?.corridorGlazing, id + ' / ' + centre.toArray()).toBe(true)
          installed.add(owner!.id)
        }
      }
    } finally {
      model.dispose()
    }
  }
  expect([...installed].sort()).toEqual(['b2_commons', 'b3_aquaponics', 'b3_hydroponics'])
})

it('retains exactly the three scheduled inter-room doors on the working floors', () => {
  expect(new Set(doors.map((d) => d.id)).size).toBe(doors.length)
  const roomIds = new Set(UNDERGROUND.flatMap((id) => roomsOn(id).map((r) => r.id)))
  const connecting = doors.filter((d) => d.zones.every((zone) => roomIds.has(zone)))
  expect(connecting.map((d) => [d.kind, ...d.zones])).toEqual([
    ['fire', 'b1_workshop', 'b1_warehouse'],
    ['sliding', 'b3_hydroponics', 'b3_aquaponics'],
    ['fire', 'b4_drainage', 'b4_geothermal'],
  ])
})

it('calls the single car from either loading face and crosses both B1 and B4 on flush thresholds', () => {
  const vertices: number[] = []
  for (const id of ['B1', 'B4'] as const) {
    for (const builder of [structure(id), verticalCore(id)]) {
      const model = builder.build()
      model.object.position.y = FLOORS[id].elevation
      appendSolids(model.object, vertices, () => true)
      model.dispose()
    }
  }
  const bank = new ElevatorBank(), car = bank.cars.freight, carDeck = elevatorSpecs.freight
  const world = new WalkCollision(positionGeometry(vertices), bank)
  const tree = world.tree
  try {
    expect(car.stop).toBe('B4')
    for (const stop of ['B1', 'B4'] as const) {
      const y = FLOORS[stop].elevation
      const oldStop = car.stop
      const rear = doors.find((d) => d.id === stop + '-freight-rear')!
      const front = doors.find((d) => d.id === stop + '-freight-front')!
      const sign = stop === 'B1' ? -1 : 1
      const [arrival, opposite] = stop === 'B1' ? [front, rear] : [rear, front]
      const x = arrival.base[0],
        start = arrival.base[2] - sign * 0.7,
        end = opposite.base[2] + sign * 0.7
      const feet = new Vector3(x, y, start)
      expect(front.base[0]).toBe(rear.base[0])
      expect(bank.landingOpening(arrival)).toBe(0)
      expect(world.floor(x, y, carDeck.z)).toBeUndefined()
      bank.callFrom(x, y, start)
      expect(car.stop).toBe(oldStop)
      for (let i = 0; i < 1800 && car.phase !== 'open'; i++) bank.tick(1 / 60)
      expect(car.stop).toBe(stop)
      expect(world.floor(x, FLOORS[oldStop].elevation, carDeck.z)).toBeUndefined()
      expect(world.tree).toBe(tree)
      const available = doors.filter((d) => d.zones.includes('freight') && bank.landingOpening(d) === 1)
      expect(available.map((d) => d.id)).toEqual([front.id, rear.id])
      const through = new Map(available.map((d) => [d.id, 1]))
      for (let z = start; sign * (end - z) > 0; z += sign * 0.05) {
        const support = world.floor(x, y, z)
        expect(support).toBeDefined()
        expect(Math.abs(support! - y), 'loading axis z=' + z).toBeLessThan(0.025)
        world.move(feet, 0, z - feet.z, doors, through)
        expect(feet.z).toBeCloseTo(z, 3)
      }
      expect(world.stands(x, y, carDeck.z)).toBe(true)
      expect(world.stands(x + carDeck.width / 2 - 0.09, y, carDeck.z)).toBe(false)
    }
  } finally {
    world.dispose()
  }
})

it('slides along a closed leaf and admits a slightly off-centre shoulder through an open jamb', () => {
  const door = { ...doors[0], base: [0, 0, 0] as Point3, yaw: 0, width: 1.02, trackOffset: 0 }
  const worldWithJambs = world([
    { centre: [0, -0.1, 0], size: [5, 0.2, 5] },
    { centre: [-0.61, 1.3, 0], size: [0.2, 2.6, 0.14] },
    { centre: [0.61, 1.3, 0], size: [0.2, 2.6, 0.14] },
  ])
  try {
    const feet = new Vector3(-0.2, 0, -0.31)
    worldWithJambs.move(feet, 0.45, 0.65, [door])
    expect(feet.z).toBeLessThan(-0.25)
    expect(feet.x).toBeCloseTo(0.25)
    feet.set(0.28, 0, -0.8)
    worldWithJambs.move(feet, 0, 1.6, [door], new Map([[door.id, 1]]))
    expect(feet.z).toBeCloseTo(0.8)
    expect(feet.x).toBeCloseTo(0.28)
  } finally {
    worldWithJambs.dispose()
  }
})
