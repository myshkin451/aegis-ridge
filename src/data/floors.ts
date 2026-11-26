import type { FloorDefinition, FloorId, GridBounds, Shaft, UndergroundId } from '../types/shelter'

export const GRID = { columns: 16, rows: 12, cell: 2 } as const
export const DATUM = 1450
export const SLAB = 0.3
export const BUFFER_DEPTH = 6
export const FLOOR_ORDER: FloorId[] = ['L2', 'L1', 'B1', 'B2', 'B3', 'B4']
export const UNDERGROUND: UndergroundId[] = ['B1', 'B2', 'B3', 'B4']
export const gridRect = (gx0: number, gx1: number, gz0: number, gz1: number): GridBounds => ({
  gx0,
  gx1,
  gz0,
  gz1,
})

const standard = gridRect(0, GRID.columns - 1, 0, GRID.rows - 1)
function floor(
  id: FloorId,
  name: string,
  shortName: string,
  elevation: number,
  bounds = standard,
): FloorDefinition {
  const surface = id.startsWith('L')
  return {
    id,
    name,
    shortName,
    elevation,
    bounds,
    clearHeight: surface ? 3.6 : 3,
    pitch: surface ? 4.4 : 4.2,
  }
}

export const FLOORS: Record<FloorId, FloorDefinition> = {
  L2: floor('L2', '地表观测与温室层', '观测温室', 4.4, gridRect(2, 13, 1, 8)),
  L1: floor('L1', '地表入口与重载层', '入口车库', 0, gridRect(0, 14, 1, 9)),
  B1: floor('B1', '洗消、健身、制造与仓储层', '物流工坊', -10.2),
  B2: floor('B2', '居住、医务与智控层', '居住智控', -14.4),
  B3: floor('B3', '生态农业与水循环层', '生态水务', -18.6),
  B4: floor('B4', '能源核心与三防总站层', '能源总站', -22.8),
}

export const CORRIDOR = gridRect(0, 13, 5, 5)
export const BRANCH_CORRIDOR = gridRect(10, 10, 2, 4)
export const SERVICE_NICHE = gridRect(10, 10, 0, 1)
export const SHAFTS: Shaft[] = [
  { id: 'wet', name: '湿式与暖通竖井', bounds: gridRect(4, 4, 3, 4), topFloor: 'L1' },
  { id: 'freight', name: '重载货梯与吊装井', bounds: gridRect(5, 6, 3, 4), topFloor: 'L1' },
  { id: 'personnel', name: '正压防烟楼梯与独立人员梯', bounds: gridRect(7, 8, 3, 4), topFloor: 'L2' },
  { id: 'electrical', name: '强弱电双隔离竖井', bounds: gridRect(9, 9, 3, 4), topFloor: 'L2' },
  { id: 'escape', name: '东侧无烟联络楼梯', bounds: gridRect(14, 15, 5, 5), topFloor: 'B1' },
]
export const ADIT = { floorId: 'B1', roomId: 'b1_decon', gz: 2, width: 2.6, height: 2.65 } as const

/** The freight car can be called to any underground landing. The passenger car stays at B2. */
export const INITIAL_FREIGHT_STOP: UndergroundId = 'B4'
export const PASSENGER_STOP: UndergroundId = 'B2'
