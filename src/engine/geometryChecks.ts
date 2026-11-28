import { UNDERGROUND } from '../data/floors'
import { adits, type Adit } from '../data/siteFacilities'
import type { MepEdge, MepNetwork } from '../data/mepNetworkSchema'
import { footprint, getFloorElevation, shaftPlans } from '../geometry/coords'
import { doors, type Doorway } from '../geometry/doors'
import { stairRun } from '../geometry/stairs'
import type { EquipmentUnit, Point3, RoomInstance } from '../types/shelter'
import type { Diagnostic } from './model'

type Rect = ReturnType<typeof footprint>

function intersects(a: Rect, b: Rect) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
}

// Clip the finite centreline to the box expanded by the pipe envelope.
function crossesBox(
  edge: MepEdge,
  rect: Pick<Rect, 'x0' | 'x1' | 'z0' | 'z1'>,
  floor: number,
  ceiling: number,
) {
  const r = edge.radius
  const low = [rect.x0 - r, floor - r, rect.z0 - r],
    high = [rect.x1 + r, ceiling + r, rect.z1 + r]
  return edge.points.slice(1).some((end, i) => {
    const start = edge.points[i]
    let near = 0,
      far = 1
    for (let axis = 0; axis < 3; axis++) {
      const dx = end[axis] - start[axis]
      if (Math.abs(dx) < 1e-10) {
        if (start[axis] < low[axis] || start[axis] > high[axis]) return false
        continue
      }
      const u = (low[axis] - start[axis]) / dx,
        v = (high[axis] - start[axis]) / dx
      near = Math.max(near, Math.min(u, v))
      far = Math.min(far, Math.max(u, v))
      if (near > far) return false
    }
    return true
  })
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const difference = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

function segments(edges: MepEdge[]) {
  return edges.flatMap((edge) =>
    edge.points.slice(1).map((end, i) => {
      const start = edge.points[i],
        direction = difference(end, start)
      return { edge, start, direction, lengthSq: dot(direction, direction) }
    }),
  )
}

// Minimise |p + s*u - q - t*v|² with both parameters constrained to [0,1].
type Segment = ReturnType<typeof segments>[number]
function clearance(left: Segment, right: Segment) {
  const r = difference(left.start, right.start)
  const a = left.lengthSq,
    e = right.lengthSq,
    b = dot(left.direction, right.direction)
  const c = dot(left.direction, r),
    f = dot(right.direction, r)
  const det = a * e - b * b
  let s = det > 1e-12 * a * e ? clamp((b * f - c * e) / det) : 0
  const t = e ? clamp((b * s + f) / e) : 0
  s = a ? clamp((b * t - c) / a) : 0
  const d = Math.hypot(
    r[0] + s * left.direction[0] - t * right.direction[0],
    r[1] + s * left.direction[1] - t * right.direction[1],
    r[2] + s * left.direction[2] - t * right.direction[2],
  )
  return d - left.edge.radius - right.edge.radius
}

function dryZones(rooms: RoomInstance[], net: MepNetwork): Diagnostic {
  const protectedRooms = rooms.filter(
    (r) => r.isDryElectricalZone || r.wetDryZone === 'strict_dry_electrical',
  )
  const pipes = net.edges.filter((e) => e.system === 'water')
  for (const room of protectedRooms) {
    const rect = footprint(room.bounds),
      floor = getFloorElevation(room.floorId)
    const wet = rooms.find(
      (r) =>
        (r.wetDryZone === 'wet' || r.wetDryZone === 'semi_wet') &&
        getFloorElevation(r.floorId) >= floor &&
        intersects(rect, footprint(r.wetBounds ?? r.bounds)),
    )
    const pipe = pipes.find((e) => crossesBox(e, rect, floor, Infinity))
    if (wet || pipe)
      return {
        id: 'dry-stack',
        label: '垂直干湿分区',
        status: 'FAIL',
        roomId: room.id,
        edgeId: pipe?.id,
        value: wet ? wet.name : pipe!.id,
        detail: room.name + '的垂直投影与' + (wet?.name ?? pipe!.medium) + '重叠。',
      }
  }
  const westStack = ['b1_decon', 'b2_medical', 'b3_water', 'b4_drainage']
  for (const id of westStack) {
    const room = rooms.find((r) => r.id === id)
    const b = room?.wetBounds ?? room?.bounds
    if (room?.wetDryZone !== 'wet' || !b || b.gx0 !== 0 || b.gx1 !== 3 || b.gz0 !== 0 || b.gz1 !== 4) {
      return {
        id: 'dry-stack',
        label: '垂直干湿分区',
        status: 'FAIL',
        roomId: id,
        value: '湿区列中断',
        detail: '西北上下叠置的四间湿房须各占 80 m²，并接入同一侧湿井。',
      }
    }
  }
  const known = protectedRooms.length > 0 && pipes.length > 0
  return {
    id: 'dry-stack',
    label: '垂直干湿分区',
    status: known ? 'PASS' : 'WARN',
    roomId: 'b4_switchgear',
    value: known ? protectedRooms.length + ' 间干区' : '资料不足',
    detail: '按实际湿作业范围及管道外包络核对每个干区上方的空间。',
  }
}

function traySeparation(net: MepNetwork): Diagnostic {
  const power = segments(net.edges.filter((e) => e.system === 'power'))
  const data = segments(net.edges.filter((e) => e.system === 'data'))
  let min = Infinity,
    pair: [MepEdge, MepEdge] | undefined
  for (const left of power)
    for (const right of data) {
      const gap = clearance(left, right)
      if (gap < min) {
        min = gap
        pair = [left.edge, right.edge]
      }
    }
  const node = pair && net.nodes.find((n) => n.id === pair[0].to)
  return {
    id: 'tray-gap',
    label: '强弱电桥架净距',
    roomId: node?.roomId ?? 'b4_switchgear',
    status: !pair ? 'WARN' : min >= 0.4 - 1e-7 ? 'PASS' : 'FAIL',
    edgeId: pair?.[0].id,
    value: pair ? min.toFixed(3) + ' m' : '资料不足',
    detail: pair
      ? pair.map((e) => e.id).join(' / ') + '。两段外表面间距应至少为 0.400 m。'
      : '缺少一侧桥架线段。',
  }
}

function reachable(start: string, edges: MepEdge[], reverseAllowed: boolean) {
  const links = new Map<string, string[]>()
  function connect(a: string, b: string) {
    const list = links.get(a) ?? []
    list.push(b)
    links.set(a, list)
  }
  for (const e of edges) {
    connect(e.from, e.to)
    if (reverseAllowed) connect(e.to, e.from)
  }
  const visited = new Set([start])
  for (const n of visited) for (const next of links.get(n) ?? []) visited.add(next)
  return visited
}

function dedicatedDuct(net: MepNetwork, port: string, kind: MepEdge['kind'], inlet: boolean) {
  const air = net.edges.filter((edge) => edge.system === 'air')
  const head = port + '-terminal'
  const source = inlet ? head : port,
    target = inlet ? port : head
  if (!net.nodes.some((n) => n.id === head && n.role === (inlet ? 'source' : 'outlet'))) return false
  if (!air.some((e) => e.kind === kind && e.outside && (inlet ? e.from : e.to) === head)) return false
  if (
    !reachable(
      source,
      air.filter((edge) => edge.kind === kind),
      false,
    ).has(target)
  )
    return false
  const component = reachable(port, air, true)
  return (
    !net.nodes.some((n) => component.has(n.id) && n.id !== port && n.id !== head && n.role !== 'junction') &&
    !air.some((e) => e.kind !== kind && component.has(e.from))
  )
}

export function hasChpDucts(net: MepNetwork, unit: EquipmentUnit) {
  const supply = unit.servicePorts?.find((p) => p.system === 'combustion-air')
  const exhaust = unit.servicePorts?.find((p) => p.system === 'combustion-exhaust')
  return (
    !!supply &&
    !!exhaust &&
    dedicatedDuct(net, supply.id, 'airSupply', true) &&
    dedicatedDuct(net, exhaust.id, 'exhaust', false)
  )
}

function batterySmoke(rooms: RoomInstance[], net: MepNetwork): Diagnostic {
  const units = rooms
    .flatMap((r) => r.equipment)
    .filter(
      (e) => e.tagCode.startsWith('BAT-') || e.servicePorts?.some((p) => p.system === 'battery-exhaust'),
    )
  const failed = units.find((e) => {
    const ports = e.servicePorts?.filter((p) => p.system === 'battery-exhaust')
    return (
      !e.hasRunawayVent || !ports?.length || ports.some((p) => !dedicatedDuct(net, p.id, 'exhaust', false))
    )
  })
  return {
    id: 'battery-exhaust',
    label: '储能事故独立排烟',
    roomId: 'b4_switchgear',
    status: failed ? 'FAIL' : units.length ? 'PASS' : 'WARN',
    equipmentTag: failed?.tagCode,
    value: failed ? failed.tagCode : units.length ? units.length + ' 列独立排烟' : '未配置储能',
    detail: failed
      ? '事故烟道的专用室外出口、排烟接口或与其他气路的隔离存在缺口。'
      : '逐列核对事故排烟口至室外末端的流向和连通分支。',
  }
}

// Express the pipe in each bore segment's local coordinates. Subtracting the grade
// gives height above the tunnel floor even on the gently descending eastern route.
function entersBore(edge: MepEdge, adit: Adit) {
  return adit.points.slice(1).some((end, i) => {
    const [x, y, z] = adit.points[i]
    const dx = end[0] - x,
      dz = end[2] - z,
      run = Math.hypot(dx, dz)
    if (!run) return false
    const ux = dx / run,
      uz = dz / run,
      grade = (end[1] - y) / run
    const points = edge.points.map(([px, py, pz]): Point3 => {
      const along = (px - x) * ux + (pz - z) * uz
      return [along, py - y - along * grade, (pz - z) * ux - (px - x) * uz]
    })
    return crossesBox(
      { ...edge, points },
      { x0: 0, x1: run, z0: -adit.width / 2, z1: adit.width / 2 },
      0,
      adit.height,
    )
  })
}

function egress(net: MepNetwork, openings: Doorway[]): Diagnostic {
  const east = shaftPlans.find((s) => s.id === 'escape')!,
    main = shaftPlans.find((s) => s.id === 'personnel')!
  const smoke = net.edges.find(
    (e) =>
      (e.kind === 'exhaust' || e.kind === 'airReturn') &&
      ([east, main].some((s) => crossesBox(e, s, getFloorElevation('B4'), getFloorElevation(s.topFloor))) ||
        Object.values(adits).some((adit) => entersBore(e, adit))),
  )
  const structural = net.edges.filter((e) => e.kind === 'structure')
  const path = reachable('adit-east', structural, true)
  const doorAt = (floor: string, a: string, b: string, kind?: Doorway['kind']) =>
    openings.some(
      (d) =>
        d.floor === floor &&
        d.zones.includes(a) &&
        d.zones.includes(b) &&
        (!kind || d.kind === kind) &&
        d.width >= 0.9 &&
        d.height >= 2,
    )
  const missing = UNDERGROUND.find(
    (f) =>
      !doorAt(f, 'main-corridor', 'personnel', 'fire') ||
      !doorAt(f, 'main-corridor', 'escape', 'fire') ||
      !path.has('protected-hall-' + f) ||
      !path.has('protected-stair-' + f) ||
      !structural.some((e) => e.from === 'protected-hall-' + f && e.to === 'protected-stair-' + f),
  )
  const mainDoors = doorAt('L1', 'l1_vestibule', 'entry-chamber') && doorAt('L1', 'entry-chamber', 'surface')
  const eastDoors =
    doorAt('B2', 'main-corridor', 'b2-escape-lobby', 'fire') &&
    doorAt('B2', 'b2-escape-lobby', 'east-adit', 'fire') &&
    doorAt('B2', 'east-adit', 'surface')
  const westHall =
    doorAt('B2', 'b2-quiet-hall', 'b2-west-vestibule') && doorAt('B2', 'b2-west-vestibule', 'main-corridor')
  const eastHall =
    doorAt('B2', 'b2-quiet-hall', 'b2-east-link', 'fire') &&
    doorAt('B2', 'b2-east-link', 'b2-escape-lobby', 'fire')
  const stairs = UNDERGROUND.every((f) =>
    (['personnel', 'escape'] as const).every((k) => {
      const run = stairRun(k, f)
      if (k === 'escape' && f === 'B1') return !run
      return !!run && run.riser <= 0.17 && Math.min(...run.treads) >= 0.28
    }),
  )
  const fault = smoke
    ? '排风进入楼梯或平硐疏散空间'
    : missing
      ? missing + ' 楼梯或联络通路中断'
      : !mainDoors
        ? '主梯地面出口中断'
        : !eastDoors
          ? '东端防火前室至室外通路中断'
          : !westHall || !eastHall
            ? '居住内廊缺少独立疏散方向'
            : !stairs
              ? '楼梯踏步超限或层间中断'
              : ''
  return {
    id: 'egress',
    label: '防烟楼梯与双向疏散',
    status: fault ? 'FAIL' : 'PASS',
    roomId: 'b2_quarters',
    edgeId: smoke?.id,
    value: fault || '两向连通',
    detail: '逐层检查踏步与防火门、排风侵入、主梯地面出口，以及不穿越卧室的东端出口。',
  }
}

export function checkGeometry(rooms: RoomInstance[], net: MepNetwork, openings = doors): Diagnostic[] {
  const wet = shaftPlans.find((s) => s.id === 'wet')!,
    electrical = shaftPlans.find((s) => s.id === 'electrical')!
  const gap = Math.hypot(
    Math.max(0, wet.x0 - electrical.x1, electrical.x0 - wet.x1),
    Math.max(0, wet.z0 - electrical.z1, electrical.z0 - wet.z1),
  )
  const expected = { freight: [4, 4], personnel: [4, 4], escape: [4, 2], electrical: [2, 4], wet: [2, 4] }
  const sizes = Object.entries(expected).every(([id, [w, d]]) =>
    shaftPlans.some((s) => s.id === id && s.w === w && s.d === d),
  )
  const gensets = rooms
    .flatMap((r) => r.equipment)
    .filter((e) => e.requiresExternalExhaust || e.tagCode.startsWith('CHP-'))
  const faultyGen = gensets.find((e) => !hasChpDucts(net, e))
  return [
    dryZones(rooms, net),
    traySeparation(net),
    {
      id: 'core',
      label: '井筒与干湿隔离',
      status: sizes && gap >= 8 ? 'PASS' : 'FAIL',
      value: gap.toFixed(2) + ' m',
      roomId: 'b4_switchgear',
      detail: '从湿井与电井相邻外壁测量，同时核对五处井筒的平面包络。',
    },
    egress(net, openings),
    batterySmoke(rooms, net),
    {
      id: 'chp-ducts',
      label: 'CHP 独立进排气',
      status: faultyGen ? 'FAIL' : gensets.length ? 'PASS' : 'WARN',
      value: faultyGen ? '管路中断或混接' : gensets.length ? '双路连通' : '未配置',
      roomId: 'b4_reactor',
      equipmentTag: (faultyGen ?? gensets[0])?.tagCode,
      detail: '从燃烧进气口和烟气出口，按各自流向查至专用室外管口。',
    },
  ]
}
