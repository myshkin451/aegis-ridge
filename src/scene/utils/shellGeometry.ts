import { BRANCH_CORRIDOR, FLOORS, FLOOR_ORDER, PASSENGER_STOP, SLAB } from '../../data/floors'
import { atriumFootprint, clipZSpan } from '../../geometry/atrium'
import {
  doors,
  doorTints,
  leafOffset,
  leafThickness,
  openingsAlong,
  type WallAxis,
} from '../../geometry/doors'
import { bedrooms, escapeLobby, publicBath, quietHall, westVestibule } from '../../geometry/residentialPlan'
import { roomsOn } from '../../data/defaultBlueprint'
import type { FloorId, Point3, UndergroundId } from '../../types/shelter'
import { footprint, shaftsAt, shaftPlans, undergroundPlan } from '../../geometry/coords'
import { stairRun } from '../../geometry/stairs'
import { ModelBuilder } from './modelBuilder'
import { slabPlan } from '../../geometry/planGeometry'
import { lampTint } from '../materials/pbrLibrary'
import { plate } from './planGeometry'

export const steel = '#343e46',
  trim = '#859098',
  stone = '#b8bdba',
  warm = '#c5a988'

export function addSlab(m: ModelBuilder, id: FloorId, y = 0) {
  plate(m, slabPlan(FLOORS[id].bounds, FLOORS[id].elevation), y - SLAB, y, '#aeb7b7', '#c3c6bf')
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

export function shaftFrames(m: ModelBuilder, bottom: number, top: number, arrival: FloorId) {
  const h = top - bottom,
    cy = (bottom + top) / 2
  for (const s of shaftsAt(FLOORS[arrival].elevation)) {
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
      for (const z of [s.z0 + 0.08, s.z1 - 0.08]) {
        if (y < cy && (s.id === 'freight' || ((s.id === 'personnel' || s.id === 'escape') && z > s.z)))
          continue
        m.box(trim, [s.x, y, z], [s.w - 0.12, 0.16, 0.1], 'steel')
      }
      for (const x of [s.x0 + 0.08, s.x1 - 0.08]) {
        if (s.id === 'escape' && x < s.x && y < cy) continue
        m.box(trim, [x, y, s.z], [0.1, 0.16, s.d - 0.12], 'steel')
      }
    }
    if (s.id === 'electrical' || s.id === 'wet') {
      m.box('#71818a', [s.x, cy, s.z0 + 0.07], [s.w - 0.2, h, 0.13], 'steel')
      if (s.id === 'electrical') {
        m.box('#9da3a0', [s.x, cy, s.z], [0.12, h, s.d - 0.16], 'steel')
        m.box('#aeb4b2', [s.x0 + 0.04, cy, s.z], [0.15, h, s.d])
      }
    }
    if (s.id === 'personnel') {
      const cx = s.x1 - 0.84
      m.box('#929b97', [cx - 0.84, cy, s.z], [0.08, h, 2.1])
      for (const dx of [-0.78, 0.78]) m.box(steel, [cx + dx, cy, s.z], [0.04, h, 0.08], 'steel')
      if (FLOOR_ORDER[FLOOR_ORDER.indexOf(arrival) + 1] === PASSENGER_STOP) {
        m.box('#9da7a4', [cx, bottom - 0.08, s.z], [1.6, 0.16, 2.0], 'steel')
        m.box('#788384', [cx, bottom - 0.05, s.z1 - 0.5], [1.6, 0.1, 1.0], 'steel')
        m.box('#899695', [cx, bottom + 1.11, s.z - 0.96], [1.6, 2.22, 0.08], 'steel')
        for (const dx of [-0.77, 0.77])
          m.box('#99a6a6', [cx + dx, bottom + 1.11, s.z], [0.06, 2.22, 2.0], 'steel')
        m.box(steel, [cx, bottom + 2.25, s.z], [1.6, 0.09, 2.0], 'steel')
      }
    }
    if (s.id === 'freight') {
      for (const x of [s.x0 + 0.18, s.x1 - 0.18]) m.box('#a49276', [x, cy, s.z], [0.075, h, 0.13], 'steel')
      // Keep the head and sill clear at both ends of a through-loading landing.
      m.beam([s.x0 + 0.1, bottom + 0.1, s.z0 + 0.09], [s.x0 + 0.1, top - 0.1, s.z1 - 0.09], 0.09, 0.08, trim)
    }
  }
}

export function partition(
  m: ModelBuilder,
  floor: FloorId,
  axis: WallAxis,
  fixed: number,
  begin: number,
  end: number,
  h: number,
  glazing = false,
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
  const openings = openingsAlong(floor, axis, fixed, begin, end)
  const along = axis === 'x' ? 0 : 2
  function solid(a: number, b: number) {
    const len = b - a,
      at = (a + b) / 2
    if (len <= 0) return
    if (glazing && len > 1) {
      box(at, 0.53, len, 1.06, 0.15, '#9fa9a9')
      box(at, 1.83, len, 1.54, 0.07, '#8fb9bf', 'glass')
      box(at, (h + 2.6) / 2, len, h - 2.6, 0.15, stone)
      box(at, 1.08, len, 0.075, 0.16, steel, 'steel')
      box(at, 1.83, 0.065, 1.53, 0.11, steel, 'steel')
    } else {
      box(at, h / 2, len, h, 0.15, stone)
      box(at, 0.18, len, 0.28, 0.17, '#838d8d')
    }
  }
  let cursor = begin
  for (const d of openings) {
    const at = d.base[along],
      left = at - d.width / 2,
      right = at + d.width / 2
    solid(cursor, left)
    box(at, (h + d.height) / 2, d.width, h - d.height, 0.15, stone)
    for (const jamb of [left, right]) box(jamb, d.height / 2, 0.08, d.height, 0.21, steel, 'steel')
    box(at, d.height, d.width + 0.08, 0.1, 0.21, steel, 'steel')
    cursor = right
  }
  solid(cursor, end)
}

/** Closed drawing-view counterparts of the animated leaves, excluded from the static walk BVH. */
export function closedDoors(floor: FloorId) {
  const m = new ModelBuilder()
  for (const d of doors.filter((d) => d.floor === floor && d.axis !== 'bearing')) {
    for (let leaf = 0; leaf < 2; leaf++) {
      const offset = leafOffset(d, leaf, 0),
        track = d.trackOffset ?? 0
      m.box(
        doorTints[d.kind],
        [
          d.base[0] + Math.cos(d.yaw) * offset + Math.sin(d.yaw) * track,
          d.height / 2,
          d.base[2] - Math.sin(d.yaw) * offset + Math.cos(d.yaw) * track,
        ],
        [d.width / 2, d.height - 0.02, leafThickness],
        'steel',
        [0, d.yaw, 0],
      )
    }
  }
  return m
}

export function stairStructure(
  m: ModelBuilder,
  floor: FloorId,
  origin = 0,
  low = -Infinity,
  high = Infinity,
) {
  for (const kind of ['personnel', 'escape'] as const) {
    const run = stairRun(kind, floor)
    if (!run) continue
    for (const plate of run.plates) {
      const [x, localY, z] = plate.centre
      if (floor !== 'B4' && plate.landing && localY < 0) continue
      const y = origin + localY
      if (y < low || y >= high) continue
      m.box(plate.landing ? '#788781' : '#b0b9b4', [x, y, z], plate.size, 'steel')
    }
  }
}

export function roomStructure(m: ModelBuilder, id: UndergroundId) {
  const fullHeight = FLOORS[id].pitch - SLAB
  const wall = (axis: WallAxis, fixed: number, begin: number, end: number, glazing = false) =>
    partition(m, id, axis, fixed, begin, end, fullHeight, glazing)

  // The five rectangular core bays share their side walls. The branch is a floor, never a shaft hole.
  for (const shaft of shaftPlans.filter((s) => s.id !== 'escape')) {
    if (shaft.id !== 'wet') wall('z', shaft.x0, shaft.z0, shaft.z1)
    wall('x', shaft.z1, shaft.x0, shaft.x1)
  }
  const electrical = shaftPlans.find((s) => s.id === 'electrical')!
  wall('z', electrical.x1, electrical.z0, electrical.z1)
  const branch = footprint(BRANCH_CORRIDOR),
    eastStair = shaftPlans.find((s) => s.id === 'escape')!
  wall('x', branch.z0, branch.x0, branch.x1)
  wall('z', eastStair.x0, eastStair.z0, eastStair.z1)

  if (id === 'B2') {
    wall('x', publicBath.z1, publicBath.x0, publicBath.x1)
    wall('x', quietHall.z0, quietHall.x0, quietHall.x1)
    wall('x', quietHall.z1, quietHall.x0, quietHall.x1)
    for (const b of bedrooms) {
      if (b.x0 > quietHall.x0) wall('z', b.x0, b.z0, b.z1)
    }
    wall('z', escapeLobby.x0, westVestibule.z0, quietHall.z0)
    wall('x', escapeLobby.z1, escapeLobby.x0, escapeLobby.x1)
  }

  for (const room of roomsOn(id)) {
    const h = room.clearHeightOverride ?? FLOORS[id].clearHeight
    const r = footprint(room.bounds)
    const north = room.bounds.gz0 === 0
    wall('x', north ? r.z1 : r.z0, r.x0, r.x1, room.corridorGlazing)
    if (r.x1 < undergroundPlan.x1) wall('z', r.x1, r.z0, r.z1)
    if (north && r.x1 === undergroundPlan.x1) wall('z', r.x0, r.z0, r.z1)
    for (const x of [r.x0 + 0.28, r.x1 - 0.28])
      for (const z of [r.z0 + 0.29, r.z1 - 0.29]) {
        const nearOpening = doors.some((d) => {
          if (d.floor !== id || d.axis === 'bearing') return false
          const dx = Math.abs(x - d.base[0]),
            dz = Math.abs(z - d.base[2])
          return d.axis === 'x' ? dz < 0.55 && dx < d.width / 2 + 0.25 : dx < 0.55 && dz < d.width / 2 + 0.25
        })
        if (nearOpening) continue
        m.box('#a6adac', [x, h / 2, z], [0.34, h, 0.34])
        m.box(trim, [x, 0.08, z], [0.46, 0.16, 0.46], 'steel')
        m.box(steel, [x, h - 0.12, z], [0.48, 0.24, 0.48], 'steel')
      }
    const atrium = room.atriumVoidToBelow ? [atriumFootprint] : []
    for (let x = r.x0 + 2; x < r.x1; x += 2)
      for (const [a, b] of clipZSpan(x, r.z0 + 0.18, r.z1 - 0.18, atrium))
        m.line([x, 0.014, a], [x, 0.014, b], '#858e90')
    for (let z = r.z0 + 2; z < r.z1; z += 2) {
      const a = atrium[0]
      if (a && z > a.z0 && z < a.z1) {
        m.line([r.x0 + 0.18, 0.014, z], [a.x0, 0.014, z], '#858e90')
        m.line([a.x1, 0.014, z], [r.x1 - 0.18, 0.014, z], '#858e90')
      } else m.line([r.x0 + 0.18, 0.014, z], [r.x1 - 0.18, 0.014, z], '#858e90')
    }
    // Recessed strip lights and skirtings articulate the empty architectural bays.
    const back = north ? r.z0 + 0.19 : r.z1 - 0.19
    for (let x = r.x0 + 1.9; x < r.x1 - 0.8; x += 3.6) {
      m.box(steel, [x, h - 0.15, back], [1.8, 0.12, 0.23], 'steel')
      m.box(lampTint(id), [x, h - 0.2, back + 0.11], [1.62, 0.075, 0.08], 'lamp')
    }
  }
}
