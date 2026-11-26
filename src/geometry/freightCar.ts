import { FLOORS, INITIAL_FREIGHT_STOP, UNDERGROUND } from '../data/floors'
import type { UndergroundId } from '../types/shelter'
import { shaftPlans } from './coords'
import { doors } from './doors'

const shaft = shaftPlans.find((s) => s.id === 'freight')!
export const carDeck = { x: shaft.x, z: shaft.z, width: 1.8, depth: 1.8 }
export const carWall = { thickness: 0.06, height: 2.5 }
const half = carDeck.width / 2
export const carSideCentres = [shaft.x - half + carWall.thickness / 2, shaft.x + half - carWall.thickness / 2]
const landingDoors = doors.filter((d) => d.zones.includes('freight'))

/** A single level car, called from its landing. Both its drawing and walk contact use this stop. */
export class FreightCar {
  stop: UndergroundId = INITIAL_FREIGHT_STOP
  get elevation() {
    return FLOORS[this.stop].elevation
  }

  callFrom(x: number, feetY: number, z: number) {
    for (const landing of landingDoors) {
      const [cx, cy, cz] = landing.base
      if (Math.abs(feetY - cy) > 0.2 || Math.abs(x - cx) > landing.width / 2) continue
      const outside = (z - cz) * Math.sign(cz - shaft.z)
      if (outside < 0 || outside > 1.8) continue
      this.stop = landing.floor as UndergroundId
      return
    }
  }

  guideTo(floor: string) {
    const stop = UNDERGROUND.find((id) => id === floor)
    if (stop) this.stop = stop
  }

  deckAt(x: number, z: number) {
    return Math.abs(x - shaft.x) <= half + 1e-6 && Math.abs(z - shaft.z) <= carDeck.depth / 2 + 1e-6
  }

  hitsSide(x: number, y: number, z: number, radius: number, height: number) {
    if (y >= this.elevation + carWall.height || y + height <= this.elevation) return false
    const dz = Math.max(0, Math.abs(z - shaft.z) - carDeck.depth / 2)
    if (dz >= radius) return false
    return carSideCentres.some((cx) => {
      const dx = Math.max(0, Math.abs(x - cx) - carWall.thickness / 2)
      return dx * dx + dz * dz < radius * radius
    })
  }
}
