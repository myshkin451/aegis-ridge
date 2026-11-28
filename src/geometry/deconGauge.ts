import { doors, leafOffset } from './doors'
import type { Point3 } from '../types/shelter'

const door = doors.find((d) => d.id === 'b1_decon')!
const width = 0.43
const parkedRightEdge = door.base[0] + leafOffset(door, 1, 1) + door.width / 4
// Mount on the room side, clear of the fully open leaf. Positions supplied to room anchors are floor-local.
const centre: Point3 = [parkedRightEdge + 0.12 + width / 2, 1.65, door.base[2] - 0.142]
export const deconInstrument = { centre, width, height: 0.448, yaw: Math.PI }
