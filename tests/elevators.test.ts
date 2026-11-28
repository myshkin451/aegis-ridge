import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { FLOORS, FLOOR_ORDER, UNDERGROUND } from '../src/data/floors'
import { roomsOn } from '../src/data/defaultBlueprint'
import { doors } from '../src/geometry/doors'
import { equipmentSolids } from '../src/geometry/equipment'
import { ElevatorBank, elevatorIds, elevatorLandings, elevatorSpecs, type ElevatorCar } from '../src/geometry/elevators'
import { surfaceEnvelopeModels } from '../src/scene/SurfaceStation'
import { structure, verticalCore } from '../src/scene/FloorSliceGroup'
import { WalkCollision } from '../src/scene/camera/walkCollision'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'
import { appendSolids, positionGeometry } from '../src/scene/utils/solidGeometry'

function waitAtLanding(car: ElevatorCar) {
  for (let frame = 0; frame < 2000 && car.phase !== 'open'; frame++) car.tick(1 / 60)
  expect(car.phase).toBe('open')
}

describe.each(elevatorIds)('%s elevator', id => {
  it('serves each pair of stops with interlocked doors and continuous, speed-limited travel', () => {
    const bank = new ElevatorBank(), car = bank.cars[id]
    const stops = id === 'passenger' ? FLOOR_ORDER : FLOOR_ORDER.slice(1)
    expect(car.spec.stops).toEqual(stops)
    for (const from of stops) {
      for (const to of stops.filter(f => f !== from)) {
        car.request(from)
        waitAtLanding(car)
        expect(car.request(to)).toBe(true)
        expect(car.phase).toBe('closing')
        const departureDoor = doors.find(d => d.floor === from && d.zones.includes(id))!
        const arrivalDoor = doors.find(d => d.floor === to && d.zones.includes(id))!
        for (let frame = 0; frame < 2000; frame++) {
          const y = car.elevation
          car.tick(1 / 60)
          expect(Math.abs(car.elevation - y)).toBeLessThanOrEqual(car.spec.speed / 60 + 1e-12)
          if (car.phase === 'moving') {
            expect(car.opening).toBe(0)
            expect(bank.landingOpening(departureDoor)).toBe(0)
            expect(bank.landingOpening(arrivalDoor)).toBe(0)
            expect(car.request(from)).toBe(false)
            expect(car.stop).toBe(from)
          }
          if (car.phase === 'open') break
        }
        expect(car.stop).toBe(to)
        expect(car.elevation).toBe(FLOORS[to].elevation)
        expect(bank.landingOpening(arrivalDoor)).toBe(1)
        expect(bank.landingOpening(departureDoor)).toBe(0)
      }
    }
  })
})

it('rejects a freight trip to L2 and never summons a car from the other side of a shaft wall', () => {
  const bank = new ElevatorBank(), car = bank.cars.freight
  expect(car.request('L2')).toBe(false)
  bank.callFrom(car.spec.x + 1.3, 0, car.spec.front + 1)
  bank.callFrom(car.spec.x, 0, car.spec.front - 0.5)
  expect(car.phase).toBe('closed')
  bank.callFrom(car.spec.x, 0, car.spec.front + 0.8)
  expect(car.target).toBe('L1')
  expect(bank.cars.passenger.phase).toBe('closed')
  expect(bank.riderAt(car.spec.x, FLOORS.B4.elevation, car.spec.front + 0.5)).toBeNull()
})

it('admits and releases the walk capsule at every landing through the installed shell and equipment', () => {
  const surface = surfaceEnvelopeModels(), vertices: number[] = []
  const bank = new ElevatorBank()
  const append = (m: ModelBuilder, y: number) => {
    const built = m.build()
    built.object.position.y = y
    appendSolids(built.object, vertices, () => true)
    built.dispose()
  }
  for (const floor of FLOOR_ORDER) {
    const underground = UNDERGROUND.find(f => f === floor)
    const models = underground ? [structure(underground), verticalCore(underground)] : floor === 'L1' ? surface.l1 : surface.l2
    for (const m of models) append(m, FLOORS[floor].elevation)
    const fittings = new ModelBuilder()
    for (const room of roomsOn(floor))
      for (const unit of room.equipment)
        for (const {center, size} of equipmentSolids(unit)) fittings.box('#888', center, size)
    append(fittings, FLOORS[floor].elevation)
  }
  const world = new WalkCollision(positionGeometry(vertices), bank)
  try {
    for (const landing of elevatorLandings) {
      const { id, floor, x, z, face } = landing, y = FLOORS[floor].elevation
      const car = bank.cars[id], spec = elevatorSpecs[id], direction = face === 'front' ? 1 : -1
      const feet = new Vector3(x, y, z + direction * 0.7)
      bank.callFrom(feet.x, feet.y, feet.z)
      waitAtLanding(car)
      expect(car.stop).toBe(floor)
      const openings = new Map(doors.map(d => [d.id, bank.landingOpening(d) ?? 0]))
      for (const destination of [spec.z, z + direction * 0.7]) {
        world.move(feet, 0, destination - feet.z, doors, openings)
        expect(feet.z, floor + ' ' + id + ' ' + face).toBeCloseTo(destination, 3)
        expect(Math.abs(feet.y - y)).toBeLessThan(0.025) // include finish buildup at the landing
        expect(bank.riderAt(feet.x, feet.y, feet.z)).toBe(destination === spec.z ? id : null)
      }
    }
  } finally { world.dispose() }
})
