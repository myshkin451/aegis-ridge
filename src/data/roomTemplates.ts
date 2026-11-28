import { footprint } from '../geometry/coords'
import type { EquipmentUnit, Point3, RoomInstance } from '../types/shelter'
import { defaultBlueprint } from './defaultBlueprint'
import { unit } from './roomLayouts/schema'

export type RoomChanges = Record<string, string>
interface RoomTemplate {
  id: string
  name: string
  description: string
  roomIds: string[]
  trialRoomIds: string[]
  wetDryZone: RoomInstance['wetDryZone']
  install: (room: RoomInstance) => EquipmentUnit[]
}
const station = (r: RoomInstance) => r.id.toUpperCase().replace('_', '-')
function stapleBeds(room: RoomInstance) {
  const r = footprint(room.bounds)
  // The NE trial fits one compact demonstrator in the remaining clear bay. It retains the field instruments.
  const trial = room.id === 'b1_tactical'
  const shortBay = room.id === 'b3_foodproc'
  const depth = trial ? 2.0 : shortBay ? 2.65 : r.d - 3.2
  const positions = trial ? [9.25] : shortBay
    ? [r.x - 1.65, r.x + 1.65] : [r.x0 + 1.7, r.x - 2.5, r.x + 2.5, r.x1 - 1.7]
  return positions.map((x, index) => unit(`GR-650-${station(room)}-${index + 1}`, '双层块茎床与循环补光', 'agriculture',
    [x, 0, trial ? -4 : shortBay ? r.z0 + 2.05 : r.z], [1.72, 2.59, depth], Math.round(66 * depth),
    Number((0.3 * 1.72 * depth * 2 * 0.8).toFixed(3)), {
      cropKind: 'staple', visualKind: 'GR-332', serviceIntervalDays: 120,
      notes: '概念选型：两层有效床面率 80%，补光和循环合计 300 W/m² 有效床面，20:00–12:00 运行。',
    }))
}
function batteries(room: RoomInstance) {
  const r = footprint(room.bounds)
  return [-2, 2].map((offset, index) => {
    const x = r.x + offset, z = r.z + 1.1, id = `BAT-650-${station(room)}-${index + 1}`
    return unit(id, '扩容储能柜列 ' + (index + 1), 'power', [x, 0, z], [2.18, 2.78, 5.95], 9100, 1.2, {
      visualKind: 'BAT-431', storageKwh: 1000, inverterKw: 100, hasRunawayVent: true, serviceIntervalDays: 90,
      requiredSpareType: 'electronic', notes: '每列 1,000 kWh，逆变上限 100 kW；额定质量包含柜架与防火分隔，整列超出货梯限额，抽屉与结构分件的换件路线尚未验证。',
      servicePorts: [{ id: id + '-vent', system: 'battery-exhaust', floor: room.floorId, position: [x, 2.56, z + 2.88],
        connectsTo: { floor: room.floorId, position: [x, 3.38, r.z1 + 0.4] } }],
    })
  })
}
function listening(room: RoomInstance) {
  const r = footprint(room.bounds), key = station(room)
  return [
    unit('AV-' + key, '投影幕、吸音墙与监听音箱', 'comms', [r.x, 0, r.z1 - 0.74], [Math.min(7, r.w - 1.6), 2.5, 0.9], 165, 0.68,
      { visualKind: 'listening-wall', requiredSpareType: 'electronic', notes: '含投影、监听放大器与声学处理，额定交流输入 680 W。' }),
    ...[-1, 1].map((side, i) => unit('SEAT-' + key + '-' + i, '双人听音座', 'medical',
      [r.x + side * 1.55, 0, r.z0 + r.d * 0.42], [2.05, 0.98, 1.04], 46, 0, { visualKind: 'listening-seat' })),
  ]
}
function recycling(room: RoomInstance) {
  const r = footprint(room.bounds), key = station(room)
  return [
    unit('RC-' + key, '干式材料粉碎分选机', 'manufacturing', [r.x0 + 1.8, 0, r.z + 1], [2.1, 2.45, 2.75], 720, 7.5,
      { visualKind: 'recycling-mill', vibrationIsolation: '弹性底座', serviceIntervalDays: 60, requiredSpareType: 'structural', notes: '冷态回收洁净热塑料边角料，7.5 kW 电机，设计吞吐量 60 kg/h。' }),
    unit('SEP-' + key, '密闭筛分与袋式除尘', 'hvac', [r.x1 - 1.65, 0, r.z + 1], [1.6, 2.42, 1.9], 265, 1.5,
      { visualKind: 'filter-hopper', serviceIntervalDays: 45, requiredSpareType: 'precision_filter', notes: '概念风量 900 m³/h，滤袋回收粉屑。' }),
    unit('SORT-' + key, '材质分拣与批次称量台', 'manufacturing', [r.x, 0, r.z1 - 1.25], [2.3, 1.46, 1.26], 46, 0.025,
      { visualKind: 'AG-333' }),
  ]
}
export const roomTemplates: RoomTemplate[] = [
  { id: 'staple-farm', name: '第二主粮水培仓', description: '双层块茎床 · 16 h 光周期 · 灌溉与排水', wetDryZone: 'wet', roomIds: ['b3_foodproc', 'b3_aquaponics'], trialRoomIds: ['b1_tactical'], install: stapleBeds },
  { id: 'battery-bank', name: '储能扩容与独立排烟仓', description: '2 × 1,000 kWh · 两列独立事故排烟', wetDryZone: 'dry', roomIds: ['b1_gym'], trialRoomIds: [], install: batteries },
  { id: 'listening-room', name: '影音音乐疗愈室', description: '吸音墙 · 双声道监听 · 四人听音座', wetDryZone: 'dry', roomIds: ['b1_gym', 'b2_library'], trialRoomIds: [], install: listening },
  { id: 'materials-recovery', name: '材料分选与冷态回收室', description: '干式粉碎与筛分 · 额定处理量 60 kg/h', wetDryZone: 'dry', roomIds: ['b1_gym'], trialRoomIds: [], install: recycling },
]
export function validateRoomChanges(value: unknown): RoomChanges {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new Error('模块变更必须是房间编号到模板编号的对象。')
  const changes: RoomChanges = {}
  for (const [roomId, templateId] of Object.entries(value)) {
    const room = defaultBlueprint.rooms.find(r => r.id === roomId)
    const t = roomTemplates.find(t => t.id === templateId)
    if (!room || !t || !(room.replaceable && t.roomIds.includes(roomId) || room.adjustable && t.trialRoomIds.includes(roomId)))
      throw new Error(`模块变更 ${roomId} 无效：房间或模板不存在，或该分区禁止安装此模板。`)
    changes[roomId] = t.id
  }
  return changes
}
// Eye and target stay in the original survey frame, with the seated listeners and crop beds clear of the approach.
function moduleAnchor(room: RoomInstance, templateId: string) {
  const b = footprint(room.bounds)
  let position: Point3, target: Point3
  if (templateId === 'listening-room') {
    position = [b.x + 0.23, 1.65, b.z0 + 0.88]
    target = [b.x, 1.31, b.z1 - 0.84]
  } else if (templateId === 'staple-farm' && room.id === 'b3_foodproc') {
    position = [b.x + 0.08, 1.65, b.z1 - 0.98]
    target = [b.x, 1.29, b.z0 + 1.85]
  } else if (templateId === 'staple-farm' && room.id === 'b1_tactical') {
    position = [12.1, 1.65, -6.85]
    target = [9.25, 1.2, -4.0]
  } else if (templateId === 'staple-farm') {
    position = [b.x + 0.2, 1.65, b.z0 + 1.13]
    target = [b.x - 0.4, 1.32, b.z1 - 1.9]
  } else if (templateId === 'battery-bank') {
    position = [b.x - 0.52, 1.65, b.z0 + 1.16]
    target = [b.x + 0.38, 1.36, b.z + 2.3]
  } else {
    position = [b.x - 0.44, 1.65, b.z0 + 1.38]
    target = [b.x - 0.3, 1.24, b.z + 1.15]
  }
  return { position, target }
}
const installed = new Map<string, RoomInstance>()
export function resolveRooms(value: RoomChanges) {
  const changes = validateRoomChanges(value)
  if (!Object.keys(changes).length) return defaultBlueprint.rooms
  return defaultBlueprint.rooms.map(room => {
    const template = roomTemplates.find(t => t.id === changes[room.id])
    if (!template) return room
    const key = room.id + '/' + template.id
    let resolved = installed.get(key)
    if (resolved) return resolved
    const equipment = template.install(room), trial = template.trialRoomIds.includes(room.id)
    resolved = { ...room, templateId: template.id, name: template.name + (trial ? '（东北试装）' : ''),
      wetDryZone: template.wetDryZone, requiresHoistRail: room.requiresHoistRail || template.id === 'battery-bank',
      equipment: trial ? room.equipment.concat(equipment) : equipment,
      cameraAnchors: [{ name: template.name + '操作面', ...moduleAnchor(room, template.id) }],
    }
    // Attribute only the demonstrator's footprint to the wet process.
    if (trial) resolved.wetBounds = { gx0: 12, gx1: 13, gz0: 3, gz1: 4 }
    installed.set(key, resolved)
    return resolved
  })
}
