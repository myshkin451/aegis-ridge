import { footprint, shaftPlans } from '../geometry/coords'
import { quietHall } from '../geometry/residentialPlan'
import { roomsOn } from './defaultBlueprint'
import { BRANCH_CORRIDOR, CORRIDOR, FLOOR_ORDER } from './floors'
import { local, NetworkBuilder, portPoint, type MepNode } from './mepNetworkSchema'
import type { FloorId, Point3, RoomInstance } from '../types/shelter'

const electric = shaftPlans.find((s) => s.id === 'electrical')!
const wet = shaftPlans.find((s) => s.id === 'wet')!
const corridor = footprint(CORRIDOR),
  branch = footprint(BRANCH_CORRIDOR)
type Service = 'A' | 'B' | 'LV' | 'SA' | 'RA'
const routes = {
  A: { kind: 'power', x: electric.x - 0.7, z: -4.72, h: 3.77, lane: -1.8, offset: -0.22 },
  B: { kind: 'power', x: electric.x - 0.36, z: -4.42, h: 3.77, lane: -1.54, offset: 0.04 },
  LV: { kind: 'data', x: electric.x + 0.7, z: -3.65, h: 3.12, lane: -0.3, offset: 0.32 },
  SA: { kind: 'airSupply', x: wet.x + 0.62, z: -4.85, h: 3.46, lane: -1.08, offset: -0.42 },
  RA: { kind: 'airReturn', x: wet.x + 0.21, z: -4.48, h: 3.45, lane: -0.74, offset: 0.45 },
} as const

function branchPosition(room: RoomInstance, offset: number): [number, number] {
  const r = footprint(room.bounds)
  if (room.floorId.startsWith('L')) return [r.x + offset, r.z + offset]
  if (room.id === 'b2_quarters') return [-1 + offset, quietHall.z0 + 0.52]
  // Serve the middle of the north wing through gx=10, clear of the lift and stair.
  if (r.z1 < corridor.z0) return [branch.x + offset, r.z1 - 0.75 + offset]
  // Sidewall inlet/surface chase at the high commons; the atrium begins at z=2.
  return [Math.min(corridor.x1 - 0.6, r.x) + offset, r.z0 >= 0 ? r.z0 + 0.94 + offset : r.z1 - 1.24 + offset]
}

function serviceFloor(b: NetworkBuilder, floor: FloorId, service: Service, riser: MepNode) {
  const { kind, x, h, lane, offset } = routes[service]
  const air = service === 'SA' || service === 'RA',
    reverse = service === 'RA'
  function link(a: MepNode, c: MepNode, via: Point3[] = []) {
    return b.edge(kind, floor, reverse ? c : a, reverse ? a : c, reverse ? via.reverse() : via)
  }
  const header = b.node(service + '-header-' + floor, floor, local(floor, x, h, lane))
  link(riser, header)
  const rooms = roomsOn(floor)
  const ports = rooms.map((room) => {
    const point = branchPosition(room, offset)
    if (room.clearHeightOverride && service === 'LV') {
      // The raised ceiling only has 0.3m left. Route communications beside
      // the busways there, rising at the far side of each corridor penetration.
      if (room.id === 'b2_library') point[1] = -8.4
      else point[0] += 1.6
    }
    return point
  })
  const taps = b.header(
    kind,
    header,
    0,
    ports.map((p) => p[0]),
    reverse,
  )
  for (const [i, room] of rooms.entries()) {
    const [tapX, endZ] = ports[i],
      tap = taps.get(tapX)!
    const r = footprint(room.bounds)
    const northWing = !floor.startsWith('L') && r.z1 < corridor.z0
    const raised = !!room.clearHeightOverride
    let endX = tapX
    if (northWing) endX = r.x1 - 0.8 + offset
    const roomZ = endZ
    const highCable = raised && service === 'LV'
    const endHeight = highCable ? 3.74 : h
    const purpose =
      service === 'SA'
        ? '送风'
        : service === 'RA'
          ? '回风'
          : service === 'LV'
            ? '房间弱电配线'
            : service + ' 母线隔离断路器'
    const terminal = b.node(
      service + '-' + room.id,
      floor,
      local(
        floor,
        endX,
        air ? (room.clearHeightOverride ?? (floor.startsWith('L') ? 3.6 : 3)) : endHeight,
        roomZ,
      ),
      air ? 'grille' : 'fixture',
      purpose,
      room.id,
    )
    const via: Point3[] = []
    const ductHeight = raised && air ? 3.76 : endHeight
    if (northWing) {
      via.push(local(floor, tapX, h, roomZ))
      if (highCable) via.push(local(floor, r.x1 + 0.2, h, roomZ), local(floor, r.x1 + 0.2, ductHeight, roomZ))
      else via.push(local(floor, tapX, ductHeight, roomZ))
    } else if (raised) via.push(local(floor, tapX, ductHeight, lane))
    via.push(local(floor, endX, ductHeight, roomZ))
    link(tap, terminal, via)
    if (room.id === 'b2_quarters' && service === 'SA') {
      const entry = b.node('SA-quiet-hall', floor, local(floor, tapX, 3.45, 6))
      link(tap, entry, [local(floor, tapX, 3.45, lane)])
      const sleeves = room.servicePorts!.filter((p) => p.system === 'acoustic-sleeve')
      const sockets = b.header(
        kind,
        entry,
        0,
        sleeves.map((p) => p.position[0]),
      )
      for (const p of sleeves) {
        const socket = b.node(p.id, floor, portPoint(p))
        const [sx, , sz] = p.position
        const insideZ = sz + (sz > 6 ? 0.62 : -0.62)
        const outlet = b.node(
          'SA-' + p.id,
          floor,
          local(floor, sx, 3, insideZ),
          'grille',
          '卧室送风',
          room.id,
        )
        link(sockets.get(sx)!, socket)
        link(socket, outlet, [local(floor, sx, 3.45, insideZ)])
      }
    }
  }
}

export function buildDistribution(b: NetworkBuilder) {
  const services: Service[] = ['A', 'B', 'LV', 'SA', 'RA']
  for (const service of services) {
    const r = routes[service]
    const air = service === 'SA' || service === 'RA'
    const nodes = new Map<FloorId, MepNode>()
    for (const f of [...FLOOR_ORDER].reverse()) {
      // Surface rooms have a 0.5 m plenum. Their electrical/data penetrations
      // stay apart in plan as well as within the split electrical shaft.
      const surface = f.startsWith('L')
      const h = !surface ? r.h : service === 'LV' ? 3.7 : air ? 3.81 : 3.92
      // Above L1 the two ducts use their own chase in the observatory, clear of the lift.
      const sx = air && f === 'L2' ? r.x - 1.1 : r.x
      const riser = b.node(service + '-shaft-' + f, f, local(f, sx, h, r.z))
      nodes.set(f, riser)
      if (!f.startsWith('L')) serviceFloor(b, f, service, riser)
      else if (air) {
        const reverse = service === 'RA'
        const lane = service === 'SA' ? 1.25 : 2.15
        const header = b.node(service + '-surface-' + f, f, local(f, sx, h, lane))
        b.edge(r.kind, f, reverse ? header : riser, reverse ? riser : header)
        const rooms = roomsOn(f)
        const xs = rooms.map((room) => footprint(room.bounds).x + r.offset)
        const taps = b.header(r.kind, header, 0, xs, reverse)
        for (const [i, room] of rooms.entries()) {
          const z = lane + (reverse ? -0.45 : 0.45)
          const terminal = b.node(
            service + '-' + room.id,
            f,
            local(f, xs[i], 3.6, z),
            'grille',
            reverse ? '回风' : '送风',
            room.id,
          )
          b.edge(r.kind, f, reverse ? terminal : taps.get(xs[i])!, reverse ? taps.get(xs[i])! : terminal, [
            local(f, xs[i], h, z),
          ])
        }
      } else {
        const far = service === 'LV' ? r.x + 1.5 : r.x - 1.4
        const sh = service === 'LV' ? 3.7 : 3.92
        const header = b.node(service + '-surface-' + f, f, local(f, far, sh, r.z))
        b.edge(r.kind, f, riser, header, [local(f, r.x, sh, r.z)])
        // Distribution boards on alternating sides of the station's north/south axis.
        const lane = service === 'LV' ? -5.85 : -0.85 - (service === 'B' ? 0.25 : 0)
        const track = b.node(service + '-run-' + f, f, local(f, far, sh, lane))
        b.edge(r.kind, f, header, track)
        const rooms = roomsOn(f)
        const xs = rooms.map((room) => footprint(room.bounds).x + r.offset)
        const taps = b.header(r.kind, track, 0, xs)
        for (const [i, room] of rooms.entries()) {
          const terminal = b.node(
            service + '-' + room.id,
            f,
            local(f, xs[i], sh, lane + (service === 'LV' ? 0.3 : -0.3)),
            'fixture',
            service === 'LV' ? '房间弱电配线' : service + ' 母线隔离断路器',
            room.id,
          )
          b.edge(r.kind, f, taps.get(xs[i])!, terminal)
        }
      }
    }
    const floors = [...nodes.keys()]
    for (let i = 1; i < floors.length; i++) {
      const a = nodes.get(floors[i - 1])!,
        c = nodes.get(floors[i])!
      const down = service === 'RA' || (service === 'LV' && i <= floors.indexOf('B2'))
      const jog: Point3[] = air && c.floor === 'L2' ? [[c.position[0], a.position[1], c.position[2]]] : []
      b.edge(r.kind, a.floor, down ? c : a, down ? a : c, jog)
    }
    const base = nodes.get('B4')!
    if (!air) {
      const origin = service === 'LV' ? nodes.get('B2')! : base
      const f = origin.floor
      const board = b.node(
        service + '-board',
        f,
        local(f, service === 'LV' ? 7.2 : service === 'A' ? 8.04 : 13.98, r.h, -3.05),
        'source',
        service === 'LV' ? '智控网络交换机' : service + ' 配电母线',
        service === 'LV' ? 'b2_command' : 'b4_switchgear',
      )
      // Reach the corridor before heading east, avoiding the other riser's half of the shaft.
      const via = [local(f, board.position[0], r.h, r.lane), local(f, r.x, r.h, r.lane)]
      b.edge(r.kind, f, board, origin, via)
    }
    if (air) {
      const treatment = b.node(
        service + '-plant',
        'B4',
        local('B4', service === 'SA' ? 7.27 : 5.28, 2.65, service === 'SA' ? 8.6 : 2.65),
        'plant',
        service === 'SA' ? '新风过滤总站' : '总回风汇集',
        'b4_cbrn_hvac',
      )
      const via = [local('B4', r.x, r.h, r.lane), local('B4', treatment.position[0], r.h, r.lane)]
      if (service === 'SA') {
        b.edge(r.kind, 'B4', treatment, base, via.reverse())
        const inlet = b.node(
          'intake-manifold',
          'B4',
          local('B4', wet.x + 0.63, 2.8, -5.4),
          'junction',
          '双进风汇合',
        )
        for (const inletName of ['westIntake', 'eastIntake'] as const) {
          const src = b.external(inletName, 'B4', 'source', '室外新风')
          b.edge('airSupply', 'B4', src, inlet, [local('B4', wet.x + 0.63, 3.18, -14)], { outside: true })
        }
        b.edge('airSupply', 'B4', inlet, treatment, [
          local('B4', wet.x + 0.63, 3.1, -1.4),
          local('B4', treatment.position[0], 3.1, -1.4),
        ])
      } else {
        b.edge(r.kind, 'B4', base, treatment, via)
        const co2 = roomsOn('B4')
          .flatMap((room) => room.equipment)
          .flatMap((e) => e.servicePorts ?? [])
          .find((p) => p.system === 'return-air-co2')!
        const sorbent = b.node(co2.id, 'B4', portPoint(co2), 'plant', 'CO₂ 吸附', 'b4_cbrn_hvac')
        b.edge('airReturn', 'B4', treatment, sorbent)
        const out = b.external('exhaust', 'B4', 'outlet', '独立排风')
        b.edge('airReturn', 'B4', treatment, out, [local('B4', treatment.position[0], 3.2, 13)], {
          outside: true,
        })
      }
    }
  }
}
