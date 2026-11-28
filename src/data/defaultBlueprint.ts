import { bedrooms } from '../geometry/residentialPlan'
import { atriumBounds } from '../geometry/atrium'
import { roomLayouts } from './roomLayouts'
import { gridRect as rect } from './floors'
import type { FloorId, GridBounds, RoomInstance } from '../types/shelter'

type Options = Partial<Omit<RoomInstance, 'id' | 'name' | 'floorId' | 'bounds'>>
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
    name,
    bounds: { ...bounds },
    wetDryZone: 'dry',
    zonePressure: 'neutral',
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

export const defaultBlueprint = {
  version: '3.0',
  rooms: [
    room('L2', 'l2_observatory', '山景瞭望客厅与监控哨位', rect(2, 8, 1, 8)),
    room('L2', 'l2_greenhouse', '阳光花房与休闲茶室', rect(9, 13, 1, 8), {
      ...wet,
      wetBounds: rect(9, 13, 5, 8),
    }),
    room('L1', 'l1_garage', '重装车库与 3T 货梯装卸坪', rect(0, 6, 1, 9), hoist),
    room('L1', 'l1_vestibule', '防爆主入口与核心电梯厅', rect(7, 9, 1, 9)),
    room('L1', 'l1_lobby', '户外防寒装备更衣与预检间', rect(10, 14, 1, 9)),

    room('B1', 'b1_decon', '西平硐洗消与应急气闸', nw, {
      ...wet,
      zonePressure: 'neg_isolation',
    }),
    room('B1', 'b1_logistics', '货梯拆箱转运与重工具间', north, hoist),
    room('B1', 'b1_tactical', '武器、防护与战术工具库', ne, dryColumn),
    room('B1', 'b1_gym', '力量健身与体能恢复室', rect(0, 3, 6, 11), normal),
    room('B1', 'b1_workshop', '综合制造与机电维修工坊', rect(4, 7, 6, 11), hoist),
    room('B1', 'b1_warehouse', '战略物资与粮储主仓库', rect(8, 15, 6, 11), hoist),

    room('B2', 'b2_medical', '家庭诊疗急救与药房', nw, { ...wet, zonePressure: 'neg_isolation' }),
    room('B2', 'b2_library', '安静书房与实体藏书室', north, {
      ...high,
      clearHeightOverride: 3.6,
    }),
    room('B2', 'b2_command', '私人影音厅与游戏休闲室', ne, {
      ...high,
      ...dryColumn,
      isDryElectricalZone: true,
    }),
    room('B2', 'b2_commons', '客厅与开放厨房', rect(0, 4, 6, 11), {
      ...high,
      wetDryZone: 'semi_wet',
      clearHeightOverride: 3.6,
      corridorGlazing: true,
      atriumVoidToBelow: atriumBounds,
    }),
    room('B2', 'b2_bath_laundry', '干湿分离卫浴、桑拿与洗烘房', rect(5, 6, 6, 11), {
      ...normal,
      ...wet,
    }),
    room('B2', 'b2_quarters', '6–8 人宽敞私人卧室与逃生前室', rect(7, 15, 6, 11), {
      ...high,
      sleepingRooms: bedrooms,
    }),

    room('B3', 'b3_water', '净水循环与大容量储备水库', nw, {
      ...normal,
      ...wet,
      ...hoist,
    }),
    room('B3', 'b3_foodproc', '采收清洗与真空打包间', north, {
      ...normal,
      wetDryZone: 'semi_wet',
    }),
    room('B3', 'b3_coldvault', '大型低温冷库与恒温酒窖', ne, { ...normal, ...dryColumn, ...hoist }),
    room('B3', 'b3_hydroponics', '立体叶菜与主粮水培农场', sw, { ...normal, ...wet, corridorGlazing: true }),
    room('B3', 'b3_aquaponics', '鱼菜共生与鲜蔬种植舱', se, {
      ...normal,
      ...wet,
      corridorGlazing: true,
    }),

    room('B4', 'b4_drainage', '深层集水泵房与废料间', nw, {
      ...normal,
      ...wet,
    }),
    room('B4', 'b4_geothermal', '地热供暖与换热总站', north, { ...normal, ...wet, ...hoist }),
    room('B4', 'b4_switchgear', '大容量储能电池与配电中心', ne, {
      ...normal,
      ...dryColumn,
      ...hoist,
      isDryElectricalZone: true,
    }),
    room('B4', 'b4_reactor', '静音柴油机房与地下油库', sw, { ...normal, ...hoist }),
    room('B4', 'b4_cbrn_hvac', '三防新风过滤与空气循环站', se, { ...normal, ...wet }),
  ],
}
export const roomsOn = (id: FloorId) => defaultBlueprint.rooms.filter((r) => r.floorId === id)
