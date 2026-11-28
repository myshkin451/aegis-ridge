import { defaultBlueprint } from './defaultBlueprint'
import { footprint } from '../geometry/coords'
import { groundAt, type TerrainAtlas } from '../geometry/siteElevations'
import type { RoomInstance, Point3 } from '../types/shelter'
import { local, NetworkBuilder, portPoint, type MepNetwork } from './mepNetworkSchema'

// Preserve surveyed network IDs across independent room edits. Exported isolation IDs
// must still identify the same physical branch when another room changes.
export function connectModuleBranches(base: MepNetwork, atlas: TerrainAtlas, rooms: RoomInstance[]) {
  const b = new NetworkBuilder(atlas)
  b.nodes.push(...base.nodes)
  b.edges.push(...base.edges)
  const find = (id: string) => b.nodes.find(n => n.id === id)!
  for (const room of rooms.filter(r => r.templateId !== r.id)) {
    const f = room.floorId, rect = footprint(room.bounds)
    const original = defaultBlueprint.rooms.find(r => r.id === room.id)!
    const units = room.equipment.filter(e => !original.equipment.includes(e))
    const supplyStub = find(room.id + '-use')
    let returnStub
    if (units.some(e => e.cropKind)) {
      if (supplyStub) {
        // The original fixture used one node for both services. A multi-bed bay has distinct
        // supply and waste headers at that datum so flow cannot cycle back into the potable stub.
        returnStub = b.node(room.id + '-return-tee', f, supplyStub.position, 'junction', '灌溉回水汇合', room.id)
        const i = b.edges.findIndex(edge => edge.from === supplyStub.id && edge.kind === 'drain')
        if (i < 0) throw new Error(room.name + '缺少可复用的回水支管。')
        b.edges[i] = { ...b.edges[i], from: returnStub.id }
      } else {
        const collector = find('upper-grey')
        returnStub = b.node(room.id + '-return-tee', 'B2', local('B2', collector.position[0], 3.24, collector.position[2]))
        b.edge('drain', 'B2', returnStub, collector, [], { medium: '灌溉回水汇合' }).id = room.id + '-trial-return'
      }
    }
    const a = find('A-' + room.id), backup = find('B-' + room.id)
    const feeder = b.node(room.id + '-module-board', f, [a.position[0], a.position[1], a.position[2] - 0.14], 'junction', '模块双电源箱', room.id)
    for (const [bus, source] of [['A', a], ['B', backup]] as const)
      b.edge('power', f, source, feeder, [[source.position[0], feeder.position[1], feeder.position[2]]], { medium: '模块配电' }).id = room.id + '-module-bus-' + bus
    for (const e of units) {
      const [x, , z] = e.position
      if (e.inputPowerKw > 0) {
        const source = feeder
        const at: Point3 = [x, source.position[1], z]
        const socket = b.node(e.tagCode + '-feed', f, at, 'fixture', '设备电源接线盒', room.id)
        const turn: Point3 = room.clearHeightOverride ? [x, at[1], source.position[2]] : [source.position[0], at[1], z]
        b.edge('power', f, source, socket, [turn], { medium: '设备支线' }).id = e.tagCode + '-power'
      }
      if (e.cropKind) {
        // The two production bays reuse their existing supply and waste stub. The NE experiment
        // needs a physical branch from the corridor; its crossing remains visible to compliance.
        const source = supplyStub ?? find('potable-' + f)
        const inlet = b.node(e.tagCode + '-tap', f, local(f, x, 0.54, z), 'fixture', '水培补水', room.id)
        const h = local(f, x, 3.54, z)[1]
        const path: Point3[] = [[source.position[0], h, source.position[2]]]
        const lane = supplyStub ? source.position[2] : -1.3
        path.push([source.position[0], h, lane], [x, h, lane], [x, h, z])
        b.edge('supply', f, source, inlet, path, { medium: '灌溉补水' }).id = e.tagCode + '-water'
        const drain = returnStub!
        const y = supplyStub ? drain.position[1] + 0.075 : local(f, 0, -0.64, 0)[1]
        const drainLane = supplyStub ? drain.position[2] : -0.6
        const under = supplyStub ? f : 'B2'
        const fall: Point3[] = [[x, y, z], [x, y - 0.025, drainLane], [drain.position[0], y - 0.06, drainLane]]
        b.edge('drain', under, inlet, drain, fall, { medium: '水培排水' }).id = e.tagCode + '-drain'
      }
      for (const port of e.servicePorts ?? []) {
        if (port.system !== 'battery-exhaust' || !port.connectsTo) continue
        const start = b.node(port.id, f, portPoint(port), 'plant', '事故排烟', room.id)
        const socket = b.node(port.id + '-socket', f, portPoint(port.connectsTo))
        const endZ = rect.z1 + 2.25
        const end = b.node(port.id + '-terminal', f, [x, groundAt(atlas, x, endZ).height + 2.8, endZ], 'outlet', '独立排烟口')
        b.edge('exhaust', f, start, socket, [[x, socket.position[1], start.position[2]]], { medium: '储能事故排烟' }).id = port.id + '-branch'
        b.edge('exhaust', f, socket, end, [[x, socket.position[1], endZ]], { outside: true, medium: '储能事故排烟' }).id = port.id + '-riser'
      }
    }
  }
  return b.finish()
}
