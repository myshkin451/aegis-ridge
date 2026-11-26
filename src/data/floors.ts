import type { FloorDefinition, FloorId, GridBounds, Shaft, UndergroundId } from '../types/shelter'

export const GRID = { columns: 14, rows: 10, cell: 2 } as const
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
  clearHeight = 3,
): FloorDefinition {
  return { id, name, shortName, elevation, bounds, clearHeight, pitch: 4.2 }
}

export const FLOORS: Record<FloorId, FloorDefinition> = {
  L2: floor('L2', '地表观测与温室层', '观测温室', 4.2, gridRect(1, 11, 1, 7), 3.6),
  L1: floor('L1', '地表入口与重载层', '入口车库', 0, gridRect(0, 12, 1, 8), 3.4),
  B1: floor('B1', '气闸、仓储与工坊层', '物流工坊', -10.2),
  B2: floor('B2', '居住、医务与智控层', '居住智控', -14.4),
  B3: floor('B3', '生态农业与水循环层', '生态水务', -18.6),
  B4: floor('B4', '能源核心与三防总站层', '能源总站', -22.8),
}

export const CORRIDOR = gridRect(0, 12, 4, 4)
export const SHAFTS: Shaft[] = [
  { id: 'freight', name: '重载货梯与吊装井', gx: 5, gz: 3 },
  { id: 'personnel', name: '人员楼梯与电梯井', gx: 6, gz: 3 },
  { id: 'wet', name: '湿式与暖通竖井', gx: 7, gz: 3 },
  { id: 'electrical', name: '电气双隔离竖井', gx: 8, gz: 3 },
  { id: 'escape', name: '东侧备用逃生与冗余排风井', gx: 13, gz: 4 },
]
export const ADIT = { floorId: 'B1', roomId: 'b1_decon', gz: 2, width: 2.6, height: 2.65 } as const
