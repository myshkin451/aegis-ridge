import type { Point3, RoomCameraAnchor } from '../../types/shelter'

export const commonsCameras: RoomCameraAnchor[] = [
  { name: '客厅壁炉、绿庭与共餐长桌', position: [-14.36, 1.65, 11.39], target: [-12.168, 1.10, 6.896] },
  { name: '开放厨房与石材中岛', position: [-8.44, 1.65, 6.76], target: [-8.6, 1.49, 0.72] },
]

export const diningOrigin: Point3 = [-8.51, 0, 9.43]
export const diningSeats = [-1, 1].flatMap((side) =>
  [-1.18, -0.4, 0.4, 1.18].map((z) => ({
    position: [diningOrigin[0] + side * 0.79, 0.024, diningOrigin[2] + z] as Point3,
    yaw: (-side * Math.PI) / 2,
  })),
)
export const sofaPositions = [
  { position: [-15.04, 0.04, 9.45] as Point3, yaw: Math.PI / 2, size: [2.36, 0.89, 1.02] as Point3 },
  { position: [-11.98, 0.04, 10.41] as Point3, yaw: Math.PI, size: [2.55, 0.91, 1.06] as Point3 },
]
export const coffeePosition: Point3 = [-13.37, 0.04, 9.45]
export const kitchenPosition: Point3 = [-8.56, 0, 0.75]
export const islandPosition: Point3 = [-8.36, 0, 3.04]
export const pendantHeight = 2.27
export const tableLamps: Point3[] = [-0.86, 0.86].map((z) => [
  diningOrigin[0],
  pendantHeight,
  diningOrigin[2] + z,
])
// The kitchen fronts face south. The rear bank follows the shorter wall beside the entrance.
export const kitchenBayScale = 0.73
export function kitchenPoint(origin: Point3, x: number, y: number, z: number, widthScale = 1): Point3 {
  return [origin[0] + widthScale * z, y + origin[1], origin[2] - x]
}
