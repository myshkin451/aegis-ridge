import { FLOORS } from '../data/floors'
import type { FloorId, Point3 } from '../types/shelter'
import { shaftPlans } from './coords'

export interface StairPlate {
  centre: Point3
  size: Point3
  landing: boolean
}
const nextFloor: Partial<Record<FloorId, FloorId>> = { B4: 'B3', B3: 'B2', B2: 'B1', B1: 'L1', L1: 'L2' }
export function stairRun(id: 'escape' | 'personnel', floor: FloorId) {
  const above = nextFloor[floor]
  if (!above || (id === 'escape' && !['B4', 'B3', 'B2'].includes(floor))) return
  const s = shaftPlans.find((p) => p.id === id)!
  const east = id === 'escape',
    width = east ? 0.92 : 1.1,
    landingDepth = width
  const travel = (east ? s.w : s.d) - 2 * landingDepth
  const rise = FLOORS[above].elevation - FLOORS[floor].elevation
  const flights = Math.ceil(rise / (7 * 0.165) - 1e-8)
  const count = Math.ceil(rise / 0.165 - 1e-8),
    riser = rise / count,
    thickness = 0.075
  const plates: StairPlate[] = []
  const treads: number[] = []
  // Two parallel lanes switch at each landing. Relative y is measured from the departure floor.
  const near = east ? s.x0 : s.z1,
    sense = east ? 1 : -1
  const lateral = east ? s.z0 + 0.065 : s.x0 + 0.045
  function plate(along: number, across: number, top: number, len: number, w: number, landing: boolean) {
    const u = near + sense * along,
      v = lateral + across
    plates.push({
      centre: east ? [u, top - thickness / 2, v] : [v, top - thickness / 2, u],
      size: east ? [len, thickness, w] : [w, thickness, len],
      landing,
    })
  }
  const reversed = floor === 'L1' && id === 'personnel'
  function landing(atFar: boolean, top: number) {
    plate(
      atFar ? 4 - landingDepth / 2 : landingDepth / 2,
      width + 0.015,
      top,
      landingDepth,
      2 * width + 0.03,
      true,
    )
  }
  landing(reversed, 0)
  for (let j = 0; j < flights; j++) {
    const first = Math.round((j * count) / flights),
      end = Math.round(((j + 1) * count) / flights)
    const going = travel / (end - first - 1)
    treads.push(going)
    const returning = Boolean(j % 2) !== reversed
    for (let k = 1; k < end - first; k++) {
      const u = landingDepth + (k - 0.5) * going
      plate(
        returning ? 4 - u : u,
        ((j + Number(reversed)) % 2) * (width + 0.03) + width / 2,
        (first + k) * riser,
        going,
        width,
        false,
      )
    }
    landing(!returning, end * riser)
  }
  return { plates, riser, treads, width, flights, rise, above }
}
