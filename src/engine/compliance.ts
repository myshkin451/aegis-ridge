import type { MepNetwork } from '../data/mepNetwork'
import { doors } from '../geometry/doors'
import type { RoomInstance } from '../types/shelter'
import type { evaluateFeasibility } from './feasibility'
import { batterySmoke, checkGeometry } from './geometryChecks'
import { fitsFreight, hoistReachable, transportRoute } from './maintenance'
import type { Diagnostic } from './model'

function inspectFreight(
  rooms: RoomInstance[],
  network: MepNetwork,
  isolatedId?: string | null,
): Diagnostic[] {
  return rooms
    .filter((room) => room.requiresHoistRail)
    .map((room) => {
      const route = transportRoute(room, network, isolatedId ?? undefined)
      const door =
        doors.find(
          (d) => d.floor === room.floorId && d.zones.includes('freight') && d.zones.includes(room.id),
        ) ?? doors.find((d) => d.id === room.id)
      const installed = room.equipment
      const oversized = installed.filter(
        (unit) =>
          !fitsFreight(unit) || (door && Math.min(unit.moduleSizeM[0], unit.moduleSizeM[2]) > door.width),
      )
      const heavy = [...oversized].sort((a, b) => b.weightKg - a.weightKg)[0]
      const connected = hoistReachable(room, network, isolatedId)
      const accessible = route.length > 0 && connected
      return {
        id: 'freight-' + room.id,
        label: room.floorId + ' · ' + room.name + '换件',
        status: oversized.length || !accessible ? 'FAIL' : 'PASS',
        roomId: room.id,
        equipmentTag: heavy?.tagCode,
        value: accessible ? oversized.length + ' 件超限' : '搬运不通',
        detail: heavy
          ? heavy.tagCode +
            ' 整装 ' +
            heavy.moduleSizeM.join(' × ') +
            ' m，' +
            heavy.weightKg +
            ' kg。蓝图未提供已验证的拆分包络。'
          : '整件须通过真实门洞、货运通路及 1.6 × 2.1 × 1.6 m / 2,500 kg 设计限值。',
      }
    })
}

// An M3 network and blueprint are immutable after construction. Recheck geometry
// when either reference changes; occupancy/time edits only update operating rows.
const surveyed = new WeakMap<MepNetwork, WeakMap<RoomInstance[], Diagnostic[]>>()
export function evaluateCompliance(
  rooms: RoomInstance[],
  network: MepNetwork | null,
  f: ReturnType<typeof evaluateFeasibility>,
  isolatedId?: string | null,
) {
  let rows: Diagnostic[] = []
  if (network) {
    const cache = surveyed.get(network) ?? new WeakMap<RoomInstance[], Diagnostic[]>()
    surveyed.set(network, cache)
    const cached = cache.get(rooms)
    if (cached) rows = cached
    else {
      rows = [...checkGeometry(rooms, network), ...inspectFreight(rooms, network)]
      cache.set(rooms, rows)
    }
  }
  const isolated = network?.edges.find(edge => edge.id === isolatedId)
  if (network && isolated?.kind === 'exhaust') {
    const connected = { ...network, edges: network.edges.filter(edge => edge !== isolated) }
    rows = rows.map(row => row.id === 'battery-exhaust' ? batterySmoke(rooms, connected) : row)
  }
  if (network && isolated?.kind === 'freight')
    rows = [
      ...rows.filter((r) => !r.id.startsWith('freight-')),
      ...inspectFreight(rooms, network, isolatedId),
    ]
  const chp: Diagnostic = {
    id: 'chp',
    label: 'CHP 进排气联锁',
    roomId: 'b4_reactor',
    equipmentTag: 'CHP-442',
    status: f.chpInterlocked && (f.chpCapacity > 0 || f.chpOutput > 0) ? 'FAIL' : 'PASS',
    value: f.chpInterlocked ? (f.sealed ? '密闭闭锁' : '预闭锁') : f.chpCapacity + ' kWe 可用',
    detail:
      '外部进排气许可、独立管道与设备隔离共同决定可用出力。当前供电 ' + f.chpOutput.toFixed(1) + ' kW。',
  }
  const surface: Diagnostic = {
    id: 'recovered-heat',
    label: '地表有用供热',
    roomId: 'b4_geothermal',
    equipmentTag: 'MH-421',
    status: f.sealed ? 'PASS' : f.surfaceCapacity > 0 ? 'PASS' : 'WARN',
    value: f.surfaceCapacity.toFixed(1) + ' kWth',
    detail: '按室内外温差、积雪融化需求和分集水器上限计算。未选型的干冷与谷底热汇不计入排热能力。',
  }
  return [...rows, chp, surface]
}
