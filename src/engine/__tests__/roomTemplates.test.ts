import { describe, expect, it } from 'vitest'
import { configuredNetwork } from '../../data/mepNetwork'
import { defaultBlueprint } from '../../data/defaultBlueprint'
import { resolveRooms, roomTemplates, validateRoomChanges } from '../../data/roomTemplates'
import { footprint } from '../../geometry/coords'
import { evaluateOperations } from '../operations'
import { stationNetwork } from './networkFixture'

const point = { people: 10, scenario: 'normal' as const, hour: 10 }
const baseline = evaluateOperations(point, stationNetwork)
function install(room: string, template: string, isolatedId?: string) {
  const rooms = resolveRooms({ [room]: template })
  const net = configuredNetwork(stationNetwork, rooms)
  return { rooms, net, report: evaluateOperations({ ...point, isolatedId }, net, rooms) }
}
describe('受控模块工程实验', () => {
  for (const template of roomTemplates) for (const host of template.roomIds.concat(template.trialRoomIds)) {
    it(`${host} · ${template.name}保持原边界、设备包络与工程管线`, () => {
      const { rooms, net, report } = install(host, template.id)
      const room = rooms.find(r => r.id === host)!, original = defaultBlueprint.rooms.find(r => r.id === host)!
      expect(room.bounds).toBe(original.bounds)
      for (const other of rooms.filter(r => r.id !== host)) expect(defaultBlueprint.rooms).toContain(other)
      const bounds = footprint(room.bounds)
      const additions = room.equipment.filter(e => !original.equipment.includes(e))
      expect(additions.length).toBeGreaterThan(0)
      for (const e of additions) {
        const [x,y,z] = e.position, [w,h,d] = e.moduleSizeM
        expect(x - w/2).toBeGreaterThan(bounds.x0)
        expect(x + w/2).toBeLessThan(bounds.x1)
        expect(z - d/2).toBeGreaterThan(bounds.z0)
        expect(z + d/2).toBeLessThan(bounds.z1)
        expect(y + h).toBeLessThan(room.clearHeightOverride ?? 3)
        if (e.inputPowerKw > 0) expect(net.edges.some(edge => edge.id === e.tagCode + '-power')).toBe(true)
      }
      for (const edge of net.edges.slice(stationNetwork.edges.length).filter(e => e.kind === 'drain')) {
        expect(edge.points.at(-1)![1]).toBeLessThan(edge.points[0][1])
        if (edge.points.some(p => p[0] !== edge.points[0][0] || p[2] !== edge.points[0][2])) expect(edge.slope).toBeGreaterThan(0)
        expect(edge.points.every((p,i) => !i || p[1] <= edge.points[i-1][1])).toBe(true)
      }
      expect(report.rows.find(r => r.id === 'dry-stack')?.status).toBe(host === 'b1_tactical' ? 'FAIL' : 'PASS')
      expect(report.rows.find(r => r.id === 'tray-gap')?.status).toBe('PASS')
      expect(report.feasibility.load).not.toBe(baseline.feasibility.load)
      expect(report.feasibility.totalHeat).not.toBe(baseline.feasibility.totalHeat)
    })
  }
  it('两层床按面积联动光合氧、热量、用水；切断灌溉只使对应床离线', () => {
    const { rooms, report, net } = install('b3_foodproc', 'staple-farm')
    const beds = rooms.find(r => r.id === 'b3_foodproc')!.equipment
    const newArea = beds.reduce((s,e) => s + e.moduleSizeM[0] * e.moduleSizeM[2] * 0.8 * 2, 0)
    expect(report.feasibility.stapleArea - baseline.feasibility.stapleArea).toBeCloseTo(newArea)
    for (const k of ['photoOxygen','kcal','netWater'] as const) expect(report.feasibility[k]).toBeGreaterThan(baseline.feasibility[k])
    const edge = beds[0].tagCode + '-water'
    expect(net.traceWater(edge).size).toBeGreaterThan(4)
    const isolated = evaluateOperations({ ...point, isolatedId: edge }, net, rooms)
    expect(isolated.maintenance?.offlineTags).toContain(beds[0].tagCode)
    expect(isolated.maintenance?.offlineTags).not.toContain(beds[1].tagCode)
    expect(isolated.feasibility.stapleArea).toBeCloseTo(report.feasibility.stapleArea - newArea/2)
  })
  it('失去新增电池列或独立事故排烟管时扣除该列容量', () => {
    const { rooms, net, report } = install('b1_gym','battery-bank')
    expect(report.feasibility.batteryEnergy).toBeCloseTo(baseline.feasibility.batteryEnergy * 2)
    const bank = rooms.find(r => r.id === 'b1_gym')!.equipment[0]
    expect(report.rows.find(r => r.id === 'battery-exhaust')?.status).toBe('PASS')
    expect(report.rows.find(r => r.id === 'freight-b1_gym')?.status).toBe('FAIL')
    const vent = bank.servicePorts![0].id + '-riser'
    expect(evaluateOperations({ ...point, isolatedId: vent }, net, rooms).rows.find(r => r.id === 'battery-exhaust')?.status).toBe('FAIL')
    for (const id of [bank.tagCode, bank.tagCode + '-power', vent]) {
      const isolated = evaluateOperations({ ...point, isolatedId: id }, net, rooms)
      expect(isolated.feasibility.batteryEnergy).toBeCloseTo(baseline.feasibility.batteryEnergy * 1.5)
    }
  })
  it('固定房间、井位和跨功能分区的导入都被拒绝；撤销返回同一基准数据', () => {
    for (const target of ['b4_switchgear', 'l1_lobby', 'b2_command', 'b3_aquaponics', 'freight', '__proto__'])
      expect(() => validateRoomChanges({ [target]: 'battery-bank' })).toThrow()
    expect(resolveRooms({})).toBe(defaultBlueprint.rooms)
    expect(configuredNetwork(install('b1_gym','battery-bank').net, resolveRooms({}))).toBe(stationNetwork)
    const trial = install('b1_tactical','staple-farm')
    expect(trial.report.rows.find(r => r.id === 'dry-stack')?.roomId).toBe('b2_command')
  })
})
