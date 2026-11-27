import { getFloorElevation } from '../geometry/coords'
import type { CameraStateId, FloorId, Point3 } from '../types/shelter'

interface Photograph {
  title: string
  time: string
  camera: CameraStateId
  floor?: FloorId
  landing?: Point3
  lens: number
  xray?: boolean
  cold?: boolean
  /** Target and camera bearing; metres are framed vertically in the reference aspect. */
  target: Point3
  bearing: Point3
  height: number
}
function pilot(title: string, time: string, x: number, z: number, look: Point3): Photograph {
  const y = getFloorElevation('B2')
  return {
    title,
    time,
    camera: 'walkthrough',
    floor: 'B2',
    lens: 68,
    landing: [x, y, z],
    target: [look[0], y + look[1], look[2]],
    bearing: [0, 0, 1],
    height: 1.65,
  }
}
export const photographs = {
  'shot-01': {
    title: '蓝调时刻剖面',
    time: '19:30',
    camera: 'section',
    lens: 65,
    target: [0, -7.2, -3.75],
    bearing: [0, 0, 1],
    height: 48,
  },
  'shot-02': {
    title: '黎明云海',
    time: '06:15',
    camera: 'site',
    lens: 65,
    target: [4, 18.2, 3],
    bearing: [-1, 0.008, -0.35],
    height: 46.5,
  },
  'shot-03': {
    title: '极寒封锁',
    time: '15:00',
    camera: 'site',
    lens: 50,
    cold: true,
    target: [0, 5.8, 0],
    bearing: [-0.66, 0.24, 1],
    height: 30,
  },
  'shot-04': {
    title: 'X 光夜景',
    time: '22:00',
    camera: 'site',
    lens: 55,
    xray: true,
    target: [3, -9, 0],
    bearing: [0.48, 0.35, 1],
    height: 57,
  },
  'shot-05': {
    title: 'B3 第一人称',
    time: '21:30',
    camera: 'walkthrough',
    floor: 'B3',
    lens: 60,
    landing: [-7, getFloorElevation('B3'), -0.58],
    target: [-6.88, getFloorElevation('B3') + 1.615, 0.42],
    bearing: [0, 0, 1],
    height: 1.65,
  },
  'pilot-bedroom': pilot('单人卧室 1', '19:30', 0.46, 7.64, [-0.78, 1.32, 10.68]),
  'pilot-commons': pilot('光纤下的共餐客厅', '10:30', -14.75, 2, [-9.7, 1.25, 8.6]),
  'pilot-bath': pilot('卫浴镜柜与瓷砖', '19:30', -3.04, 4.3, [-3.95, 1.3, 9.48]),
  'detail-sanitary': pilot('公卫洁具近看', '19:30', -4.00, 0.05, [-3.94, 0.80, 1.94]),
} satisfies Record<string, Photograph>
export type ShotId = keyof typeof photographs
export const photo = (id: ShotId): Photograph => photographs[id]
