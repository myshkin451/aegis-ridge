import { FLOORS, SLAB } from '../../data/floors'
import { roomsOn } from '../../data/defaultBlueprint'
import type { FloorId, GridBounds, Point3, UndergroundId } from '../../types/shelter'
import { footprint, shaftPlans, undergroundPlan } from './coords'
import type { ModelBuilder } from './modelBuilder'
import { difference, plate, rectangle } from './planGeometry'

export const steel = '#343e46',
  trim = '#859098',
  stone = '#b8bdba',
  warm = '#c5a988'
const holes = shaftPlans.map((s) => rectangle(s.x0, s.x1, s.z0, s.z1))

export function slabPlan(bounds: GridBounds) {
  const a = footprint(bounds)
  return difference(rectangle(a.x0, a.x1, a.z0, a.z1), ...holes)
}

export function addSlab(m: ModelBuilder, id: FloorId, y = 0) {
  plate(m, slabPlan(FLOORS[id].bounds), y - SLAB, y, '#aeb7b7', '#c3c6bf')
}

export function iBeam(
  m: ModelBuilder,
  x: number,
  y: number,
  z: number,
  length: number,
  alongX: boolean,
  depth = 0.24,
) {
  const width = depth * 0.68,
    flange = depth * 0.16
  for (const shift of [-1, 1])
    m.box(
      steel,
      [x, y + (shift * (depth - flange)) / 2, z],
      alongX ? [length, flange, width] : [width, flange, length],
      'steel',
    )
  m.box('#596369', [x, y, z], alongX ? [length, depth, flange] : [flange, depth, length], 'steel')
}

export function shaftFrames(m: ModelBuilder, bottom: number, top: number) {
  const h = top - bottom,
    cy = (bottom + top) / 2
  for (const s of shaftPlans) {
    const finish = {
      freight: '#ad9875',
      personnel: '#7c9095',
      wet: '#638889',
      electrical: '#a49678',
      escape: '#899992',
    }[s.id]
    for (const x of [s.x0 + 0.08, s.x1 - 0.08])
      for (const z of [s.z0 + 0.08, s.z1 - 0.08]) m.box(finish, [x, cy, z], [0.14, h, 0.14], 'steel')
    for (const y of [bottom + 0.09, top - 0.09]) {
      for (const z of [s.z0 + 0.08, s.z1 - 0.08]) m.box(trim, [s.x, y, z], [s.w - 0.12, 0.16, 0.1], 'steel')
      for (const x of [s.x0 + 0.08, s.x1 - 0.08]) m.box(trim, [x, y, s.z], [0.1, 0.16, s.d - 0.12], 'steel')
    }
    if (s.id === 'electrical' || s.id === 'wet') {
      m.box('#71818a', [s.x, cy, s.z0 + 0.07], [s.w - 0.2, h, 0.13], 'steel')
      if (s.id === 'electrical') {
        m.box('#9da3a0', [s.x, cy, s.z], [0.12, h, s.d - 0.16], 'steel')
        m.box('#aeb4b2', [s.x0 + 0.04, cy, s.z], [0.15, h, s.d])
      }
    }
    if (s.id === 'escape') {
      for (const dx of [-0.33, 0.33]) m.box(trim, [s.x + dx, cy, s.z0 + 0.25], [0.07, h, 0.09], 'steel')
      for (let y = bottom + 0.2; y < top; y += 0.35)
        m.box('#bba985', [s.x, y, s.z0 + 0.27], [0.68, 0.06, 0.09], 'steel')
    }
    if (s.id === 'personnel') {
      const count = Math.ceil(h / 0.22),
        half = Math.ceil(count / 2)
      for (let i = 0; i < count; i++) {
        const returning = i >= half,
          run = returning ? count - half : half,
          step = returning ? i - half : i
        const f = (step + 0.5) / run
        m.box(
          '#a2aca9',
          [
            s.x + (returning ? 0.39 : -0.39),
            bottom + ((i + 1) * h) / count,
            s.z + (returning ? 0.5 - f : f - 0.5) * 1.62,
          ],
          [0.7, 0.074, 1.68 / run],
          'steel',
        )
      }
      m.box(trim, [s.x, bottom + (h * half) / count, s.z + 0.83], [1.65, 0.1, 0.24], 'steel')
    }
    if (s.id === 'freight') {
      for (const x of [s.x0 + 0.18, s.x1 - 0.18]) m.box('#a49276', [x, cy, s.z], [0.075, h, 0.13], 'steel')
      m.beam([s.x0 + 0.1, bottom + 0.1, s.z0 + 0.09], [s.x1 - 0.1, top - 0.1, s.z0 + 0.09], 0.09, 0.08, trim)
    }
  }
}

function partition(
  m: ModelBuilder,
  axis: 'x' | 'z',
  fixed: number,
  begin: number,
  end: number,
  h: number,
  glazing: boolean,
) {
  const p = (along: number, y: number): Point3 => (axis === 'x' ? [along, y, fixed] : [fixed, y, along])
  const box = (
    at: number,
    y: number,
    length: number,
    height: number,
    thickness: number,
    tint: string,
    finish: 'stone' | 'steel' | 'glass' = 'stone',
  ) => m.box(tint, p(at, y), axis === 'x' ? [length, height, thickness] : [thickness, height, length], finish)
  const centre = (begin + end) / 2,
    door = 2.04,
    head = 2.4
  for (const [a, b] of [
    [begin, centre - door / 2],
    [centre + door / 2, end],
  ]) {
    const len = b - a,
      at = (a + b) / 2
    if (len <= 0) continue
    if (glazing && len > 1) {
      box(at, 0.53, len, 1.06, 0.15, '#9fa9a9')
      box(at, 1.83, len, 1.54, 0.07, '#8fb9bf', 'glass')
      box(at, 2.8, len, 0.4, 0.15, stone)
      box(at, 1.08, len, 0.075, 0.16, steel, 'steel')
      box(at, 1.83, 0.065, 1.53, 0.11, steel, 'steel')
    } else {
      box(at, h / 2, len, h, 0.15, stone)
      box(at, 0.18, len, 0.28, 0.17, '#838d8d')
    }
  }
  box(centre, (h + head) / 2, door, h - head, 0.15, stone)
  for (const at of [centre - door / 2, centre + door / 2]) box(at, head / 2, 0.1, head, 0.21, steel, 'steel')
  box(centre, head, door + 0.1, 0.12, 0.21, steel, 'steel')
}

export function roomStructure(m: ModelBuilder, id: UndergroundId) {
  const h = FLOORS[id].clearHeight
  for (const room of roomsOn(id)) {
    const r = footprint(room.bounds)
    const north = room.bounds.gz0 === 0
    const front = north ? r.z1 - 0.085 : r.z0 + 0.085
    partition(m, 'x', front, r.x0, r.x1, h, id === 'B2' || id === 'B3')
    if (r.x1 < undergroundPlan.x1) partition(m, 'z', r.x1, r.z0, r.z1, h, false)
    for (const x of [r.x0 + 0.28, r.x1 - 0.28])
      for (const z of [r.z0 + 0.29, r.z1 - 0.29]) {
        m.box('#a6adac', [x, h / 2, z], [0.34, h, 0.34])
        m.box(trim, [x, 0.08, z], [0.46, 0.16, 0.46], 'steel')
        m.box(steel, [x, h - 0.12, z], [0.48, 0.24, 0.48], 'steel')
      }
    for (let x = r.x0 + 2; x < r.x1; x += 2)
      m.line([x, 0.014, r.z0 + 0.18], [x, 0.014, r.z1 - 0.18], '#858e90')
    for (let z = r.z0 + 2; z < r.z1; z += 2)
      m.line([r.x0 + 0.18, 0.014, z], [r.x1 - 0.18, 0.014, z], '#858e90')
    // Recessed strip lights and skirtings articulate the empty architectural bays.
    const back = north ? r.z0 + 0.19 : r.z1 - 0.19
    for (let x = r.x0 + 1.9; x < r.x1 - 0.8; x += 3.6) {
      m.box(steel, [x, h - 0.15, back], [1.8, 0.12, 0.23], 'steel')
      m.box('#f6d599', [x, h - 0.2, back + 0.11], [1.62, 0.075, 0.08], 'lamp')
    }
  }
}
