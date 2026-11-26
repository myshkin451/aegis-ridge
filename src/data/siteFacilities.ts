import { FLOORS, ADIT } from './floors'
import survey from './siteSurvey.json'
import { aditCentreZ, footprint, undergroundPlan } from '../geometry/coords'
import type { TerrainAtlas } from '../geometry/siteElevations'
import { groundAt, pathLength, pointAlong } from '../geometry/siteElevations'
import type { Point3, UndergroundId } from '../types/shelter'

export interface Adit {
  id: 'west' | 'east'
  floor: UndergroundId
  width: number
  height: number
  points: Point3[]
}
const westY = FLOORS.B1.elevation,
  eastY = FLOORS.B2.elevation
const [wx, wz] = survey.westMouth,
  [ex, ez] = survey.eastMouth
export const eastGrade = 0.003
export const adits: Record<Adit['id'], Adit> = {
  west: {
    id: 'west',
    floor: 'B1',
    width: ADIT.width,
    height: ADIT.height,
    points: [
      [undergroundPlan.x0, westY, aditCentreZ],
      [survey.westBend[0], westY, survey.westBend[1]],
      [wx, westY, wz],
    ],
  },
  east: {
    id: 'east',
    floor: 'B2',
    width: 2.5,
    height: 2.8,
    points: [
      [undergroundPlan.x1, eastY, ez],
      [ex, eastY - (ex - undergroundPlan.x1) * eastGrade, ez],
    ],
  },
}
export const refugeJunction = pointAlong(adits.east.points, pathLength(adits.east.points) / 2)
export const refuge: Point3 = [refugeJunction[0], refugeJunction[1], refugeJunction[2] - 3.8]
// The flush B2 passage uses the northern edge of the quarters to bypass the stairs.
export const eastTransfer: Point3[] = [[10.5, eastY, -1], [10.5, eastY, ez], adits.east.points[0]]
const station = footprint(FLOORS.L1.bounds)
export const galleryChainage = 82

export type SiteKind =
  | 'gate'
  | 'gallery'
  | 'road'
  | 'station'
  | 'westPortal'
  | 'eastBore'
  | 'refuge'
  | 'eastPortal'
  | 'westIntake'
  | 'eastIntake'
  | 'exhaust'
  | 'spring'
  | 'drain'
  | 'solar'
  | 'helipad'
  | 'cable'
  | 'relay'
  | 'sensors'
  | 'pond'
export interface SiteFacility {
  id: number
  kind: SiteKind
  name: string
  points: number[][]
}
export const siteFacilities: SiteFacility[] = [
  { id: 1, kind: 'gate', name: '山谷访客登记亭', points: [survey.road.at(-1)!].map(([x, , z]) => [x, z]) },
  { id: 2, kind: 'gallery', name: '防雪崩廊道', points: [] },
  { id: 3, kind: 'road', name: '之字形进站路', points: survey.road.map(([x, , z]) => [x, z]) },
  { id: 4, kind: 'station', name: '高山生态与气象观测站', points: [[station.x, station.z]] },
  { id: 5, kind: 'westPortal', name: '西南检修平硐', points: [survey.westMouth] },
  { id: 6, kind: 'eastBore', name: 'B2 东侧疏散平硐', points: adits.east.points.map(([x, , z]) => [x, z]) },
  { id: 7, kind: 'refuge', name: '中段应急硐室', points: [[refuge[0], refuge[2]]] },
  { id: 8, kind: 'eastPortal', name: '东沟水文监测洞口', points: [survey.eastMouth] },
  { id: 9, kind: 'westIntake', name: '西脊测量标墩与进风口', points: [survey.intakeWest] },
  { id: 10, kind: 'eastIntake', name: '东脊气象站与进风口', points: [survey.intakeEast] },
  { id: 11, kind: 'exhaust', name: '低侧排风房', points: [survey.exhaust] },
  { id: 12, kind: 'spring', name: '山泉集水房与量水堰', points: [survey.spring] },
  { id: 13, kind: 'drain', name: '下游重力排水涵洞', points: [survey.drain] },
  { id: 14, kind: 'solar', name: '光伏试验场', points: [survey.solar] },
  { id: 15, kind: 'helipad', name: '融雪直升机坪', points: [survey.helipad] },
  { id: 16, kind: 'cable', name: '山谷货运索道', points: [survey.cableTop, survey.cableValley] },
  { id: 17, kind: 'relay', name: '邻峰通讯中继站', points: [survey.relay] },
  { id: 18, kind: 'sensors', name: '地震与物候观测网', points: survey.sensors },
  { id: 19, kind: 'pond', name: '消防蓄水池', points: [survey.pond] },
]

export function facilityAnchor(f: SiteFacility, atlas: TerrainAtlas): Point3 {
  if (f.kind === 'gallery') return pointAlong(atlas.road, galleryChainage)
  if (f.kind === 'road') return pointAlong(atlas.road, 180)
  if (f.kind === 'eastBore') return pointAlong(adits.east.points, 135)
  if (f.kind === 'refuge') return refuge
  if (f.kind === 'westPortal') return adits.west.points.at(-1)!
  if (f.kind === 'eastPortal') return adits.east.points.at(-1)!
  const [x, z] = f.points[0]
  return [x, groundAt(atlas, x, z).height, z]
}

// Civil-system endpoints. Pipe routing and flow calculations belong to M3/M4.
export const serviceLinks = [
  { source: 'spring', target: 'b3_water', service: 'gravitySupply' },
  { source: 'b4_drainage', target: 'drain', service: 'gravityDischarge' },
  { source: 'westIntake', target: 'wet', service: 'supplyAir' },
  { source: 'eastIntake', target: 'wet', service: 'supplyAir' },
  { source: 'wet', target: 'exhaust', service: 'exhaustAir' },
] as const
