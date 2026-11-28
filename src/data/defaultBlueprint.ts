import { bedrooms } from '../geometry/residentialPlan'
import { atriumBounds } from '../geometry/atrium'
import { roomLayouts } from './roomLayouts'
import { gridRect as rect } from './floors'
import type { FloorId, GridBounds, RoomInstance, ServicePort } from '../types/shelter'

type Options = Partial<Omit<RoomInstance, 'id' | 'name' | 'floorId' | 'bounds' | 'templateId'>>
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
    wetDryZone: 'dry',
    zonePressure: 'neutral',
    replaceable: false,
    adjustable: false,
    corridorGlazing: false,
    requiresHoistRail: false,
    isDryElectricalZone: false,
    ...roomLayouts[id],
    ...options,
  }
}
const nw = rect(0, 3, 0, 4),
  north = rect(4, 9, 0, 2),
  ne = rect(11, 15, 0, 4)
const sw = rect(0, 8, 6, 11),
  se = rect(9, 15, 6, 11)
const hoist = { requiresHoistRail: true }
const high = { zonePressure: 'high_pos' } as const
const normal = { zonePressure: 'normal_pos' } as const
const wet = { wetDryZone: 'wet' } as const
const dryColumn = { wetDryZone: 'strict_dry_electrical' } as const

function dutySanitary(floor: 'B1' | 'B3' | 'B4'): ServicePort[] {
  return [
    {
      id: floor + '-WC',
      system: 'duty-sanitary',
      floor,
      position: [-8.2, 0.25, -3.65],
      connectsTo: { floor, shaft: 'wet', position: [-7.7, 0.24, -3.65] },
    },
  ]
}

export const defaultBlueprint = {
  version: '2.1',
  rooms: [
    room('L2', 'l2_observatory', '全景气象与环境观测厅', rect(2, 8, 1, 8)),
    room('L2', 'l2_greenhouse', '阳光生态温室与休憩中庭', rect(9, 13, 1, 8), {
      ...wet,
      wetBounds: rect(9, 13, 5, 8),
    }),
    room('L1', 'l1_garage', '重载车库与物资吊装坪', rect(0, 6, 1, 9), hoist),
    room('L1', 'l1_vestibule', '员工过渡与互锁气闸', rect(7, 9, 1, 9)),
    room('L1', 'l1_lobby', '科研站公开门厅与科普展厅', rect(10, 14, 1, 9)),

    room('B1', 'b1_decon', '洗消气闸与隔离缓冲舱', nw, {
      ...wet,
      zonePressure: 'neg_isolation',
      servicePorts: dutySanitary('B1'),
    }),
    room('B1', 'b1_logistics', '物流分拣与 AGV 调度港', north, hoist),
    room('B1', 'b1_tactical', '外勤勘探、无人机与地质装备库', ne, { ...dryColumn, adjustable: true }),
    room('B1', 'b1_gym', '综合健身房与光疗康复室', rect(0, 3, 6, 11), { ...normal, replaceable: true }),
    room('B1', 'b1_workshop', '精密制造与综合维修工坊', rect(4, 7, 6, 11), hoist),
    room('B1', 'b1_warehouse', '自动化立体备件与材料总库', rect(8, 15, 6, 11), hoist),

    room('B2', 'b2_medical', '综合医务室与生化分析实验室', nw, { ...wet, zonePressure: 'neg_isolation' }),
    room('B2', 'b2_library', '实体图书馆、工程档案与书房', north, {
      ...high,
      replaceable: true,
      clearHeightOverride: 3.6,
    }),
    room('B2', 'b2_command', '中央智控大厅与弱电数据中心', ne, {
      ...high,
      ...dryColumn,
      isDryElectricalZone: true,
    }),
    room('B2', 'b2_commons', '公共餐厅、开放厨房与影音客厅', rect(0, 4, 6, 11), {
      ...high,
      wetDryZone: 'semi_wet',
      adjustable: true,
      clearHeightOverride: 3.6,
      corridorGlazing: true,
      atriumVoidToBelow: atriumBounds,
    }),
    room('B2', 'b2_bath_laundry', '公共卫生间、淋浴与洗烘房', rect(5, 6, 6, 11), {
      ...normal,
      ...wet,
      servicePorts: [
        {
          id: 'B2-GW',
          system: 'greywater',
          floor: 'B2',
          position: [-5.8, 0.1, 1.55],
          plenumEntry: { floor: 'B3', position: [-5.8, 3.36, 1.55] },
          connectsTo: { floor: 'B3', shaft: 'wet', position: [-7.52, 3.28, -3.45] },
        },
      ],
      dailyWaterBudget: { people: 10, greyLitres: 650, blackLitres: 60 },
    }),
    room('B2', 'b2_quarters', '常住卧室、备勤宿舍与东侧疏散前室', rect(7, 15, 6, 11), {
      ...high,
      sleepingRooms: bedrooms,
      servicePorts: bedrooms.map(({ id, x0, z0, z1 }) => ({
        id: id + '-sleeve',
        system: 'acoustic-sleeve',
        floor: 'B2',
        position: [x0 + 0.38, 3.45, z0 === 0 ? z1 : z0],
      })),
    }),

    room('B3', 'b3_water', '闭环净水与废水再生总站', nw, {
      ...normal,
      ...wet,
      ...hoist,
      servicePorts: dutySanitary('B3'),
    }),
    room('B3', 'b3_foodproc', '食品加工与保鲜前处理室', north, {
      ...normal,
      wetDryZone: 'semi_wet',
      replaceable: true,
    }),
    room('B3', 'b3_coldvault', '战略主粮冷库与种子库', ne, { ...normal, ...dryColumn, ...hoist }),
    room('B3', 'b3_hydroponics', '分层水培与主粮农场', sw, { ...normal, ...wet, corridorGlazing: true }),
    room('B3', 'b3_aquaponics', '鱼菜共生与菌菇蛋白舱', se, {
      ...normal,
      ...wet,
      replaceable: true,
      corridorGlazing: true,
    }),

    room('B4', 'b4_drainage', '深层集水、重力外排与废料间', nw, {
      ...normal,
      ...wet,
      servicePorts: dutySanitary('B4'),
    }),
    room('B4', 'b4_geothermal', '地源热泵与供热分配总站', north, { ...normal, ...wet, ...hoist }),
    room('B4', 'b4_switchgear', '储能与双母线配电中心', ne, {
      ...normal,
      ...dryColumn,
      ...hoist,
      isDryElectricalZone: true,
    }),
    room('B4', 'b4_reactor', '主能源机房与备用 CHP', sw, { ...normal, ...hoist }),
    room('B4', 'b4_cbrn_hvac', '三防新风与电解制氧站', se, { ...normal, ...wet }),
  ],
}
export const roomsOn = (id: FloorId) => defaultBlueprint.rooms.filter((r) => r.floorId === id)
