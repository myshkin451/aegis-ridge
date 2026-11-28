import { buffer, footprint, shaftPlans, undergroundPlan } from '../geometry/coords'
import { groundAt, type TerrainAtlas } from '../geometry/siteElevations'
import { defaultBlueprint, roomsOn } from './defaultBlueprint'
import { BRANCH_CORRIDOR, CORRIDOR, UNDERGROUND } from './floors'
import { adits, eastTransfer, refuge, refugeJunction, siteFacilities } from './siteFacilities'
import { buildDistribution } from './mepNetworkDistribution'
import { local, NetworkBuilder, portPoint, type MepKind, type MepNode } from './mepNetworkSchema'
import { buildWater } from './mepNetworkWater'
import { doors } from '../geometry/doors'
import { connectModuleBranches } from './moduleBranches'
import type { MepNetwork } from './mepNetworkSchema'
import type { Point3 } from '../types/shelter'

export type { MepNode, MepEdge, MepSystem, MepKind, MepNetwork } from './mepNetworkSchema'

function equipmentBranches(b: NetworkBuilder) {
  const field = new Map<string, MepNode>()
  const header = new Map<string, MepNode>()
  for (const room of roomsOn('B4'))
    for (const e of room.equipment)
      for (const p of e.servicePorts ?? []) {
        if (!p.connectsTo) continue
        const names: Partial<Record<typeof p.system, [MepKind, string]>> = {
          'borefield-supply': ['heat', '井群供水'],
          'borefield-return': ['heat', '井群回水'],
          'surface-heating': ['heat', '地表采暖供水'],
          'battery-exhaust': ['exhaust', '储能事故排烟'],
          'combustion-air': ['airSupply', 'CHP 独立燃烧进气'],
          'combustion-exhaust': ['exhaust', 'CHP 烟气'],
          'hydrogen-recovery': ['hydrogen', '电解排氢'],
        }
        const spec = names[p.system]
        if (!spec) continue
        const [kind, medium] = spec
        const equipment = b.node(p.id, p.floor, portPoint(p), 'plant', medium, room.id)
        const terminal = b.node(p.id + '-socket', p.floor, portPoint(p.connectsTo), 'junction', medium)
        const incoming = p.system === 'borefield-supply' || p.system === 'combustion-air'
        const [x, y, z] = terminal.position
        const via: Point3[] = [
          [equipment.position[0], y, equipment.position[2]],
          [x, y, equipment.position[2]],
        ]
        b.edge(
          kind,
          p.floor,
          incoming ? terminal : equipment,
          incoming ? equipment : terminal,
          incoming ? via.reverse() : via,
          { medium },
        )
        if (p.system === 'surface-heating') {
          const manifold = b.node('heat-L1', 'L1', local('L1', x, 3.83, z), 'junction', '地表热分配')
          b.edge(kind, 'B4', terminal, manifold, [], { medium })
          const pad = b.external('helipad', 'L1', 'outlet', '融雪盘管')
          b.edge(kind, 'L1', manifold, pad, [], { medium: '融雪热水', outside: true })
          const greenhouse = b.node(
            'GH-heat',
            'L2',
            local('L2', 4.3, 0.2, 2.3),
            'fixture',
            '温室供暖',
            'l2_greenhouse',
          )
          b.edge(kind, 'L2', manifold, greenhouse, [local('L1', x, 3.83, 2.3), local('L1', 4.3, 3.83, 2.3)], {
            medium,
          })
        } else {
          const bore = p.system.startsWith('borefield')
          if (bore) {
            // Boundary of the buried field shown on this drawing. The lumped field
            // represents exchange across multiple wells; it does not set well depth.
            const endNode = b.node(
              p.id + '-terminal',
              p.floor,
              [x, y - 12, z],
              incoming ? 'source' : 'outlet',
              '井群换热边界',
            )
            b.edge(kind, p.floor, incoming ? endNode : terminal, incoming ? terminal : endNode, [], {
              medium,
            })
            field.set(p.system, endNode)
            header.set(p.system, equipment)
          } else {
            // Separate surface heads for combustion intake, products of combustion,
            // battery smoke and hydrogen. No connection to occupied-room return air.
            const headX =
              p.system === 'combustion-air'
                ? -15.2
                : p.system === 'combustion-exhaust'
                  ? 6.8
                  : p.system === 'hydrogen-recovery'
                    ? 18.4
                    : x
            const headZ =
              p.system === 'combustion-air'
                ? 14.4
                : p.system === 'combustion-exhaust'
                  ? 15.8
                  : p.system === 'hydrogen-recovery'
                    ? z
                    : -14.2
            const capHeight = incoming ? 1.6 : 2.8
            const headY = groundAt(b.atlas, headX, headZ).height + capHeight
            const head = b.node(
              p.id + '-terminal',
              p.floor,
              [headX, headY, headZ],
              incoming ? 'source' : 'outlet',
              medium + '专用室外管口',
            )
            const path: Point3[] = [
              [x, y, headZ],
              [headX, y, headZ],
            ]
            b.edge(
              kind,
              p.floor,
              incoming ? head : terminal,
              incoming ? terminal : head,
              incoming ? path.reverse() : path,
              { medium, outside: true },
            )
          }
        }
      }
  b.edge('heat', 'B4', field.get('borefield-return')!, field.get('borefield-supply')!, [], {
    medium: '井群换热边界',
  })
  b.edge('heat', 'B4', header.get('borefield-supply')!, header.get('borefield-return')!, [], {
    medium: '井侧换热器',
  })
}

function zoneBoundaries(b: NetworkBuilder) {
  for (const door of doors.filter((d) => d.airlock || d.id === 'lobby-north' || d.id === 'east-threshold')) {
    const [x, y, z] = door.base
    const dx = (Math.cos(door.yaw) * door.width) / 2,
      dz = (-Math.sin(door.yaw) * door.width) / 2
    const corner = b.node('zone-' + door.id, door.floor, [x - dx, y + 0.015, z - dz], 'junction', '分区门界')
    b.edge(
      'structure',
      door.floor,
      corner,
      corner,
      [
        [x + dx, y + 0.015, z + dz],
        [x + dx, y + door.height, z + dz],
        [x - dx, y + door.height, z - dz],
      ],
      { medium: door.airlock ? '气闸边界' : '防火前室边界' },
    )
  }
  const sensors = siteFacilities
    .find((f) => f.kind === 'sensors')!
    .points.map(([x, z], i) =>
      b.node(
        'survey-perimeter-' + (i + 1),
        'L1',
        [x, groundAt(b.atlas, x, z).height + 0.26, z],
        'junction',
        '地表监测包络',
      ),
    )
  for (const [i, a] of sensors.entries()) {
    const c = sensors[(i + 1) % sensors.length]
    const [x, , z] = a.position,
      dx = c.position[0] - x,
      dz = c.position[2] - z
    const via: Point3[] = []
    for (let t = 0.125; t < 1; t += 0.125) {
      const sx = x + dx * t,
        sz = z + dz * t
      via.push([sx, groundAt(b.atlas, sx, sz).height + 0.26, sz])
    }
    b.edge('structure', 'L1', a, c, via, { outside: true, medium: '地表监测包络' })
  }
}

function freightAndStructure(b: NetworkBuilder) {
  const corridor = footprint(CORRIDOR),
    branch = footprint(BRANCH_CORRIDOR)
  const freight = shaftPlans.find((s) => s.id === 'freight')!,
    escape = shaftPlans.find((s) => s.id === 'escape')!
  const hoist = roomsOn('L1')
    .flatMap((r) => r.equipment)
    .find((e) => e.tagCode === 'HOI-102')!
  let above = b.node(
    hoist.tagCode,
    'L1',
    local('L1', hoist.position[0], 3.28, hoist.position[2]),
    'source',
    '3t 车库行车',
    'l1_garage',
  )
  const head = b.node('freight-head', 'L1', local('L1', freight.x, 3.28, freight.z))
  b.edge('freight', 'L1', above, head)
  above = head
  let escapeAbove: MepNode | undefined
  for (const f of UNDERGROUND) {
    const hoistLevel = 3.24
    const lift = b.node('freight-' + f, f, local(f, freight.x, hoistLevel, freight.z))
    b.edge('freight', f, above, lift)
    above = lift
    const central = b.node('crane-' + f, f, local(f, freight.x, hoistLevel, corridor.z))
    b.edge('freight', f, lift, central)
    const heavy = roomsOn(f).filter((r) => r.requiresHoistRail)
    const xs = heavy.map((room) => {
      const r = footprint(room.bounds)
      return r.z1 < corridor.z0 ? branch.x : r.x
    })
    const taps = b.header('freight', central, 0, [corridor.x0 + 0.4, corridor.x1 - 0.4, ...xs])
    for (const [i, room] of heavy.entries()) {
      const r = footprint(room.bounds)
      const endZ = r.z1 < corridor.z0 ? r.z1 - 0.85 : r.z0 >= 0 ? r.z0 + 0.75 : r.z1 - 0.75
      const target = b.node(
        'hoist-' + room.id,
        f,
        local(f, r.z1 < corridor.z0 ? r.x1 - 0.8 : r.x, hoistLevel, endZ),
        'fixture',
        '检修吊点',
        room.id,
      )
      b.edge('freight', f, taps.get(xs[i])!, target, [local(f, xs[i], hoistLevel, endZ)])
    }
    const landing = b.node(
      'protected-stair-' + f,
      f,
      local(f, escape.x0 + 0.42, 0.12, corridor.z),
      'junction',
      '防烟楼梯',
    )
    if (escapeAbove) b.edge('structure', f, landing, escapeAbove)
    escapeAbove = landing
    const start = b.node(
      'protected-hall-' + f,
      f,
      local(f, corridor.x0 + 0.32, 0.12, corridor.z),
      'junction',
      '分区疏散线',
    )
    b.edge('structure', f, start, landing)
    if (f === 'B1' || f === 'B2') {
      const bore = adits[f === 'B1' ? 'west' : 'east']
      const path: Point3[] = (f === 'B2' ? eastTransfer.concat(bore.points.slice(1)) : bore.points).map(
        ([x, y, z]) => [x, y + 0.12, z],
      )
      const entry = b.node('door-' + bore.id, f, path[0], 'junction', '防火分区边界')
      b.edge('structure', f, f === 'B2' ? landing : start, entry)
      const mouth = b.node('adit-' + bore.id, f, path.at(-1)!, 'outlet', '平硐出口')
      if (f === 'B2') {
        const junction = b.node('adit-mid', f, [
          refugeJunction[0],
          refugeJunction[1] + 0.12,
          refugeJunction[2],
        ])
        const refugeNode = b.node(
          'adit-refuge',
          f,
          [refuge[0], refuge[1] + 0.12, refuge[2]],
          'outlet',
          '应急硐室',
        )
        b.edge('structure', f, entry, junction, path.slice(1, -1), { outside: true })
        b.edge('structure', f, junction, refugeNode, [], { outside: true })
        b.edge('structure', f, junction, mouth, [], { outside: true })
      } else b.edge('structure', f, entry, mouth, path.slice(1, -1), { outside: true })
    }
  }
  const p = undergroundPlan
  for (const [layer, y] of [
    ['RC', buffer.interfaceY],
    ['rock', buffer.bottom],
  ] as const) {
    const corner = b.node(layer + '-boundary', 'B1', [p.x0, y, p.z0], 'junction', '复合防护层边界')
    b.edge('structure', 'B1', corner, corner, [
      [p.x1, y, p.z0],
      [p.x1, y, p.z1],
      [p.x0, y, p.z1],
    ])
  }
}

type Survey = { atlas: TerrainAtlas; base: MepNetwork; variants: WeakMap<typeof defaultBlueprint.rooms, MepNetwork> }
const surveys = new WeakMap<MepNetwork, Survey>()
export function configuredNetwork(network: MepNetwork, rooms: typeof defaultBlueprint.rooms) {
  const survey = surveys.get(network)
  if (!survey || rooms === defaultBlueprint.rooms) return survey?.base ?? network
  const cached = survey.variants.get(rooms)
  if (cached) return cached
  const result = connectModuleBranches(survey.base, survey.atlas, rooms)
  surveys.set(result, survey)
  survey.variants.set(rooms, result)
  return result
}
export function buildMepNetwork(atlas: TerrainAtlas, rooms = defaultBlueprint.rooms) {
  const b = new NetworkBuilder(atlas)
  buildWater(b)
  buildDistribution(b)
  equipmentBranches(b)
  freightAndStructure(b)
  zoneBoundaries(b)
  const base = b.finish()
  surveys.set(base, { base, atlas, variants: new WeakMap() })
  return configuredNetwork(base, rooms)
}
