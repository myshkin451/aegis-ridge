import { upperLayouts } from './upper'
import { residentialLayouts } from './residential'
import { plantLayouts } from './plant'
import type { RoomLayout } from './schema'

export const roomLayouts: Record<string, RoomLayout> = {
  ...upperLayouts,
  ...residentialLayouts,
  ...plantLayouts,
}
