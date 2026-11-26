/** Finished plan axes, in metres. Shared by fit-outs, partitions, ports and the walking survey. */
export interface PlanRect {
  x0: number
  x1: number
  z0: number
  z1: number
}
export const quietHall = { x0: -2, x1: 16, z0: 5, z1: 7 }
export const westVestibule = { x0: -2, x1: 0, z0: 0, z1: 5 }
export const escapeLobby = { x0: 10.6, x1: 16, z0: 0, z1: 3 }
export const eastLink = { ...escapeLobby, z0: escapeLobby.z1, z1: quietHall.z0 }
export const publicBath = { x0: -6, x1: -2, z0: 0, z1: 3 }
export const laundry = { ...publicBath, z0: publicBath.z1, z1: 12 }
export const eastLobbyEntryX = 11.3
export const eastLinkDoorX = 14
export interface Bedroom extends PlanRect {
  id: string
  name: string
  beds: number
  onCall: boolean
}
export const bedrooms: Bedroom[] = [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: 'b2-single-' + (i + 1),
    name: '单人卧室 ' + (i + 1),
    beds: 1,
    onCall: false,
    x0: -2 + i * 3,
    x1: 1 + i * 3,
    z0: quietHall.z1,
    z1: 12,
  })),
  ...[3.8, 7.2].map((x0, i) => ({
    id: 'b2-double-' + (i + 1),
    name: '双人卧室 ' + (i + 1),
    beds: 2,
    onCall: false,
    x0,
    x1: i === 0 ? 7.2 : escapeLobby.x0,
    z0: 0,
    z1: quietHall.z0,
  })),
  { id: 'b2-reserve', name: '备勤宿舍', beds: 4, onCall: true, x0: 0, x1: 3.8, z0: 0, z1: quietHall.z0 },
]
