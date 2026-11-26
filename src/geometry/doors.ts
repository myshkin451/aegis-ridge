import { FLOORS, UNDERGROUND } from '../data/floors'
import { defaultBlueprint, roomsOn } from '../data/defaultBlueprint'
import { adits, eastTransfer } from '../data/siteFacilities'
import { footprint } from './coords'
import type { FloorId, Point3, RoomInstance } from '../types/shelter'

export interface Doorway {
  id: string
  floor: FloorId
  base: Point3
  yaw: number
  width: number
  height: number
  airlock: boolean
  interlock?: string
}
export function roomDoor(room: RoomInstance): Doorway {
  const r = footprint(room.bounds)
  return {
    id: room.id,
    floor: room.floorId,
    base: [
      room.id === 'b2_quarters' ? eastTransfer[0][0] : r.x,
      FLOORS[room.floorId].elevation,
      room.bounds.gz0 === 0 ? r.z1 - 0.085 : r.z0 + 0.085,
    ],
    yaw: 0,
    width: 2.04,
    height: 2.4,
    airlock: room.id === 'b1_decon',
  }
}
const lobby = footprint(defaultBlueprint.rooms.find((r) => r.id === 'l1_vestibule')!.bounds)
export const doors: Doorway[] = [
  ...UNDERGROUND.flatMap((id) => roomsOn(id).map(roomDoor)),
  {
    id: 'entry',
    floor: 'L1',
    base: [lobby.x, 0, lobby.z1 - 0.08],
    yaw: 0,
    width: 2.4,
    height: 2.68,
    airlock: true,
    interlock: 'vestibule',
  },
  {
    id: 'entry-inner',
    floor: 'L1',
    base: [lobby.x, 0, lobby.z1 - 3.8],
    yaw: 0,
    width: 2.4,
    height: 2.68,
    airlock: true,
    interlock: 'vestibule',
  },
  ...Object.values(adits).map((b) => {
    const end = b.points.at(-1)!,
      prev = b.points.at(-2)!
    return {
      id: b.id + '-portal',
      floor: b.floor,
      base: end,
      yaw: Math.atan2(end[0] - prev[0], end[2] - prev[2]),
      width: b.width,
      height: b.height,
      airlock: true,
    }
  }),
]

export function nearSurfaceOpening(x: number, y: number, z: number) {
  if (y > -0.5) return true
  return Object.values(adits).some((b) => {
    const end = b.points[b.points.length - 1]
    return Math.abs(y - end[1]) < 4 && Math.hypot(x - end[0], z - end[2]) < 19
  })
}
