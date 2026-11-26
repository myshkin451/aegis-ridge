import { FLOORS, PASSENGER_STOP, UNDERGROUND } from '../data/floors'
import { adits } from '../data/siteFacilities'
import { bedrooms, eastLinkDoorX, eastLobbyEntryX, escapeLobby, quietHall } from './residentialPlan'
import type { FloorId, Point3, RoomInstance } from '../types/shelter'

export type WallAxis = 'x' | 'z'
export type DoorKind = 'airlock' | 'fire' | 'acoustic' | 'insulated' | 'sliding'
export interface Doorway {
  id: string
  floor: FloorId
  /** Surveyed centreline at the base of the opening; axis is along the wall. */
  base: Point3
  axis: WallAxis | 'bearing'
  yaw: number
  width: number
  height: number
  kind: DoorKind
  zones: [string, string]
  airlock: boolean
  interlock?: string
  trackOffset?: number
}
export function door(
  floor: FloorId,
  id: string,
  axis: WallAxis,
  x: number,
  z: number,
  width: number,
  kind: DoorKind,
  zones: [string, string],
  height = 2.4,
  trackOffset = 0.17,
): Doorway {
  return {
    floor,
    id,
    axis,
    base: [x, FLOORS[floor].elevation, z],
    yaw: axis === 'x' ? 0 : Math.PI / 2,
    width,
    height,
    kind,
    zones,
    airlock: kind === 'airlock',
    trackOffset,
  }
}
const main = 'main-corridor',
  branch = 'north-branch'
function front(floor: FloorId, room: string, x: number, z: number, kind: DoorKind, width = 2.04) {
  return door(floor, room, 'x', x, z, width, kind, [main, room], 2.4, z < 0 ? -0.17 : 0.17)
}
export const doors: Doorway[] = [
  front('B1', 'b1_decon', -12, -2, 'airlock'),
  door('B1', 'b1_logistics', 'z', 4, -7, 1.55, 'fire', [branch, 'b1_logistics']),
  front('B1', 'b1_tactical', 10, -2, 'fire'),
  front('B1', 'b1_gym', -12, 0, 'acoustic'),
  front('B1', 'b1_workshop', -4, 0, 'fire'),
  front('B1', 'b1_warehouse', 8, 0, 'fire'),
  door('B1', 'workshop-store', 'z', 0, 2.5, 2.04, 'fire', ['b1_workshop', 'b1_warehouse']),
  front('B2', 'b2_medical', -12, -2, 'airlock'),
  door('B2', 'b2_library', 'z', 4, -7, 1.55, 'acoustic', [branch, 'b2_library']),
  front('B2', 'b2_command', 10, -2, 'fire'),
  front('B2', 'b2_commons', -11, 0, 'fire'),
  door('B2', 'b2_bath_laundry', 'x', -4, 0, 1.15, 'sliding', [main, 'b2-public-wc']),
  door('B2', 'b2_quarters', 'x', -1, 0, 1.2, 'acoustic', [main, 'b2-west-vestibule']),
  door('B2', 'hall-west', 'x', -1, quietHall.z0, 1.2, 'acoustic', ['b2-west-vestibule', 'b2-quiet-hall']),
  door('B2', 'laundry-access', 'z', -2, 6, 1.2, 'sliding', ['b2-quiet-hall', 'b2-laundry']),
  door('B2', 'lobby-north', 'x', eastLobbyEntryX, 0, 1.2, 'fire', [main, 'b2-escape-lobby']),
  door('B2', 'lobby-link', 'x', eastLinkDoorX, escapeLobby.z1, 1.3, 'fire', [
    'b2-east-link',
    'b2-escape-lobby',
  ]),
  door('B2', 'hall-east', 'x', eastLinkDoorX, quietHall.z0, 1.3, 'fire', ['b2-quiet-hall', 'b2-east-link']),
  ...bedrooms.map((b) =>
    b.onCall
      ? door('B2', b.id, 'z', b.x0, 2.5, 1.05, 'acoustic', ['b2-west-vestibule', b.id], 2.1)
      : door(
          'B2',
          b.id,
          'x',
          (b.x0 + b.x1) / 2,
          b.beds === 1 ? b.z0 : b.z1,
          1.05,
          'acoustic',
          ['b2-quiet-hall', b.id],
          2.1,
          b.beds === 1 ? 0.17 : -0.17,
        ),
  ),
  front('B3', 'b3_water', -12, -2, 'fire'),
  door('B3', 'b3_foodproc', 'z', 4, -7, 1.55, 'fire', [branch, 'b3_foodproc']),
  door('B3', 'b3_coldvault', 'z', 6, -7, 1.8, 'insulated', [branch, 'b3_coldvault']),
  front('B3', 'b3_hydroponics', -7, 0, 'sliding'),
  front('B3', 'b3_aquaponics', 9, 0, 'sliding'),
  door('B3', 'farm-isolation', 'z', 2, 5.6, 1.35, 'sliding', ['b3_hydroponics', 'b3_aquaponics']),
  front('B4', 'b4_drainage', -12, -2, 'fire'),
  door('B4', 'b4_geothermal', 'z', 4, -7, 1.55, 'fire', [branch, 'b4_geothermal']),
  front('B4', 'b4_switchgear', 10, -2, 'fire'),
  front('B4', 'b4_reactor', -7, 0, 'fire'),
  front('B4', 'b4_cbrn_hvac', 9, 0, 'fire'),
  door('B4', 'pump-suite', 'z', -8, -7, 1.45, 'fire', ['b4_drainage', 'b4_geothermal']),
  ...UNDERGROUND.flatMap((floor) => [
    door(floor, floor + '-niche', 'x', 5, -8, 1.05, 'sliding', [branch, 'service-niche'], 2.1, -0.17),
    door(floor, floor + '-freight-front', 'x', -4, -2, 1.98, 'fire', [main, 'freight'], 2.6, -0.17),
    door(floor, floor + '-personnel', 'x', -0.85, -2, 1.45, 'fire', [main, 'personnel']),
    door(floor, floor + '-passenger', 'x', 1.16, -2, 1.02, 'fire', [main, 'passenger']),
    door(floor, floor + '-east-stair', 'z', 12, -1, 1.45, 'fire', [main, 'escape']),
  ]),
  door('B1', 'B1-freight-rear', 'x', -4, -6, 1.98, 'fire', ['freight', 'b1_logistics'], 2.6),
  door('B4', 'B4-freight-rear', 'x', -4, -6, 1.98, 'fire', ['freight', 'b4_geothermal'], 2.6),
  ...Object.values(adits).map((b) => {
    const [x, , z] = b.points[0]
    return door(
      b.floor,
      b.id + '-threshold',
      'z',
      x,
      z,
      b.width,
      b.id === 'east' ? 'fire' : 'airlock',
      [b.id === 'east' ? 'b2-escape-lobby' : 'b1_decon', b.id + '-adit'],
      b.height,
    )
  }),
  door('L1', 'garage-west', 'x', -12.5, 8, 4.22, 'sliding', ['surface', 'l1_garage'], 3.06),
  door('L1', 'garage-east', 'x', -5.5, 8, 4.22, 'sliding', ['surface', 'l1_garage'], 3.06),
  door('L1', 'garage-staff', 'z', -2, 1.4, 1.5, 'fire', ['l1_garage', 'l1_vestibule']),
  door('L1', 'lobby-staff', 'z', 4, -0.5, 1.35, 'fire', ['l1_lobby', 'l1_vestibule']),
  door('L2', 'greenhouse-observation', 'z', 2, -7.45, 1.45, 'sliding', ['l2_observatory', 'dry-observation']),
  door('L2', 'greenhouse-growing', 'x', 7, -2, 1.45, 'sliding', ['dry-observation', 'l2_greenhouse']),
  {
    ...door('L1', 'entry', 'x', 1, 7.92, 2.4, 'airlock', ['surface', 'entry-chamber'], 2.68),
    interlock: 'vestibule',
  },
  {
    ...door('L1', 'entry-inner', 'x', 1, 4.2, 2.4, 'airlock', ['entry-chamber', 'l1_vestibule'], 2.68),
    interlock: 'vestibule',
  },
  ...Object.values(adits).map((b): Doorway => {
    const end = b.points.at(-1)!,
      prev = b.points.at(-2)!
    return {
      ...door(
        b.floor,
        b.id + '-portal',
        'z',
        end[0],
        end[2],
        b.width,
        'airlock',
        [b.id + '-adit', 'surface'],
        b.height,
      ),
      axis: 'bearing',
      base: end,
      yaw: Math.atan2(end[0] - prev[0], end[2] - prev[2]),
    }
  }),
]
const byId = new Map(doors.map((d) => [d.id, d]))
export function roomDoor(room: RoomInstance): Doorway {
  const d = byId.get(room.id)
  if (!d) throw new Error('No primary doorway for ' + room.id)
  return d
}
export function openingsAlong(floor: FloorId, axis: WallAxis, fixed: number, begin: number, end: number) {
  const across = axis === 'x' ? 2 : 0,
    along = axis === 'x' ? 0 : 2
  return doors
    .filter(
      (d) =>
        d.floor === floor &&
        d.axis === axis &&
        Math.abs(d.base[across] - fixed) < 1e-5 &&
        d.base[along] > begin &&
        d.base[along] < end,
    )
    .sort((a, b) => a.base[along] - b.base[along])
}
/** Landing doors may open to a person only while that car supports the crossing. */
export function manualDoorAvailable(d: Doorway, freightStop?: FloorId) {
  if (d.zones.includes('freight')) return d.floor === freightStop
  if (d.zones.includes('passenger')) return d.floor === PASSENGER_STOP
  return true
}
export const leafThickness = 0.075
/** The two leaves meet at the centreline when closed; open leaves park beyond each jamb. */
export function leafOffset(door: Doorway, leaf: number, opening: number) {
  return (2 * leaf - 1) * door.width * (0.25 + 0.52 * opening)
}
export const doorTints: Record<DoorKind, string> = {
  acoustic: '#ad9982',
  insulated: '#c0ccca',
  fire: '#82908c',
  airlock: '#806b52',
  sliding: '#9aa9ac',
}
export function nearSurfaceOpening(x: number, y: number, z: number) {
  if (y > -0.5) return true
  return Object.values(adits).some((b) => {
    const end = b.points[b.points.length - 1]
    return Math.abs(y - end[1]) < 4 && Math.hypot(x - end[0], z - end[2]) < 19
  })
}
