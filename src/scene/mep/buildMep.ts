import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type ShaderMaterial,
} from 'three'
import type { MepEdge, MepNetwork } from '../../data/mepNetwork'
import { defaultBlueprint } from '../../data/defaultBlueprint'
import { FLOORS, FLOOR_ORDER } from '../../data/floors'
import { footprint, getFloorElevation } from '../../geometry/coords'
import { systems } from '../../store/useShelterStore'
import { makeMepMaterial, makePlates } from './mepMaterial'

const up = new Vector3(0, 1, 0),
  east = new Vector3(1, 0, 0)
const metal = '#84918f',
  galvanized = '#9ea6a1',
  rail = '#60676a'
const isDrain = (edge: MepEdge) => edge.kind === 'drain' || edge.kind === 'vacuum'
const channel = (edge: MepEdge) => (isDrain(edge) ? 6 : systems.indexOf(edge.system))
const pattern = (edge: MepEdge) =>
  isDrain(edge)
    ? 2
    : ({ data: 1, freight: 3, structure: 4 }[edge.system as 'data' | 'freight' | 'structure'] ?? 0)
function idColour(edge: MepEdge) {
  if (edge.kind === 'hydrogen') return '#e1b921'
  if (edge.system === 'water' || edge.kind === 'heat') return '#49a051'
  return '#c5c8c4'
}
function gradeLabel(a: number[], b: number[]) {
  const run = Math.hypot(a[0] - b[0], a[2] - b[2])
  const fall = a[1] - b[1]
  return run > 0.6 && fall > 0.0001 && fall / run <= 0.35
    ? `i = ${Number(((1000 * fall) / run).toFixed(1))}‰`
    : ''
}
function overhead(edge: MepEdge, a: Vector3, b: Vector3) {
  if (edge.system === 'structure' || edge.outside) return false
  const floor = FLOORS[edge.floor]
  const low = floor.elevation + floor.clearHeight,
    high = floor.elevation + floor.pitch
  return Math.min(a.y, b.y) >= low - 0.007 && Math.max(a.y, b.y) < high - 0.01
}
const label = (edge: MepEdge, reverse: boolean) => (reverse ? `◀ ${edge.medium}` : `${edge.medium} ▶`)

type Shape = 'bar' | 'box' | 'plate'
type Instance = { matrix: Matrix4; color: string; meta: number[]; path: number[] }
class Batch {
  plenum = false
  readonly parts: Record<Shape, Instance[]> = { bar: [], box: [], plate: [] }
  add(
    shape: Shape,
    position: Vector3,
    size: Vector3,
    rotation: Quaternion,
    color: string,
    meta: number[],
    path = [0, 0, 0, 0],
  ) {
    this.parts[shape].push({
      matrix: new Matrix4().compose(position, rotation, size),
      color,
      meta,
      path: [path[0], path[1], path[2], path[3] + (this.plenum ? 8 : 0)],
    })
  }
  build(material: ShaderMaterial, name: string) {
    const group = new Group()
    group.name = name
    for (const shape of ['bar', 'box', 'plate'] as const) {
      const rows = this.parts[shape]
      if (!rows.length) continue
      const g =
        shape === 'bar'
          ? new CylinderGeometry(0.5, 0.5, 1, 8)
          : shape === 'plate'
            ? new PlaneGeometry()
            : new BoxGeometry()
      g.setAttribute('aMeta', new InstancedBufferAttribute(new Float32Array(rows.flatMap((r) => r.meta)), 4))
      g.setAttribute('aPath', new InstancedBufferAttribute(new Float32Array(rows.flatMap((r) => r.path)), 4))
      const mesh = new InstancedMesh(g, material, rows.length)
      const colour = new Color()
      rows.forEach((row, i) => {
        mesh.setMatrixAt(i, row.matrix)
        mesh.setColorAt(i, colour.set(row.color))
      })
      mesh.computeBoundingSphere()
      group.add(mesh)
    }
    return group
  }
}

export interface PickSpan {
  a: Vector3
  b: Vector3
  edge: MepEdge
  radius: number
  kind: 'pipe' | 'valve'
  id: string
  plenum: boolean
}

export function buildMep(network: MepNetwork) {
  const rooms = defaultBlueprint.rooms
  const valves = network.nodes.filter((n) => n.role === 'valve')
  const grades = network.edges
    .filter((e) => e.kind === 'drain')
    .flatMap((e) => e.points.slice(1).map((b, i) => gradeLabel(e.points[i], b)))
  const plates = makePlates([
    ...network.edges.flatMap((e) => [label(e, false), label(e, true)]),
    ...grades,
    ...valves.map((n) => n.id),
  ])
  const palette = makeMepMaterial(network.edges.length + rooms.length, plates)
  const macro = new Batch(),
    detail = new Batch(),
    outlines = new Batch()
  const spans: PickSpan[] = [],
    roomIndex = new Map<string, number>()
  const edges = new Map(network.edges.map((e, i) => [e.id, i]))
  const attached = new Map<string, MepEdge>()
  const turn = new Quaternion(),
    identity = new Quaternion(),
    size = new Vector3()
  const point = new Vector3(),
    side = new Vector3(),
    mid = new Vector3()
  const floorChannels = new Map<number, Set<string>>()
  for (const [i, edge] of network.edges.entries()) {
    const ch = channel(edge),
      floor = FLOOR_ORDER.indexOf(edge.floor),
      kind = pattern(edge)
    const meta = (style: number) => [ch, floor, i, style]
    if (!floorChannels.has(floor)) floorChannels.set(floor, new Set())
    floorChannels.get(floor)!.add(edge.system)
    attached.set(edge.from, edge)
    if (!attached.has(edge.to)) attached.set(edge.to, edge)
    let at = 0,
      printedGrade = false
    const diameter = 2 * edge.radius
    const duct = edge.kind === 'airSupply' || edge.kind === 'airReturn' || edge.kind === 'exhaust'
    const tray = edge.system === 'power' || edge.system === 'data'
    const isRail = edge.kind === 'freight'
    const band = idColour(edge)
    for (let j = 1; j < edge.points.length; j++) {
      const a = new Vector3(...edge.points[j - 1]),
        b = new Vector3(...edge.points[j])
      const dir = b.clone().sub(a),
        length = dir.length()
      if (length < 0.0001) continue
      dir.divideScalar(length)
      turn.setFromUnitVectors(up, dir)
      side.crossVectors(dir, up)
      if (side.lengthSq() < 0.0001) side.copy(east)
      side.normalize()
      mid.lerpVectors(a, b, 0.5)
      const plenum = overhead(edge, a, b)
      macro.plenum = detail.plenum = plenum
      if (edge.system === 'water')
        spans.push({ a, b, edge, radius: edge.radius, kind: 'pipe', id: edge.id, plenum })
      // Align rectangular stock with its web vertical, including north/south tray runs.
      const face = new Vector3().crossVectors(side, dir).normalize()
      const stock = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(side, dir, face))
      const width = edge.outside ? 0.1 : Math.min(0.112, Math.max(0.062, diameter * 0.73))
      for (const offset of duct ? [-0.076, 0.076] : [0]) {
        point.copy(mid).addScaledVector(side, offset)
        const boundary = edge.kind === 'structure'
        const stroke = boundary ? 0.125 : duct ? width * 0.69 : width
        macro.add(
          boundary ? 'box' : 'bar',
          point,
          size.set(stroke, length, boundary ? 0.014 : stroke),
          boundary ? stock : turn,
          metal,
          meta(0),
          [at, length, 0, kind],
        )
      }
      if (edge.kind === 'supply') {
        for (let d = length < 0.8 ? length / 2 : 0.35; d < length; d += edge.outside ? 25 : 3.3) {
          point.copy(a).addScaledVector(dir, d)
          macro.add('bar', point, size.set(width * 2.9, 0.08, width * 2.9), turn, metal, meta(0))
        }
      }
      // A single printed grade on the first long horizontal invert of each drain.
      const grade = edge.kind === 'drain' ? gradeLabel(edge.points[j - 1], edge.points[j]) : ''
      if (grade && !printedGrade && length > 1.8) {
        point.copy(mid).y += 0.25
        macro.add('plate', point, size.set(0.96, 0.22, 1), identity, metal, meta(3), [
          0,
          0,
          plates.index.get(grade)!,
          5,
        ])
        printedGrade = true
      }
      if (edge.system === 'structure') {
        detail.add('box', mid, size.set(0.11, length, 0.11), turn, metal, meta(0), [at, length, 0, 4])
        at += length
        continue
      }
      if (isRail) {
        detail.add('box', mid, size.set(diameter * 0.2, length, diameter), stock, rail, meta(1))
        for (const sign of [-1, 1]) {
          point.copy(mid).addScaledVector(face, sign * diameter * 0.46)
          detail.add('box', point, size.set(diameter, length, diameter * 0.12), stock, rail, meta(1))
        }
      } else if (tray) {
        detail.add('box', mid, size.set(diameter * 0.9, length, diameter * 0.5), stock, rail, meta(1))
        for (const sign of [-1, 1]) {
          point
            .copy(mid)
            .addScaledVector(side, sign * diameter * 0.43)
            .addScaledVector(face, diameter * 0.22)
          detail.add('box', point, size.set(0.016, length, diameter * 0.74), stock, galvanized, meta(1))
        }
      } else {
        detail.add(
          duct ? 'box' : 'bar',
          mid,
          size.set(diameter, length, diameter),
          duct ? stock : turn,
          galvanized,
          meta(1),
        )
      }
      // Exterior pipes are buried. Keep fittings dense only in plant spaces and galleries.
      const step = edge.outside ? 35 : 2.7
      for (let d = Math.min(0.45, length * 0.5); d < length; d += step) {
        point.copy(a).addScaledVector(dir, d)
        const fitting = duct || tray || isRail ? 'box' : 'bar'
        detail.add(
          fitting,
          point,
          size.set(diameter * (tray ? 1 : 1.14), 0.044, diameter * (tray ? 0.75 : 1.14)),
          duct || tray || isRail ? stock : turn,
          metal,
          meta(1),
        )
        if (tray || isRail || length < 0.65) continue
        point.addScaledVector(dir, Math.min(0.11, length * 0.12))
        detail.add(
          fitting,
          point,
          size.set(diameter * 1.035, 0.11, diameter * 1.035),
          duct ? stock : turn,
          band,
          meta(2),
        )
      }
      if (!edge.outside && length >= 1.25 && !tray && !isRail) {
        // A plate hangs alongside the pipe, with the arrow following the signed run.
        const horizontal = new Vector3(dir.x, 0, dir.z)
        const vertical = horizontal.lengthSq() < 0.02
        if (vertical) horizontal.copy(east)
        horizontal.normalize()
        const reverse =
          !vertical && (horizontal.x < -0.02 || (Math.abs(horizontal.x) < 0.02 && horizontal.z > 0))
        if (reverse) horizontal.negate()
        const textAxis = vertical ? up.clone().multiplyScalar(Math.sign(dir.y)) : horizontal
        const textUp = vertical ? east.clone().negate().multiplyScalar(Math.sign(dir.y)) : up
        const normal = textAxis.clone().cross(textUp)
        const plateTurn = new Quaternion().setFromRotationMatrix(
          new Matrix4().makeBasis(textAxis, textUp, normal),
        )
        point.copy(mid).addScaledVector(normal, edge.radius + 0.015)
        detail.add('plate', point, size.set(0.44, 0.1, 1), plateTurn, metal, meta(3), [
          0,
          0,
          plates.index.get(label(edge, reverse))!,
          reverse ? 2 : 1,
        ])
      }
      at += length
    }
  }
  for (const node of network.nodes) {
    const edge = attached.get(node.id)
    if (!edge) continue
    const meta = (style: number) => [
      channel(edge),
      FLOOR_ORDER.indexOf(node.floor),
      edges.get(edge.id)!,
      style,
    ]
    const p = new Vector3(...node.position)
    macro.plenum = detail.plenum = overhead(edge, p, p)
    if (node.role === 'valve') {
      const hand = p.clone().addScaledVector(up, 0.19)
      spans.push({ a: p, b: hand, edge, radius: 0.19, kind: 'valve', id: node.id, plenum: macro.plenum })
      detail.add(
        'bar',
        point.lerpVectors(p, hand, 0.5),
        size.set(0.035, 0.19, 0.035),
        identity,
        metal,
        meta(1),
      )
      // An open-rim handwheel and three spokes share the existing rod batch.
      const wheel = '#a6412c'
      const sides = 10
      for (let k = 0; k < sides; k++) {
        const a = (2 * Math.PI * k) / sides,
          b = (2 * Math.PI * (k + 1)) / sides
        const p0 = hand.clone().add(new Vector3(0.107 * Math.cos(a), 0, 0.107 * Math.sin(a)))
        const p1 = hand.clone().add(new Vector3(0.107 * Math.cos(b), 0, 0.107 * Math.sin(b)))
        const d = p1.clone().sub(p0)
        detail.add(
          'bar',
          point.lerpVectors(p0, p1, 0.5),
          size.set(0.019, d.length() + 0.006, 0.019),
          turn.setFromUnitVectors(up, d.normalize()),
          wheel,
          meta(2),
        )
      }
      for (let i = 0; i < 3; i++) {
        const angle = (i * 2 * Math.PI) / 3
        const d = new Vector3(Math.sin(angle), 0, Math.cos(angle))
        detail.add(
          'bar',
          point.copy(hand).addScaledVector(d, 0.05),
          size.set(0.016, 0.1, 0.016),
          turn.setFromUnitVectors(up, d),
          wheel,
          meta(2),
        )
      }
      detail.add('box', p, size.set(0.18, 0.14, 0.18), identity, metal, meta(1))
      point.copy(p).y -= 0.14
      detail.add('plate', point, size.set(0.39, 0.095, 1), identity, metal, meta(3), [
        0,
        0,
        plates.index.get(node.id)!,
        0,
      ])
      macro.add(
        'box',
        p,
        size.set(0.22, 0.22, 0.22),
        new Quaternion().setFromAxisAngle(east, Math.PI / 4),
        metal,
        meta(0),
      )
    }
    if (node.role === 'grille') {
      // A shallow diffuser flange meets the installed duct terminal, with return louvers below it.
      p.y -= 0.016
      detail.add('box', p, size.set(0.48, 0.024, 0.34), identity, '#737b78', meta(1))
      for (let slat = 0; slat < 7; slat++) {
        point.copy(p).add(new Vector3(0, -0.021, (slat - 3) * 0.043))
        detail.add('box', point, size.set(0.44, 0.025, 0.02), identity, '#b7bcb4', meta(1))
      }
    }
  }
  for (const [i, r] of rooms.entries()) {
    const index = network.edges.length + i,
      floor = FLOOR_ORDER.indexOf(r.floorId),
      f = footprint(r.bounds),
      y = getFloorElevation(r.floorId)
    roomIndex.set(r.id, index)
    const meta = [2, floor, index, 4]
    for (const height of [0.1, 2.97]) {
      for (const z of [f.z0 + 0.05, f.z1 - 0.05])
        outlines.add(
          'box',
          point.set(f.x, y + height, z),
          size.set(f.w - 0.1, 0.06, 0.06),
          identity,
          rail,
          meta,
        )
      for (const x of [f.x0 + 0.05, f.x1 - 0.05])
        outlines.add(
          'box',
          point.set(x, y + height, f.z),
          size.set(0.06, 0.06, f.d - 0.1),
          identity,
          rail,
          meta,
        )
    }
    for (const x of [f.x0 + 0.05, f.x1 - 0.05])
      for (const z of [f.z0 + 0.05, f.z1 - 0.05])
        outlines.add('box', point.set(x, y + 1.535, z), size.set(0.06, 2.87, 0.06), identity, rail, meta)
  }
  const drawing = macro.build(palette.material, '系统图'),
    physical = detail.build(palette.material, '实体管线')
  // Draw downstream outlines over the partition they describe, without adding a postprocessing pass.
  const outlineMaterial = palette.material.clone()
  outlineMaterial.uniforms = palette.uniforms
  outlineMaterial.depthTest = false
  outlineMaterial.depthWrite = false
  const affected = outlines.build(outlineMaterial, '阀门影响房间')
  affected.children.forEach((m) => (m.renderOrder = 14))
  const root = new Group()
  root.name = '六系统工程管网'
  root.userData.skipWalk = true
  root.add(drawing, physical, affected)
  function mark(trace: string | null, valve: string | null) {
    palette.mask.fill(0)
    const chain = trace ? network.traceWater(trace) : new Set<string>()
    for (const id of chain) {
      const index = edges.get(id)
      if (index !== undefined) palette.mask[index * 4] = 255
    }
    const downstream = (valve ? network.affectedRooms(valve) : []).filter((id) => roomIndex.has(id))
    for (const id of downstream) palette.mask[roomIndex.get(id)! * 4] = 255
    palette.texture.needsUpdate = true
    palette.uniforms.uTrace.value = Number(chain.size > 0)
    affected.visible = downstream.length > 0
    return { count: chain.size, rooms: downstream }
  }
  function dispose() {
    root.traverse((o) => {
      if (o instanceof InstancedMesh) {
        o.geometry.dispose()
        o.dispose()
      }
    })
    palette.texture.dispose()
    plates.texture.dispose()
    palette.material.dispose()
    outlineMaterial.dispose()
  }
  return {
    root,
    drawing,
    physical,
    affected,
    uniforms: palette.uniforms,
    spans,
    mark,
    dispose,
    floorChannels,
  }
}
