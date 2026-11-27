import { defaultBlueprint } from './defaultBlueprint'
import { FLOORS } from './floors'
import { pilotFixtures } from './roomLayouts/residential'
import { footprint } from '../geometry/coords'
import { bedrooms, publicBath } from '../geometry/residentialPlan'
import type { FloorId, Point3, UndergroundId } from '../types/shelter'

export type LightingTime = '10:30' | '19:30'
interface Emitter {
  position: Point3
  kelvin: number
  intensity: number
  spectrum?: string
}
interface Aimed extends Emitter {
  target: Point3
}
export interface RoomLighting {
  floor: FloorId
  spot: Aimed & { angle: number; reach: number }
  points: Emitter[]
  areas: (Aimed & { size: [number, number] })[]
}
export const lighting: Record<string, Record<LightingTime, RoomLighting>> = {}
const plans = defaultBlueprint.rooms.map((room) => ({ room, bounds: footprint(room.bounds) }))
const offset = (p: readonly number[], x: number, y: number, z: number): Point3 => [
  p[0] + x,
  p[1] + y,
  p[2] + z,
]
const emit = (position: Point3, kelvin: number, intensity: number): Emitter => ({
  position,
  kelvin,
  intensity,
})
const spot = (
  p: Point3,
  target: Point3,
  kelvin: number,
  intensity: number,
  angle: number,
  reach: number,
) => ({ ...emit(p, kelvin, intensity), target, angle, reach })
const area = (p: Point3, target: Point3, kelvin: number, intensity: number, w: number, h: number) => ({
  ...emit(p, kelvin, intensity),
  target,
  size: [w, h] as [number, number],
})

function register(id: string, day: RoomLighting, night = day) {
  lighting[id] = { '10:30': day, '19:30': night }
}
function ceiling(id: string, floor: UndergroundId, x: number, z: number, h: number) {
  const kelvin = floor === 'B2' ? 3000 : floor === 'B3' ? 4200 : 4500
  register(id, {
    floor,
    spot: spot([x, h - 0.22, z], [x, 0.3, z], kelvin, 33, 1.04, 7),
    points: [emit([x, h - 0.48, z], kelvin, 9)],
    areas: [],
  })
}
for (const { room, bounds } of plans)
  if (room.floorId.startsWith('B'))
    ceiling(
      room.id,
      room.floorId as UndergroundId,
      bounds.x,
      bounds.z,
      room.clearHeightOverride ?? FLOORS[room.floorId].clearHeight,
    )
for (const floor of ['B1', 'B2', 'B3', 'B4'] as const) ceiling(floor + '-hall', floor, -2, -1, 3)
for (const b of bedrooms) ceiling(b.id, 'B2', (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 3)

for (const time of ['10:30', '19:30'] as const) {
  const day = time === '10:30'
  const f = pilotFixtures
  // Cultivation strips supply the pink-white reflected light at the B3 gallery.
  // These stay fixed on the two facing racks during the lit portion of the crop cycle.
  const farm = lighting['B3-hall'][time]
  farm.areas = [
    {
      ...area([-9.12, 2.68, 5.9], [-7, 0.55, 6.25], 4200, 8.4, 1.0, 7.3),
      spectrum: '#ffcee2',
    },
  ]
  farm.points = [
    { ...emit([-7.3, 2.32, 9.2], 4200, 6.8), spectrum: '#ffdae7' },
    { ...emit([-4.95, 2.52, 5.9], 4200, 12), spectrum: '#ffcee2' },
    { ...emit([-7.0, 2.64, -1.41], 4200, 13.2), spectrum: '#ffe0ec' },
  ]
  lighting['b2-single-1'][time] = {
    floor: 'B2',
    spot: spot(offset(f.bedside, 0, -0.08, -0.04), [-1.33, 0.45, 9.63], 2700, day ? 13 : 25, 0.99, 4.2),
    points: [
      emit(offset(f.bedside, 0, 0.07, -0.14), 2700, day ? 2 : 3.5),
      emit([0.4, 2.81, 8.15], 3000, 1.4),
    ],
    areas: [area(offset(f.skyPanel, 0, 0, -0.11), [-0.55, 1.29, 8.5], 3000, day ? 4 : 0.85, 1.46, 0.79)],
  }
  lighting.b2_commons[time] = {
    floor: 'B2',
    spot: spot(offset(f.pendants[0], 0, -0.15, 0), [-8.46, 0.79, 6.12], 2900, day ? 29 : 45, 1.1, 6.8),
    points: [
      emit(offset(f.pendants[1], 0, -0.15, 0), 2900, day ? 17 : 25),
      emit(offset(f.floorLamp, 0, 0.01, -0.06), 2700, day ? 10 : 15),
      emit([-12.0, 3.2, 9.7], 3000, 9.5),
    ],
    areas: [area([-10.7, 3.28, 5.35], [-10.3, 0.5, 6.5], 3000, day ? 8 : 5, 3.1, 1.35)],
  }
  for (const [id, mirror, aim] of [
    ['b2_bath_laundry', f.mirror, [-4.45, 0.52, 8.06]],
    ['b2-public-bath', f.publicMirror, [-4.0, 0.55, 1.65]],
  ] as const) {
    lighting[id] ??= {} as Record<LightingTime, RoomLighting>
    lighting[id][time] = {
      floor: 'B2',
      spot: spot(offset(mirror, -0.11, -0.05, 0), [...aim], 3000, 18, 1.07, 4.8),
      points: [
        emit(offset(mirror, -0.18, -0.11, 0), 2900, 3.8),
        emit([aim[0], 2.83, aim[2] - 0.2], 3000, 3.0),
      ],
      areas: [area(offset(mirror, -0.05, 0, 0), [...aim], 3000, 8, 0.95, 0.13)],
    }
  }
}

export function lightingRoomAt(floor: FloorId, x: number, z: number): string {
  if (floor === 'B2') {
    const bedroom = bedrooms.find((b) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1)
    if (bedroom) return bedroom.id
    if (x >= publicBath.x0 && x < publicBath.x1 && z >= publicBath.z0 && z < publicBath.z1)
      return 'b2-public-bath'
  }
  return (
    plans.find(
      ({ room, bounds: b }) => room.floorId === floor && x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1,
    )?.room.id ?? floor + '-hall'
  )
}
export function lightingTimeAt(time: string): LightingTime {
  return time >= '06:30' && time < '18:00' ? '10:30' : '19:30'
}
