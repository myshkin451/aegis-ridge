import { readFileSync } from 'node:fs'
import { Box3, Line3, Ray, Raycaster, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { buildMepNetwork, type MepEdge } from '../src/data/mepNetwork'
import { defaultBlueprint } from '../src/data/defaultBlueprint'
import { adits, facilityAnchor, refugeJunction, siteFacilities } from '../src/data/siteFacilities'
import { atriumFootprint } from '../src/geometry/atrium'
import { floorSection, footprint, shaftPlans } from '../src/geometry/coords'
import { doors } from '../src/geometry/doors'
import {
  decodeTile,
  groundAt,
  type AtlasInfo,
  type TerrainAtlas,
  type TileInfo,
} from '../src/geometry/siteElevations'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'
import { partition } from '../src/scene/utils/shellGeometry'
import { quietHall } from '../src/geometry/residentialPlan'
import { portPoint } from '../src/data/mepNetworkSchema'

const dir = new URL('../public/terrain/', import.meta.url)
const manifest: AtlasInfo = JSON.parse(readFileSync(new URL('atlas.json', dir), 'utf8'))
const read = (t: TileInfo) => decodeTile(t, readFileSync(new URL(t.file, dir)))
const atlas: TerrainAtlas = {
  tiles: manifest.tiles.map(read),
  insets: manifest.insets.map(read),
  road: manifest.road,
}
const net = buildMepNetwork(atlas),
  rooms = defaultBlueprint.rooms
const nodes = new Map(net.nodes.map((n) => [n.id, n]))
const segs = (e: MepEdge) =>
  e.points.slice(1).map((p, i) => new Line3(new Vector3(...e.points[i]), new Vector3(...p)))
const dirVec = new Vector3(),
  hit = new Vector3()
function overlap(line: Line3, box: Box3) {
  if (box.containsPoint(line.start) || box.containsPoint(line.end)) return true
  const ray = new Ray(line.start, line.delta(dirVec).normalize())
  return !!ray.intersectBox(box, hit) && hit.distanceToSquared(line.start) <= line.distanceSq()
}
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  return new Box3(new Vector3(x0, y0, z0), new Vector3(x1, y1, z1))
}
function traceNodes(start: string, system: MepEdge['system'], reverse = false) {
  const pending = [start],
    found = new Set(pending)
  while (pending.length) {
    const current = pending.pop()!
    for (const e of net.edges.filter((e) => e.system === system && (reverse ? e.to : e.from) === current)) {
      const n = reverse ? e.from : e.to
      if (!found.has(n)) {
        found.add(n)
        pending.push(n)
      }
    }
  }
  return found
}

it('gives every segment a unique field tag, oriented nonzero geometry and real nodes', () => {
  expect(nodes.size).toBe(net.nodes.length)
  expect(new Set(net.edges.map((e) => e.id)).size).toBe(net.edges.length)
  for (const e of net.edges) {
    expect(e.id).toMatch(/^[A-Z]+-[BL][1-4]-\d{3}$/)
    expect(e.points.length, e.id).toBeGreaterThan(1)
    expect(e.points[0]).toEqual(nodes.get(e.from)?.position)
    expect(e.points.at(-1)).toEqual(nodes.get(e.to)?.position)
    expect(segs(e).every((l) => l.distance() > 1e-6)).toBe(true)
  }
})

it('anchors spring, outfall and both intakes/return to the published terrain survey', () => {
  for (const id of ['spring', 'drain', 'westIntake', 'eastIntake', 'exhaust']) {
    expect(nodes.get(id)!.position).toEqual(facilityAnchor(siteFacilities.find((f) => f.kind === id)!, atlas))
  }
  for (const r of rooms) {
    for (const supply of ['A', 'B', 'LV', 'SA']) {
      const source = supply === 'SA' ? 'westIntake' : supply + '-board'
      const system = supply === 'SA' ? 'air' : supply === 'LV' ? 'data' : 'power'
      expect(traceNodes(source, system).has(supply + '-' + r.id), source + ' → ' + r.id).toBe(true)
    }
    expect(traceNodes('RA-' + r.id, 'air').has('exhaust')).toBe(true)
    if (r.requiresHoistRail && r.floorId.startsWith('B'))
      expect(traceNodes('HOI-102', 'freight').has('hoist-' + r.id)).toBe(true)
  }
  expect(traceNodes('eastIntake', 'air')).toContain('SA-b4_switchgear')
  for (const n of net.nodes.filter((n) => n.role === 'grille')) {
    const r = rooms.find((r) => r.id === n.roomId)!,
      rect = footprint(r.bounds)
    const [x, y, z] = n.position
    expect(x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1, n.id).toBe(true)
    expect(y - floorSection(r.floorId).floor).toBeCloseTo(
      r.clearHeightOverride ?? (r.floorId.startsWith('L') ? 3.6 : 3),
    )
  }
})

it('keeps every water pipe outside the absolute dry stack at all elevations', () => {
  const r = footprint(rooms.find((r) => r.id === 'b2_command')!.bounds)
  for (const e of net.edges.filter((e) => e.system === 'water')) {
    const dry = box(r.x0, -1000, r.z0, r.x1, 1000, r.z1).expandByScalar(e.radius)
    expect(
      segs(e).some((l) => overlap(l, dry)),
      e.id,
    ).toBe(false)
  }
})

// Three's ray/segment exact closest point plus both clamped ends gives the
// finite segment/segment distance, including parallel and skew bridge trays.
function distance(l: Line3, r: Line3) {
  const ray = new Ray(l.start, l.delta(new Vector3()).normalize())
  const onRay = new Vector3(),
    onOther = new Vector3()
  const d = ray.distanceSqToSegment(r.start, r.end, onRay, onOther)
  if (onRay.distanceToSquared(l.start) <= l.distanceSq() + 1e-9) return Math.sqrt(d)
  return r.closestPointToPoint(l.end, true, onOther).distanceTo(l.end)
}
it('checks outer-surface electrical clearance along every riser, tee and room branch', () => {
  const wet = shaftPlans.find((s) => s.id === 'wet')!,
    electric = shaftPlans.find((s) => s.id === 'electrical')!
  expect(electric.x0 - wet.x1).toBe(8)
  const wires = net.edges
    .filter((e) => e.system === 'data')
    .flatMap((e) => segs(e).map((line) => ({ e, line })))
  for (const e of net.edges.filter((e) => e.system === 'power'))
    for (const line of segs(e)) {
      for (const other of wires) {
        const gap = distance(line, other.line) - e.radius - other.e.radius
        if (gap < 0.4 - 1e-7)
          throw Error(
            e.id +
              ' ' +
              e.from +
              ' → ' +
              e.to +
              ' and ' +
              other.e.id +
              ' ' +
              other.e.from +
              ' → ' +
              other.e.to +
              ' gap ' +
              gap,
          )
      }
    }
})

it('keeps the B2/B3 garden opening and the raised B2 rooms clear of service runs', () => {
  const a = atriumFootprint,
    b2 = floorSection('B2'),
    b3 = floorSection('B3')
  const raised = rooms.filter((r) => r.clearHeightOverride)
  for (const e of net.edges.filter((e) => e.system !== 'structure'))
    for (const l of segs(e)) {
      // Radius expands a vertical perimeter. The flat end face of a vertical
      // diffuser can meet its ceiling plane without intruding under that plane.
      const vertical = Math.abs(l.start.x - l.end.x) + Math.abs(l.start.z - l.end.z) < 1e-6
      const pad = vertical ? 0 : e.radius
      expect(
        overlap(
          l,
          box(a.x0 - e.radius, b3.floor, a.z0 - e.radius, a.x1 + e.radius, b2.floor + 3.59, a.z1 + e.radius),
        ),
        e.id,
      ).toBe(false)
      for (const room of raised) {
        const r = footprint(room.bounds)
        const extra = box(
          r.x0 - e.radius,
          b2.ceiling - pad,
          r.z0 - e.radius,
          r.x1 + e.radius,
          b2.floor + 3.6 + pad - 1e-6,
          r.z1 + e.radius,
        )
        expect(overlap(l, extra), e.id + ' ' + e.from + ' ' + room.id).toBe(false)
      }
    }
})

it('places each bedroom supply branch through its surveyed acoustic sleeve', () => {
  for (const p of rooms.flatMap((r) => r.servicePorts ?? []).filter((p) => p.system === 'acoustic-sleeve')) {
    expect(nodes.get(p.id)?.position).toEqual(portPoint(p))
    expect(traceNodes('westIntake', 'air')).toContain('SA-' + p.id)
    expect(net.edges.filter((e) => e.to === p.id || e.from === p.id)).toHaveLength(2)
  }
})

it('provides upstream water sources and downstream treatment/outfall on every selected water edge', () => {
  const all = net.edges.filter((e) => e.system === 'water')
  for (const e of all) {
    const path = all.filter((other) => net.traceWater(e.id).has(other.id))
    expect(
      path.some((s) => s.from === 'spring'),
      e.id + ' source',
    ).toBe(true)
    expect(
      path.some((s) => s.to === 'drain' || s.to === 'reclaimed-tank'),
      e.id + ' outfall',
    ).toBe(true)
  }
  for (const valve of net.nodes.filter((n) => n.role === 'valve')) {
    expect(valve.id).toMatch(/^V-[BL]\d-\d{3}$/)
    const impacted = net.affectedRooms(valve.id)
    if (valve.id === 'V-B3-012')
      expect(new Set(impacted)).toEqual(
        new Set(
          net.nodes
            .filter((n) => n.role === 'valve' && n.roomId)
            .map((n) => n.roomId!)
            .concat('l2_greenhouse'),
        ),
      )
    else expect(impacted).toEqual([valve.roomId ?? 'l2_greenhouse'])
  }
  const localBranch = all.find(
    (e) => nodes.get(e.from)?.roomId === 'b2_medical' && nodes.get(e.from)?.role === 'valve',
  )!
  expect(
    all.filter((e) => net.traceWater(localBranch.id).has(e.id)).some((e) => e.to === 'b3_hydroponics-use'),
  ).toBe(false)
})

it('connects both bath discharges through B3 to the wet shaft, on independent paths', () => {
  const bath = rooms.find((r) => r.id === 'b2_bath_laundry')!
  for (const p of [...bath.servicePorts!, ...bath.equipment.flatMap((e) => e.servicePorts ?? [])].filter(
    (p) => p.plenumEntry,
  )) {
    const entry = nodes.get(p.id + '-entry')!,
      end = nodes.get(p.id + '-shaft')!
    expect(entry.position).toEqual(portPoint(p.plenumEntry!))
    expect(end.position).toEqual(portPoint(p.connectsTo!))
    const e = net.edges.find((edge) => edge.from === entry.id && edge.to === end.id)!
    expect(e.kind).toBe(p.system === 'greywater' ? 'drain' : 'vacuum')
    if (e.kind === 'drain') {
      expect(e.slope).toBeGreaterThan(0.01)
      expect(segs(e).every((s) => s.start.y > s.end.y)).toBe(true)
    }
  }
  for (const e of net.edges.filter((e) => e.kind === 'drain'))
    expect(
      segs(e).every((s) => s.start.y >= s.end.y - 1e-9),
      e.id + ' ' + e.from + ' ' + e.to,
    ).toBe(true)
})

it('connects each mechanical equipment port and keeps incident exhaust separate from the return duct', () => {
  for (const r of rooms.filter((r) => r.floorId === 'B4'))
    for (const e of r.equipment)
      for (const p of e.servicePorts ?? []) {
        expect(nodes.get(p.id)?.position).toEqual(portPoint(p))
        expect(net.edges.some((e) => e.to === p.id || e.from === p.id)).toBe(true)
        if (p.connectsTo) expect(nodes.get(p.id + '-socket')?.position).toEqual(portPoint(p.connectsTo))
        if (['battery-exhaust', 'combustion-exhaust', 'hydrogen-recovery'].includes(p.system)) {
          const path = traceNodes(p.id, 'air')
          expect(path).toContain(p.id + '-terminal')
          expect(path.has('exhaust')).toBe(false)
        }
      }
})

it('reaches distinct outdoor heads on actual terrain and closes the well-field circuit', () => {
  const heads = net.nodes.filter((n) => n.medium.endsWith('专用室外管口'))
  expect(heads).toHaveLength(5)
  const unique = new Set<string>()
  for (const h of heads) {
    const [x, y, z] = h.position
    unique.add(x + ',' + z)
    expect(y, h.id).toBeGreaterThan(groundAt(atlas, x, z).height + 1)
  }
  expect(unique.size).toBe(heads.length)
  for (const well of ['MH-421-S', 'MH-421-R', 'MH-421-S-terminal', 'MH-421-R-terminal'])
    expect(traceNodes('MH-421-S', 'air')).toContain(well)
})

it('derives each airlock boundary from its door, and joins both adits without reversing east chainage', () => {
  for (const door of doors.filter((d) => d.airlock)) {
    const edge = net.edges.find((e) => e.from === 'zone-' + door.id)!
    expect(segs(edge)[0].distance()).toBeCloseTo(door.width)
    expect(Math.max(...edge.points.map((p) => p[1]))).toBeCloseTo(door.base[1] + door.height)
  }
  expect(traceNodes('protected-hall-B4', 'structure')).toContain('adit-east')
  expect(traceNodes('protected-hall-B1', 'structure')).toContain('adit-west')
  const inBore = net.edges.find((e) => e.to === 'adit-mid')!
  const chain = inBore.points.filter((p) => p[0] >= adits.east.points[0][0])
  expect(chain.length).toBeGreaterThan(1)
  expect(chain.every((p, i) => i === 0 || p[0] >= chain[i - 1][0])).toBe(true)
  expect(chain.at(-1)![0]).toBeCloseTo(refugeJunction[0])
  const surface = net.edges.filter((e) => e.medium === '地表监测包络')
  expect(surface).toHaveLength(siteFacilities.find((f) => f.kind === 'sensors')!.points.length)
  expect(surface.at(-1)!.to).toBe(surface[0].from)
})

it('cuts and seals an actual square wall penetration for each occupied bedroom sleeve', () => {
  const b = new ModelBuilder()
  for (const z of [quietHall.z0, quietHall.z1]) {
    partition(b, 'B2', 'x', z, quietHall.x0, quietHall.x1, 3.9)
  }
  const model = b.build()
  model.object.updateMatrixWorld(true)
  const ray = new Raycaster(new Vector3(), new Vector3(0, 0, 1), 0, 0.5)
  const hits = (x: number, y: number, z: number) => {
    ray.ray.origin.set(x, y, z - 0.25)
    return ray.intersectObject(model.object, true).length > 0
  }
  try {
    for (const port of rooms
      .flatMap((r) => r.servicePorts ?? [])
      .filter((p) => p.system === 'acoustic-sleeve')) {
      const [x, y, z] = port.position
      const duct = net.edges.find((e) => e.to === port.id)!
      for (const sign of [-1, 1]) {
        const inner = sign * (duct.radius - 0.001),
          seal = sign * (duct.radius + 0.003)
        expect(hits(x + inner, y + inner, z), port.id + ' 贯通净口').toBe(false)
        expect(hits(x + seal, y, z) && hits(x, y + seal, z), port.id + ' 周边封严').toBe(true)
      }
      expect(hits(x, 3.85, z), port.id + ' 到板底').toBe(true)
    }
    for (const d of doors.filter(
      (d) => d.floor === 'B2' && d.axis === 'x' && [quietHall.z0, quietHall.z1].includes(d.base[2]),
    )) {
      expect(hits(d.base[0], 1.6, d.base[2]), d.id + ' 门洞').toBe(false)
    }
  } finally {
    model.dispose()
  }
})
