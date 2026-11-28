import { getFloorElevation } from '../geometry/coords'
import { facilityAnchor, siteFacilities, type SiteKind } from './siteFacilities'
import type { TerrainAtlas } from '../geometry/siteElevations'
import type { FloorId, Point3 } from '../types/shelter'

export type MepSystem = 'power' | 'data' | 'water' | 'air' | 'freight' | 'structure'
const specifications = {
  power: ['power', '强电桥架', 0.085],
  data: ['data', '屏蔽通信桥架', 0.065],
  supply: ['water', '生活给水', 0.055],
  drain: ['water', '重力排水', 0.075],
  vacuum: ['water', '真空黑水', 0.05],
  airSupply: ['air', '新风', 0.105],
  airReturn: ['air', '独立回排风', 0.095],
  exhaust: ['air', '专用排气', 0.085],
  hydrogen: ['air', '氢气', 0.035],
  heat: ['air', '热媒水', 0.065],
  freight: ['freight', '重载吊轨', 0.085],
  structure: ['structure', '防护边界', 0.045],
} as const
export type MepKind = keyof typeof specifications
export interface MepNode {
  id: string
  position: Point3
  floor: FloorId
  role: 'junction' | 'source' | 'outlet' | 'fixture' | 'valve' | 'grille' | 'plant'
  medium: string
  roomId?: string
}
export interface MepEdge {
  id: string
  from: string
  to: string
  system: MepSystem
  kind: MepKind
  medium: string
  floor: FloorId
  points: Point3[]
  radius: number
  slope?: number
  outside?: boolean
}
export interface MepNetwork {
  nodes: MepNode[]
  edges: MepEdge[]
  traceWater(edgeId: string): Set<string>
  affectedRooms(valveId: string): string[]
}

export function local(floor: FloorId, x: number, height: number, z: number): Point3 {
  return [x, getFloorElevation(floor) + height, z]
}
export const portPoint = (p: { floor: FloorId; position: Point3 }) => local(p.floor, ...p.position)

const prefix: Record<MepSystem, string> = {
  power: 'HV',
  data: 'LV',
  air: 'AC',
  water: 'P',
  freight: 'TR',
  structure: 'SB',
}
export class NetworkBuilder {
  readonly nodes: MepNode[] = []
  readonly edges: MepEdge[] = []
  private readonly serial = new Map<string, number>()
  constructor(readonly atlas: TerrainAtlas) {}

  node(
    id: string,
    floor: FloorId,
    position: Point3,
    role: MepNode['role'] = 'junction',
    medium = '',
    roomId?: string,
  ) {
    const node: MepNode = { id, floor, position, role, medium, roomId }
    this.nodes.push(node)
    return node
  }
  external(kind: SiteKind, floor: FloorId, role: MepNode['role'], medium: string) {
    const site = siteFacilities.find((f) => f.kind === kind)!
    return this.node(kind, floor, facilityAnchor(site, this.atlas), role, medium)
  }
  edge(
    kind: MepKind,
    floor: FloorId,
    from: MepNode,
    to: MepNode,
    via: Point3[] = [],
    options: Partial<Pick<MepEdge, 'medium' | 'outside' | 'radius'>> = {},
  ) {
    const [system, medium, radius] = specifications[kind]
    const base = prefix[system] + '-' + floor + '-'
    const n = (this.serial.get(base) ?? 0) + 1
    this.serial.set(base, n)
    const points = [from.position, ...via, to.position].filter(
      (p, i, all) => !i || p.some((v, j) => Math.abs(v - all[i - 1][j]) > 1e-7),
    )
    const edge: MepEdge = {
      id: base + String(n).padStart(3, '0'),
      system,
      kind,
      medium,
      radius,
      floor,
      from: from.id,
      to: to.id,
      points,
      ...options,
    }
    if (kind === 'drain') {
      const run = points
        .slice(1)
        .reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[2] - points[i][2]), 0)
      if (run > 0.01) edge.slope = (from.position[1] - to.position[1]) / run
    }
    this.edges.push(edge)
    return edge
  }

  // A tee is a graph vertex, even where a straight manifold continues through it.
  // Rooms on opposite sides of a tee therefore never become each other's downstream.
  header(kind: MepKind, root: MepNode, axis: 0 | 2, requested: number[], reverse = false) {
    const origin = root.position[axis]
    const taps = new Map<number, MepNode>([[origin, root]])
    for (const sign of [-1, 1]) {
      let previous = root
      const values = [...new Set(requested)]
        .filter((v) => sign * (v - origin) > 0)
        .sort((a, b) => sign * (a - b))
      for (const value of values) {
        const point: Point3 = [...root.position]
        point[axis] = value
        const tap = this.node(root.id + '/' + value, root.floor, point)
        this.edge(kind, root.floor, reverse ? tap : previous, reverse ? previous : tap)
        taps.set(value, tap)
        previous = tap
      }
    }
    return taps
  }

  finish(): MepNetwork {
    const incoming = new Map<string, MepEdge[]>(),
      outgoing = new Map<string, MepEdge[]>()
    const nodes = new Map(this.nodes.map((n) => [n.id, n]))
    const edges = new Map(this.edges.map((e) => [e.id, e]))
    for (const e of this.edges.filter((e) => e.system === 'water')) {
      const ins = incoming.get(e.to) ?? [],
        outs = outgoing.get(e.from) ?? []
      ins.push(e)
      incoming.set(e.to, ins)
      outs.push(e)
      outgoing.set(e.from, outs)
    }
    function walk(start: string, downstream: boolean, visit: (e: MepEdge) => void) {
      const queue = [start],
        seen = new Set([start])
      while (queue.length) {
        const id = queue.pop()!
        for (const edge of (downstream ? outgoing : incoming).get(id) ?? []) {
          visit(edge)
          const next = downstream ? edge.to : edge.from
          if (!seen.has(next)) {
            seen.add(next)
            queue.push(next)
          }
        }
      }
    }
    return {
      nodes: this.nodes,
      edges: this.edges,
      traceWater(id) {
        const result = new Set<string>(),
          edge = edges.get(id)
        if (!edge || edge.system !== 'water') return result
        result.add(id)
        walk(edge.from, false, (e) => result.add(e.id))
        walk(edge.to, true, (e) => result.add(e.id))
        return result
      },
      affectedRooms(id) {
        if (nodes.get(id)?.role !== 'valve') return []
        const rooms = new Set<string>()
        walk(id, true, (edge) => {
          const n = nodes.get(edge.to)!
          if (n.role === 'fixture' && n.roomId) rooms.add(n.roomId)
        })
        return [...rooms]
      },
    }
  }
}
