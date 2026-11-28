import { crewById } from '../data/crew'
import { defaultBlueprint } from '../data/defaultBlueprint'
import { BRANCH_CORRIDOR, CORRIDOR, FLOORS } from '../data/floors'
import type { MepEdge, MepNetwork, MepNode } from '../data/mepNetwork'
import { footprint, shaftPlans } from '../geometry/coords'
import { doors } from '../geometry/doors'
import type { EquipmentUnit, Point3, RoomInstance } from '../types/shelter'
import { spareStock, type MaintenanceResult } from './model'

type Spare = EquipmentUnit['requiredSpareType']
const spareNames: Record<Spare, string> = {
  structural: '结构件',
  precision_filter: '滤芯',
  electronic: '电控件',
  consumable: '通用保养包',
}
export function fitsFreight(e: EquipmentUnit) {
  const [w, h, d] = e.moduleSizeM
  return w <= 1.6 && d <= 1.6 && h <= 2.1 && e.weightKg <= 2500
}

const hall = footprint(CORRIDOR),
  branch = footprint(BRANCH_CORRIDOR)
const lift = shaftPlans.find((s) => s.id === 'freight')!
/** Surveyed route for a small spare to the room threshold. Unmodelled handling inside
 * the room, over terrain and above the freight head receives no reachability credit. */
export function transportRoute(room: RoomInstance, network: MepNetwork, isolated?: string): Point3[] {
  const store = doors.find((d) => d.id === 'b1_warehouse')!
  const access = doors.find((d) => d.id === room.id)
  const f = room.floorId,
    b1 = FLOORS.B1.elevation + 0.2,
    end = FLOORS[f].elevation + 0.2
  const path: Point3[] = [
    [store.base[0], b1, store.base[2] + 0.55],
    [store.base[0], b1, hall.z],
  ]
  if (room.id === 'b1_warehouse') return path.slice(0, 1)
  if (f === 'L2') return []
  if (f !== 'B1' || room.id === 'b1_logistics') {
    const freight = network.edges.filter((e) => e.kind === 'freight' && e.id !== isolated)
    const to = f === 'L1' ? 'freight-head' : 'freight-' + f
    if (!walk(freight, ['freight-B1'], 'both').has(to)) return []
    const landing = doors.find((d) => d.id === 'B1-freight-front')!
    path.push(
      [landing.base[0], b1, hall.z],
      [landing.base[0], b1, landing.base[2]],
      [lift.x, b1, lift.z],
      [lift.x, end, lift.z],
    )
    if (f === 'L1') {
      if (room.id !== 'l1_garage') {
        const staff = doors.find((d) => d.id === 'garage-staff')!
        path.push([staff.base[0], end, staff.base[2]])
        if (room.id === 'l1_lobby') {
          const lobby = doors.find((d) => d.id === 'lobby-staff')!
          path.push([lobby.base[0], end, lobby.base[2]])
        }
      }
      return path
    }
    const rear = doors.find((d) => d.floor === f && d.zones.includes('freight') && d.zones.includes(room.id))
    if (rear) return [...path, [rear.base[0], end, rear.base[2]], [rear.base[0], end, rear.base[2] - 0.45]]
    const front = doors.find((d) => d.id === f + '-freight-front')
    if (!front) return []
    path.push([front.base[0], end, front.base[2]], [front.base[0], end, hall.z])
  }
  if (!access) return []
  const [x, , z] = access.base
  if (access.zones.includes('north-branch')) path.push([branch.x, end, hall.z], [branch.x, end, z])
  else path.push([x, end, hall.z])
  path.push([x, end, z])
  return path
}

type Direction = 'forward' | 'reverse' | 'both'
type Visit = { prev: string; edge: MepEdge } | null
function walk(edges: MepEdge[], seeds: string[], direction: Direction) {
  const adjacent = new Map<string, { to: string; edge: MepEdge }[]>()
  function add(from: string, to: string, edge: MepEdge) {
    if (!adjacent.has(from)) adjacent.set(from, [])
    adjacent.get(from)!.push({ to, edge })
  }
  for (const e of edges) {
    if (direction !== 'reverse') add(e.from, e.to, e)
    if (direction !== 'forward') add(e.to, e.from, e)
  }
  const seen = new Map<string, Visit>(seeds.map((id) => [id, null]))
  const queue = [...seeds]
  for (let i = 0; i < queue.length; i++) {
    for (const { to, edge } of adjacent.get(queue[i]) ?? []) {
      if (seen.has(to)) continue
      seen.set(to, { prev: queue[i], edge })
      queue.push(to)
    }
  }
  return seen
}
export function hoistReachable(room: RoomInstance, network: MepNetwork, isolatedId?: string | null) {
  const track = network.edges.filter((e) => e.kind === 'freight' && e.id !== isolatedId)
  const reached = walk(track, ['HOI-102'], 'forward')
  return room.id === 'l1_garage' ? reached.has('freight-head') : reached.has('hoist-' + room.id)
}
function collectPath(seen: Map<string, Visit>, id: string, edges: Set<string>) {
  let step = seen.get(id)
  while (step) {
    edges.add(step.edge.id)
    step = seen.get(step.prev)
  }
}
function nearestRoom(e: MepEdge, rooms: RoomInstance[]) {
  const p = e.points[0]
  const distance = (r: RoomInstance) => {
    const b = footprint(r.bounds)
    return Math.hypot(Math.max(b.x0 - p[0], 0, p[0] - b.x1), Math.max(b.z0 - p[2], 0, p[2] - b.z1))
  }
  return rooms.filter((r) => r.floorId === e.floor).sort((a, b) => distance(a) - distance(b))[0]
}

function edgeIsolation(edge: MepEdge, net: MepNetwork, rooms: RoomInstance[]) {
  const reverse = ['drain', 'vacuum', 'airReturn', 'exhaust', 'hydrogen'].includes(edge.kind)
  const way = reverse ? 'reverse' : 'forward'
  const edges = net.edges.filter((e) => e.kind === edge.kind)
  const tail = reverse ? edge.from : edge.to
  const dependent = walk(edges, [tail], way)
  const affected = new Set<string>(),
    backup = new Set<string>(),
    offline = new Set<string>()
  const candidates = net.nodes.filter((n) => n.roomId && dependent.has(n.id))
  const focusNode =
    net.nodes.find((n) => n.id === tail && n.roomId) ?? candidates.find((n) => n.floor === edge.floor)
  const room = rooms.find((r) => r.id === focusNode?.roomId) ?? nearestRoom(edge, rooms)
  const sinks = net.nodes
    .filter((n) => (reverse ? n.role === 'outlet' : n.role === 'source'))
    .map((n) => n.id)
  // Gravity and vacuum networks meet at the receiver. Each graph ends at its own interface.
  if (edge.kind === 'vacuum') sinks.push('vacuum-receiver')
  if (edge.kind === 'supply') {
    // Stored potable water remains a finite source after loss of the raw-water feed.
    for (const unit of rooms.flatMap((r) => r.equipment))
      if (unit.redundantGroup === 'potable-water') sinks.push(unit.tagCode)
  }
  const intact = walk(
    edges.filter((e) => e.id !== edge.id),
    sinks,
    way,
  )
  for (const n of candidates.filter((n) => n.role !== 'source' && n.role !== 'junction')) {
    let endpoint = n.id
    if (!intact.has(endpoint) && edge.kind === 'power' && /^[AB]-[bl]/.test(n.id))
      endpoint = (n.id.startsWith('A-') ? 'B-' : 'A-') + n.roomId
    if (intact.has(endpoint)) {
      collectPath(intact, endpoint, backup)
    } else {
      affected.add(n.roomId!)
      if (edge.kind === 'power')
        rooms.find((r) => r.id === n.roomId)?.equipment.forEach((e) => offline.add(e.tagCode))
    }
  }
  // For a two-port plant skid, loss of either side disables the process.
  const ends = [edge.from, edge.to]
  const pat = (prefix: string) => ends.some((id) => id.startsWith(prefix))
  if (pat('CHP-442')) offline.add('CHP-442')
  if (pat('OX-452-H2')) offline.add('OX-452')
  if (pat('CB-453')) offline.add('CB-453')
  if (edge.kind === 'heat') {
    if (edge.medium.includes('井')) offline.add('borefield')
    else if (edge.to === 'helipad') offline.add('snow-loop')
    else if (edge.to === 'GH-heat') offline.add('greenhouse-loop')
    else {
      offline.add('greenhouse-loop')
      offline.add('snow-loop')
    }
  }
  if (edge.from === 'spring') offline.add('spring')
  if (edge.from === 'westIntake' || edge.from === 'eastIntake') offline.add(edge.from)
  if ((edge.kind === 'airSupply' || edge.kind === 'airReturn') && affected.has('b2_quarters'))
    offline.add('b2-circulation')
  // A tank with an isolated outlet cannot supply the header. Losing its inlet
  // still leaves the present contents available until drained.
  for (const tag of ['TK-301A', 'TK-301B']) if (edge.from === tag) offline.add(tag)
  if (edge.kind === 'supply' && affected.has('b2_bath_laundry')) offline.add('bath-supply')
  if (edge.kind === 'supply' && affected.has('b4_cbrn_hvac')) offline.add('OX-452')
  if (edge.kind === 'supply' && affected.has('b3_hydroponics')) {
    rooms.find((r) => r.id === 'b3_hydroponics')?.equipment.forEach((e) => offline.add(e.tagCode))
  }
  if (edge.kind === 'drain' && (edge.to === 'reclaimed-tank' || edge.to === 'WT-302-return'))
    offline.add('recovery')
  // A broken segment in a series-only plant connection or a physical route has no automatic replacement.
  if (backup.size === 0 && affected.size === 0) affected.add(room.id)
  return { room, affected, backup, offline }
}

function deviceNodeIds(unit: EquipmentUnit, nodes: MepNode[]) {
  const ids = nodes
    .filter((n) => n.id === unit.tagCode || n.id.startsWith(unit.tagCode + '-'))
    .map((n) => n.id)
  if (unit.redundantGroup === 'essential-bus') ids.push(unit.tagCode.endsWith('A') ? 'A-board' : 'B-board')
  return new Set(ids)
}
export function simulateMaintenance(
  id: string,
  net: MepNetwork,
  rooms: RoomInstance[] = defaultBlueprint.rooms,
  stock = spareStock,
): MaintenanceResult | null {
  const edge = net.edges.find((e) => e.id === id)
  const entry = rooms
    .flatMap((room) => room.equipment.map((unit) => ({ room, unit })))
    .find((pair) => pair.unit.tagCode === id)
  if (!edge && !entry) return null
  const loss = edge ? edgeIsolation(edge, net, rooms) : null
  const room = entry?.room ?? loss!.room
  const unit = entry?.unit,
    kind = edge?.kind
  const partner =
    unit?.redundantGroup &&
    rooms
      .flatMap((r) => r.equipment)
      .find((e) => e.tagCode !== id && e.redundantGroup === unit.redundantGroup)
  const ownNodes = unit ? deviceNodeIds(unit, net.nodes) : new Set<string>()
  const partnerNodes = partner ? deviceNodeIds(partner, net.nodes) : new Set<string>()
  const incident = (nodes: Set<string>) =>
    net.edges.filter((e) => nodes.has(e.from) || nodes.has(e.to)).map((e) => e.id)
  const isolated = edge ? [edge.id] : incident(ownNodes)
  const backup = loss ? [...loss.backup] : incident(partnerNodes)
  const affected = loss ? [...loss.affected] : partner ? [] : [room.id]
  const groupSpare = unit?.redundantGroup === 'supply-air' ? 'precision_filter' : undefined
  const spareType: Spare =
    groupSpare ??
    unit?.requiredSpareType ??
    (edge?.system === 'power' || edge?.system === 'data' ? 'electronic' : 'structural')
  const rack = rooms
    .find((r) => r.id === 'b1_warehouse')
    ?.equipment.some((e) => e.tagCode.startsWith('RCK-131'))
  const available = rack ? stock[spareType] : 0
  const route = transportRoute(room, net, id)
  const canSwitch = !!partner || backup.length > 0
  const status =
    !available || !route.length || affected.length > 0
      ? 'FAIL'
      : canSwitch && !edge?.outside
        ? 'PASS'
        : 'WARN'
  let summary = partner
    ? partner.tagCode + ' 同组可接管，余量见体检。'
    : backup.length
      ? '有连续备用路径，受影响末端已逐一复核。'
      : '该支路或设备缺少独立备用。'
  if (edge?.from === 'spring') summary = '山泉补水中断，由现有净水罐暂供，剩余天数见水务行。'
  if (unit && !fitsFreight(unit)) summary += ' 整机超更换包络，路线仅供小件保养。'
  if (!route.length) summary += ' 尚无可验证的货运通路。'
  else if (edge?.outside) summary += ' 路线止于站内交接点；至室外故障点的运输条件未核验。'
  const roles = unit
    ? [unit.primaryRoleId, unit.backupRoleId]
    : kind === 'data'
      ? ['instrumentation', 'electrical']
      : kind === 'power'
        ? ['electrical', 'mechanical']
        : ['mechanical', 'water']
  return {
    id,
    label: unit?.name ?? edge!.medium,
    status,
    roomId: room.id,
    summary,
    affectedRoomIds: affected,
    isolatedEdgeIds: isolated,
    backupEquipmentTag: partner ? partner.tagCode : undefined,
    backupEdgeIds: backup,
    route,
    spare: spareNames[spareType] + '：需 1 / 库 ' + available,
    crew: roles.map((r) => crewById.get(r)?.name ?? r).join(' / '),
    offlineTags: entry ? [id] : [...loss!.offline],
  }
}
