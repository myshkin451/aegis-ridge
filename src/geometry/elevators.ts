import { FLOORS, FLOOR_ORDER } from '../data/floors'
import type { FloorId } from '../types/shelter'
import { shaftPlans } from './coords'
import type { Doorway } from './doors'

export type ElevatorId = 'passenger' | 'freight'
export type ElevatorPhase = 'closed' | 'opening' | 'open' | 'closing' | 'moving'
export const elevatorIds: readonly ElevatorId[] = ['passenger', 'freight']
const passenger = shaftPlans.find(s => s.id === 'personnel')!
const freight = shaftPlans.find(s => s.id === 'freight')!
export const elevatorSpecs = {
  passenger: {
    x: passenger.x1 - 0.84, z: passenger.z, width: 1.48, depth: 2, height: 2.36,
    front: passenger.z1, rear: passenger.z0, doorWidth: 1.02, cabinOpening: 1.02, rearStops: [] as FloorId[],
    stops: FLOOR_ORDER, initial: 'B2' as FloorId, speed: 2.8,
  },
  freight: {
    x: freight.x, z: freight.z, width: 1.8, depth: 1.8, height: 2.55,
    front: freight.z1, rear: freight.z0, doorWidth: 1.98, cabinOpening: 1.32, rearStops: ['B1', 'B4'] as FloorId[],
    stops: FLOOR_ORDER.filter((id): boolean => id !== 'L2'), initial: 'B4' as FloorId, speed: 2.1,
  },
}
export const cabinWall = 0.06
const doorSeconds = 0.72
export const elevatorLandings = elevatorIds.flatMap(id => {
  const spec = elevatorSpecs[id]
  return spec.stops.flatMap(floor => {
    const faces = spec.rearStops.includes(floor) ? ['front', 'rear'] as const : ['front'] as const
    return faces.map(face => ({
      id, floor, face, x: spec.x, z: spec[face],
      width: spec.doorWidth, height: id === 'passenger' ? 2.4 : 2.6,
    }))
  })
})

// Four rigid leaves on parallel tracks on each side telescope into the jamb pockets.
export const cabinPanelCount = 4
export function cabinPanel(id: ElevatorId, side: number, index: number, opening: number) {
  const { cabinOpening } = elevatorSpecs[id]
  const width = cabinOpening / (2 * cabinPanelCount)
  return {
    x: side * width * (0.5 + index + (cabinPanelCount - index) * opening),
    width,
  }
}

export class ElevatorCar {
  readonly spec: typeof elevatorSpecs[ElevatorId]
  stop: FloorId
  target: FloorId
  phase: ElevatorPhase = 'closed'
  opening = 0
  elevation: number
  private travelElapsed = 0
  private travelSeconds = 0

  constructor(readonly id: ElevatorId) {
    this.spec = elevatorSpecs[id]
    this.stop = this.target = this.spec.initial
    this.elevation = FLOORS[this.stop].elevation
  }

  restoreParked(floor: FloorId) {
    if (!this.spec.stops.includes(floor)) return
    this.stop = this.target = floor
    this.elevation = FLOORS[floor].elevation
    this.phase = 'open'
    this.opening = 1
  }

  request(floor: FloorId) {
    if (!this.spec.stops.includes(floor) || this.phase === 'moving' || this.phase === 'closing') return false
    if (floor === this.stop) {
      if (this.phase === 'closed') this.phase = 'opening'
      return true
    }
    this.target = floor
    this.phase = 'closing'
    return true
  }

  /** Landing position and door state stay latched until the next call or onboard selection. */
  tick(dt: number) {
    if (dt <= 0) return
    if (this.phase === 'closing') {
      this.opening = Math.max(0, this.opening - dt / doorSeconds)
      if (this.opening === 0) {
        this.travelElapsed = 0
        const distance = Math.abs(FLOORS[this.target].elevation - this.elevation)
        // A symmetric acceleration/deceleration ramp at each end, with a constant-speed middle.
        this.travelSeconds = distance / this.spec.speed + 0.75
        this.phase = 'moving'
      }
    } else if (this.phase === 'moving') {
      this.travelElapsed = Math.min(this.travelElapsed + dt, this.travelSeconds)
      const t = this.travelElapsed, duration = this.travelSeconds, ramp = 0.75
      const metresAtCruiseSpeed = t < ramp ? t * t / (2 * ramp)
        : t > duration - ramp ? duration - ramp - (duration - t) ** 2 / (2 * ramp)
        : t - ramp / 2
      const from = FLOORS[this.stop].elevation, to = FLOORS[this.target].elevation
      this.elevation = from + (to - from) * metresAtCruiseSpeed / (duration - ramp)
      if (t === duration) {
        this.stop = this.target
        this.elevation = to
        this.phase = 'opening'
      }
    } else if (this.phase === 'opening') {
      this.opening = Math.min(1, this.opening + dt / doorSeconds)
      if (this.opening === 1) this.phase = 'open'
    }
  }

  deckAt(x: number, z: number, margin = 0) {
    const s = this.spec
    return Math.abs(x - s.x) <= s.width / 2 - margin + 1e-6 && Math.abs(z - s.z) <= s.depth / 2 - margin + 1e-6
  }

  hitsSide(x: number, y: number, z: number, radius: number, height: number) {
    if (y >= this.elevation + this.spec.height || y + height <= this.elevation) return false
    const s = this.spec
    const hits = (cx: number, cz: number, width: number, depth: number) => {
      const dx = Math.max(0, Math.abs(x - cx) - width / 2)
      const dz = Math.max(0, Math.abs(z - cz) - depth / 2)
      return dx * dx + dz * dz < radius * radius
    }
    for (const side of [-1, 1]) {
      if (hits(s.x + side * (s.width - cabinWall) / 2, s.z, cabinWall, s.depth)) return true
    }
    for (const face of [-1, 1]) {
      const cz = s.z + face * (s.depth - cabinWall) / 2
      if (face < 0 && !s.rearStops.includes(this.stop)) {
        if (hits(s.x, cz, s.width, cabinWall)) return true
        continue
      }
      // Outside the clear aperture, the rest of each doorway is a fixed return.
      const clear = s.cabinOpening * this.opening
      const blocked = (s.width - clear) / 2
      for (const side of [-1, 1]) {
        if (hits(s.x + side * (clear + blocked) / 2, cz, blocked, 0.14)) return true
      }
    }
    return false
  }
}

export class ElevatorBank {
  readonly cars = { passenger: new ElevatorCar('passenger'), freight: new ElevatorCar('freight') }

  tick(dt: number) {
    for (const id of elevatorIds) this.cars[id].tick(dt)
  }

  callFrom(x: number, feetY: number, z: number) {
    for (const landing of elevatorLandings) {
      if (Math.abs(feetY - FLOORS[landing.floor].elevation) > 0.2 || Math.abs(x - landing.x) > landing.width / 2) continue
      const outside = (z - landing.z) * (landing.face === 'front' ? 1 : -1)
      if (outside >= 0 && outside <= 1.8) {
        this.cars[landing.id].request(landing.floor)
        return landing
      }
    }
  }

  landingOpening(door: Doorway) {
    const id = elevatorIds.find(id => door.zones.includes(id))
    if (!id) return undefined
    const car = this.cars[id]
    return car.stop === door.floor ? car.opening : 0
  }

  supportAt(x: number, y: number, z: number, tolerance: number) {
    for (const id of elevatorIds) {
      const car = this.cars[id]
      if (Math.abs(y - car.elevation) <= tolerance && car.deckAt(x, z)) return car.elevation
    }
  }

  hitsSide(x: number, y: number, z: number, radius: number, height: number) {
    return elevatorIds.some(id => this.cars[id].hitsSide(x, y, z, radius, height))
  }

  riderAt(x: number, y: number, z: number): ElevatorId | null {
    return elevatorIds.find(id => {
      const car = this.cars[id]
      return Math.abs(y - car.elevation) <= 0.2 && car.deckAt(x, z, 0.29)
    }) ?? null
  }
}
