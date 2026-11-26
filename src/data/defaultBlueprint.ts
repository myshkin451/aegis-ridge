import { gridRect as rect } from './floors'
import type { FloorId, GridBounds, RoomInstance } from '../types/shelter'

type Options = Partial<
  Pick<
    RoomInstance,
    'zonePressure' | 'replaceable' | 'adjustable' | 'isDryElectricalZone' | 'requiresHoistRail'
  >
>
function room(
  floorId: FloorId,
  id: string,
  name: string,
  bounds: GridBounds,
  options: Options = {},
): RoomInstance {
  return {
    floorId,
    id,
    templateId: id,
    name,
    bounds: { ...bounds },
    zonePressure: 'neutral',
    replaceable: false,
    adjustable: false,
    requiresHoistRail: false,
    isDryElectricalZone: false,
    equipment: [],
    ...options,
  }
}

const nw = rect(0, 4, 0, 3)
const north = rect(5, 8, 0, 2)
const ne = rect(9, 13, 0, 3)
const sw = rect(0, 6, 5, 9)
const se = rect(7, 13, 5, 9)
const hoist = { requiresHoistRail: true }
const high = { zonePressure: 'high_pos' } as const
const normal = { zonePressure: 'normal_pos' } as const

export const defaultBlueprint = {
  rooms: [
    room('L2', 'l2_observatory', '全景气象与环境观测厅', rect(1, 5, 1, 7)),
    room('L2', 'l2_greenhouse', '阳光生态温室与休憩中庭', rect(6, 11, 1, 7)),
    room('L1', 'l1_lobby', '科研观测站门厅与展陈办公区', rect(7, 12, 1, 8)),
    room('L1', 'l1_garage', '隐蔽重载车库与物资吊装坪', rect(0, 4, 1, 8), hoist),
    room('L1', 'l1_vestibule', '外勤备勤与装甲封锁前厅', rect(5, 6, 1, 8), hoist),

    room('B1', 'b1_decon', '核生化洗消气闸与隔离缓冲舱', nw, { zonePressure: 'neg_isolation' }),
    room('B1', 'b1_logistics', '物流分拣与 AGV 调度港', north, hoist),
    room('B1', 'b1_tactical', '外勤勘探、无人机与装备整备库', ne, { adjustable: true }),
    room('B1', 'b1_warehouse', '自动化立体备件与材料总库', sw, hoist),
    room('B1', 'b1_workshop', '精密制造与综合维修工坊', se, hoist),

    room('B2', 'b2_command', '中央智控大厅与弱电数据中心', nw, { ...high, isDryElectricalZone: true }),
    room('B2', 'b2_library', '实体图书馆、档案与静谧书房', north, { ...high, replaceable: true }),
    room('B2', 'b2_medical', '综合医务室与生化分析实验室', ne, high),
    room('B2', 'b2_quarters', '10 人模块化独立居住舱区', rect(0, 5, 5, 9), high),
    room('B2', 'b2_commons', '公共餐厅、开放厨房与影音客厅', rect(6, 9, 5, 9), { ...high, adjustable: true }),
    room('B2', 'b2_gym', '综合健身房与光疗心理康复室', rect(10, 13, 5, 9), { ...high, replaceable: true }),

    room('B3', 'b3_coldvault', '战略主粮冷库与种子基因库', nw, { ...normal, ...hoist }),
    room('B3', 'b3_foodproc', '食品加工与保鲜前处理室', north, { ...normal, replaceable: true }),
    room('B3', 'b3_water', '闭环净水与废水再生总站', ne, { ...normal, ...hoist }),
    room('B3', 'b3_hydroponics', '高密度立体水培与气雾农场', rect(0, 7, 5, 9), normal),
    room('B3', 'b3_aquaponics', '鱼菜共生水产与菌菇蛋白舱', rect(8, 13, 5, 9), {
      ...normal,
      replaceable: true,
    }),

    room('B4', 'b4_cbrn_hvac', '三防新风总站与核生化滤室', nw),
    room('B4', 'b4_geothermal', '地源热泵与废热排放总站', north, hoist),
    room('B4', 'b4_drainage', '深层防渗集水与废料固化间', ne),
    room('B4', 'b4_reactor', '主能源机房：双模块微核堆与备用 CHP', sw, hoist),
    room('B4', 'b4_switchgear', '长寿储能阵与双母线强电配电中心', se, {
      ...hoist,
      isDryElectricalZone: true,
    }),
  ],
}

export const roomsOn = (floorId: FloorId) => defaultBlueprint.rooms.filter((room) => room.floorId === floorId)
