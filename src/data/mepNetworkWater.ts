import { getFloorElevation, shaftPlans } from '../geometry/coords'
import { defaultBlueprint } from './defaultBlueprint'
import { type MepNode, local, NetworkBuilder, portPoint } from './mepNetworkSchema'
import type { FloorId, Point3 } from '../types/shelter'

export function buildWater(b: NetworkBuilder) {
  const wet = shaftPlans.find((s) => s.id === 'wet')!
  const spring = b.external('spring', 'B3', 'source', '山泉原水')
  const out = b.external('drain', 'B4', 'outlet', '东冲沟重力排口')
  const rooms = defaultBlueprint.rooms
  const works = rooms.find((r) => r.id === 'b3_water')!
  const plant = works.equipment.find((e) => e.tagCode === 'WT-302')!
  const [px, , pz] = plant.position
  const clean = b.node('WT-302-feed', 'B3', local('B3', px, 2.0, pz), 'plant', '原水净化', works.id)
  b.edge('supply', 'B3', spring, clean, [local('B3', -18, 2.6, pz)], { outside: true, medium: '山泉原水' })
  const main = b.node('V-B3-012', 'B3', local('B3', -10.25, 2.35, -4.18), 'valve', '生活给水')
  for (const e of works.equipment.filter((e) => e.redundantGroup === 'potable-water')) {
    const [x, , z] = e.position
    const tank = b.node(e.tagCode, 'B3', local('B3', x, 2.45, z), 'plant', '净水罐', works.id)
    b.edge('supply', 'B3', clean, tank, [local('B3', px, 2.45, z)])
    b.edge('supply', 'B3', tank, main, [local('B3', main.position[0], 2.35, z)])
  }
  const floors = ['B4', 'B3', 'B2', 'B1', 'L1'] as const
  const supply = new Map<FloorId, MepNode>()
  for (const f of floors) supply.set(f, b.node('potable-' + f, f, local(f, wet.x - 0.7, 3.56, -4.18)))
  b.edge('supply', 'B3', main, supply.get('B3')!)
  for (let i = 1; i < floors.length; i++) {
    const lo = supply.get(floors[i - 1])!,
      hi = supply.get(floors[i])!
    b.edge('supply', lo.floor, i === 1 ? hi : lo, i === 1 ? lo : hi)
  }
  const sump = b.node('B4-sump', 'B4', local('B4', -12.7, -0.8, -6.2), 'plant', '集水沉降', 'b4_drainage')
  b.edge('drain', 'B4', sump, out, [local('B4', -17.5, -1.3, -6.2), local('B4', -18, -1.9, 13)], {
    outside: true,
    medium: '处理后重力外排',
  })
  const grey = b.node('WT-302-return', 'B3', local('B3', px, 0.42, pz), 'plant', '灰水再生', works.id)
  const reuse = b.node(
    'reclaimed-tank',
    'B3',
    local('B3', px, 0.35, pz + 2),
    'outlet',
    '回用水缓冲罐',
    works.id,
  )
  b.edge('drain', 'B3', grey, reuse, [], { medium: '再生水' })
  b.edge('drain', 'B3', grey, sump, [local('B3', -11.35, 0.3, pz), local('B4', -11.35, -0.55, pz)], {
    medium: '净水站残液',
  })
  const highCollector = b.node('upper-grey', 'B3', local('B3', wet.x - 0.52, 1.35, -3.45))
  const lowCollector = b.node('lower-grey', 'B4', local('B4', wet.x - 0.52, -0.55, -3.45))
  b.edge('drain', 'B3', highCollector, grey)
  b.edge('drain', 'B4', lowCollector, sump)
  const plumbing: [FloorId, string, number, number][] = [
    ['B1', 'b1_decon', -8.2, -3.65],
    ['B2', 'b2_medical', -8.65, -3.62],
    ['B2', 'b2_commons', -5.87, 1.0],
    ['B2', 'b2_bath_laundry', -5.8, 1.55],
    ['B3', 'b3_water', -8.2, -3.65],
    ['B3', 'b3_foodproc', -7.1, -6.8],
    ['B3', 'b3_hydroponics', -7.8, 1.45],
    ['B3', 'b3_aquaponics', 4.95, 1.45],
    ['B4', 'b4_drainage', -8.2, -3.65],
    ['B4', 'b4_cbrn_hvac', 5.2, 1.0],
    ['B4', 'b4_geothermal', -6.78, -6.6],
  ]
  for (const f of ['B1', 'B2', 'B3', 'B4'] as const) {
    const points = plumbing.filter((p) => p[0] === f)
    const inlet = supply.get(f)!
    const root = points.some((p) => p[3] > 0)
      ? b.node('potable-header-' + f, f, [inlet.position[0], inlet.position[1], -1.31])
      : inlet
    if (root !== inlet) b.edge('supply', f, inlet, root)
    const taps = b.header(
      'supply',
      root,
      0,
      points.filter((p) => p[3] > 0).map((p) => p[2]),
    )
    for (const [index, [, roomId, x, z]] of points.entries()) {
      const room = rooms.find((r) => r.id === roomId)!
      const duty = room.servicePorts?.find((p) => p.system === 'duty-sanitary')
      const tapsouth = z > 0
      const tap = tapsouth ? taps.get(x)! : inlet
      const valveAt: Point3 = tapsouth
        ? [x, tap.position[1], -0.68]
        : [x, tap.position[1], z < wet.z0 ? -5.75 : z]
      const valve = b.node(
        'V-' + f + '-' + String(21 + index).padStart(3, '0'),
        f,
        valveAt,
        'valve',
        '生活给水',
        roomId,
      )
      b.edge('supply', f, tap, valve, tapsouth ? [] : [[x, tap.position[1], tap.position[2]]])
      const kitchen = room.equipment.find((e) => e.tagCode === 'KIT-202')
      const fx = kitchen ? kitchen.position[0] + kitchen.moduleSizeM[0] / 2 : x
      const fixture = b.node(
        duty?.id ?? roomId + '-use',
        f,
        local(f, fx, duty?.position[1] ?? 0.44, z),
        'fixture',
        '用水点',
        roomId,
      )
      b.edge('supply', f, valve, fixture, [
        [x, valveAt[1], z],
        [x, fixture.position[1], z],
      ])
      const collector = f === 'B1' || f === 'B2' ? highCollector : lowCollector
      if (duty) {
        const receiving = b.node(duty.id + '-shaft', f, portPoint(duty.connectsTo!))
        b.edge('drain', f, fixture, receiving)
        b.edge('drain', f, receiving, collector, [
          [collector.position[0], receiving.position[1] - 0.02, collector.position[2]],
        ])
        continue
      }
      if (roomId === 'b2_bath_laundry') {
        const greyPort = room.servicePorts!.find((p) => p.system === 'greywater')!
        const blackPort = room.equipment
          .flatMap((e) => e.servicePorts ?? [])
          .find((p) => p.system === 'vacuum-blackwater')!
        const washer = room.equipment.flatMap((e) => e.servicePorts ?? []).find((p) => p.id === 'WM-215-G')!
        const laundryUse = b.node(washer.id, f, portPoint(washer), 'fixture', '洗衣灰水', roomId)
        b.edge('supply', f, valve, laundryUse, [[x, valveAt[1], washer.position[2]]])
        for (const p of [greyPort, blackPort]) {
          const black = p === blackPort
          const kind = black ? 'vacuum' : 'drain'
          const outlet = b.node(p.id, f, portPoint(p), 'fixture', black ? '真空黑水' : '盥洗灰水', roomId)
          if (black) b.edge('supply', f, valve, outlet, [[valveAt[0], valveAt[1], p.position[2]]])
          else {
            b.edge('drain', f, fixture, outlet)
            b.edge('drain', f, laundryUse, outlet)
          }
          const entry = b.node(p.id + '-entry', 'B3', portPoint(p.plenumEntry!))
          const shaft = b.node(p.id + '-shaft', 'B3', portPoint(p.connectsTo!))
          b.edge(kind, 'B3', outlet, entry)
          b.edge(kind, 'B3', entry, shaft, [
            [entry.position[0], (entry.position[1] + shaft.position[1]) / 2, shaft.position[2]],
          ])
          if (black) {
            const receiver = b.node(
              'vacuum-receiver',
              'B4',
              local('B4', shaft.position[0], 0.8, shaft.position[2]),
              'plant',
              '真空收集罐',
            )
            b.edge(kind, 'B4', shaft, receiver)
            b.edge('drain', 'B4', receiver, sump, [], { medium: '预处理排水' })
          } else b.edge(kind, 'B3', shaft, collector)
        }
        continue
      }
      // Drops discharge below the fixture floor. Keep horizontal waste above the
      // corridor below, clear of the raised commons and the double-height atrium.
      const under = f === 'B1' ? 'B2' : f === 'B2' ? 'B3' : 'B4'
      const h = f === 'B4' ? -0.27 : getFloorElevation(under) - getFloorElevation(f) + 3.42
      const stack = b.node(roomId + '-waste', under, local(f, wet.x - 0.52, h - 0.16, -3.45))
      const path = [
        local(f, x, h, z),
        local(f, x, h - 0.04, z > 0 ? -0.6 : z),
        local(f, stack.position[0], h - 0.12, z > 0 ? -0.6 : z),
      ]
      b.edge('drain', under, fixture, stack, path)
      b.edge('drain', under, stack, collector)
    }
  }
  // The wet shaft ends at L1. Cross the garage ceiling first, then rise in
  // the greenhouse's southern wet zone, away from the NE dry stack.
  const l1 = supply.get('L1')!,
    f: FloorId = 'L2'
  const gh = b.node('GH-use', f, local(f, 4.8, 0.36, 2.8), 'fixture', '温室灌溉', 'l2_greenhouse')
  const valve = b.node('V-L1-021', 'L1', local('L1', -7.7, 3.65, 2.8), 'valve', '温室给水')
  b.edge('supply', 'L1', l1, valve)
  b.edge('supply', f, valve, gh, [local('L1', 4.8, 3.65, 2.8)])
  const wasteTop = b.node('GH-return', 'L1', local('L1', wet.x - 0.52, 3.1, -3.45))
  b.edge('drain', 'L1', gh, wasteTop, [local('L1', 4.8, 3.53, 2.8), local('L1', wet.x - 0.52, 3.25, 2.8)])
  b.edge('drain', 'B1', wasteTop, highCollector)
}
