import { roomsOn } from '../../data/defaultBlueprint'
import { FLOORS } from '../../data/floors'
import { pilotFixtures } from '../../data/roomLayouts/residential'
import { atriumFootprint } from '../../geometry/atrium'
import { footprint } from '../../geometry/coords'
import { openingsAlong, type WallAxis } from '../../geometry/doors'
import { bedrooms, laundry, publicBath, type PlanRect } from '../../geometry/residentialPlan'
import type { Point3 } from '../../types/shelter'
import type { Finish } from '../materials/pbrLibrary'
import { liningCentre } from './floorFinishes'
import { ModelBuilder } from '../utils/modelBuilder'

const plaster = '#eae5da',
  oak = '#c2a078',
  skirting = '#9b7856'
const livingRooms = roomsOn('B2').filter((r) => r.id === 'b2_library' || r.id === 'b2_commons')

/** Thin interior finishes stop at the surveyed reveals and at the glass observation windows. */
function wallFace(
  m: ModelBuilder,
  axis: WallAxis,
  fixed: number,
  start: number,
  end: number,
  inward: number,
  h: number,
  tiled: boolean,
  glazing: boolean,
) {
  const face = liningCentre(axis, fixed, inward, 0.012)
  function panel(
    a: number,
    b: number,
    bottom: number,
    top: number,
    inset: number,
    tint: string,
    finish: Finish,
  ) {
    if (b - a < 0.001 || top <= bottom) return
    const mid = (a + b) / 2,
      y = (top + bottom) / 2,
      row = face + inward * inset
    m.box(
      tint,
      axis === 'x' ? [mid, y, row] : [row, y, mid],
      axis === 'x' ? [b - a, top - bottom, 0.012] : [0.012, top - bottom, b - a],
      finish,
    )
  }
  function solid(a: number, b: number) {
    if (tiled) {
      panel(a, b, 0, h, 0, '#d8d3c4', 'tile')
    } else {
      const glazed = glazing && b - a > 1
      panel(a, b, 0.867, glazed ? 1.05 : h, 0, plaster, 'plaster')
      if (glazed) panel(a, b, 2.6, h, 0, plaster, 'plaster')
      // Boards run to a continuous cap rail. Shallow reveals break the lower wall into joinery bays.
      for (let x = a; x < b; x += 0.59)
        panel(x + 0.002, Math.min(x + 0.588, b), 0.075, 0.843, 0.009, oak, 'oak_int')
      panel(a, b, 0.843, 0.867, 0.016, oak, 'oak_int')
      panel(a, b, 0, 0.075, 0.022, skirting, 'oak_int')
    }
  }
  let cursor = start
  for (const d of openingsAlong('B2', axis, fixed, start, end)) {
    const at = d.base[axis === 'x' ? 0 : 2],
      left = at - d.width / 2,
      right = at + d.width / 2
    solid(cursor, left)
    panel(left, right, d.height, h, 0, tiled ? '#d8d3c4' : plaster, tiled ? 'tile' : 'plaster')
    const trim = tiled ? 'steel' : 'oak_int',
      tint = tiled ? '#98998e' : skirting
    panel(left - 0.067, left, 0, d.height, 0.026, tint, trim)
    panel(right, right + 0.067, 0, d.height, 0.026, tint, trim)
    panel(left - 0.067, right + 0.067, d.height + 0.003, d.height + 0.069, 0.026, tint, trim)
    cursor = right
  }
  solid(cursor, end)
}

function finishRoom(m: ModelBuilder, r: PlanRect, height: number, tiled = false, glazing = false) {
  wallFace(m, 'x', r.z0, r.x0, r.x1, 1, height, tiled, glazing)
  wallFace(m, 'x', r.z1, r.x0, r.x1, -1, height, tiled, false)
  wallFace(m, 'z', r.x0, r.z0, r.z1, 1, height, tiled, false)
  wallFace(m, 'z', r.x1, r.z0, r.z1, -1, height, tiled, false)
  const floor = (x0: number, x1: number, z0: number, z1: number) => {
    m.box(
      tiled ? '#b9b3a5' : '#b69878',
      [(x0 + x1) / 2, 0.018, (z0 + z1) / 2],
      [x1 - x0, 0.009, z1 - z0],
      tiled ? 'tile' : 'oak_int',
    )
  }
  if (glazing) {
    const a = atriumFootprint
    floor(r.x0 + 0.083, a.x0, r.z0 + 0.083, r.z1 - 0.083)
    floor(a.x1, r.x1 - 0.083, r.z0 + 0.083, r.z1 - 0.083)
    floor(a.x0, a.x1, r.z0 + 0.083, a.z0)
    floor(a.x0, a.x1, a.z1, r.z1 - 0.083)
  } else floor(r.x0 + 0.083, r.x1 - 0.083, r.z0 + 0.083, r.z1 - 0.083)
}

function rug(m: ModelBuilder, x: number, z: number, w: number, d: number, main: string) {
  m.box(main, [x, 0.029, z], [w, 0.012, d], 'fabric')
  for (const side of [-1, 1]) {
    for (const offset of [0.073, 0.108, 0.17])
      m.decalBox('#c9bda4', [x, 0.04, z + side * (d / 2 - offset)], [w - 0.025, 0.002, 0.011], 'fabric')
    for (let u = 0.028; u < w; u += 0.052)
      m.box('#c3b69e', [x - w / 2 + u, 0.027, z + side * (d / 2 + 0.017)], [0.013, 0.003, 0.042], 'fabric')
  }
}

function lamp(m: ModelBuilder, [x, y, z]: Point3, diameter: number, height: number, hanging: boolean) {
  m.part(
    'pleated-shade',
    'fabric',
    hanging ? '#c9af8f' : '#e6c398',
    [x, y + height / 2, z],
    [diameter, height, diameter],
  )
  m.part('round', 'lamp', '#ffdc9c', [x, y + 0.008, z], [diameter * 0.94, 0.01, diameter * 0.94])
  m.part('round', 'steel', '#857665', [x, y + height, z], [diameter * 0.68, 0.015, diameter * 0.68])
  if (hanging) {
    m.beam([x, y + height, z], [x, 3.59, z], 0.016, 0.016, '#443e38', 'steel')
    m.part('round', 'steel', '#675f54', [x, 3.582, z], [0.135, 0.03, 0.135])
  }
}

function plant(m: ModelBuilder, x: number, y: number, z: number, scale: number) {
  m.part('round', 'ceramic', '#a97c63', [x, y + 0.13 * scale, z], [0.28 * scale, 0.26 * scale, 0.28 * scale])
  m.part('round', 'epoxy', '#544e3e', [x, y + 0.26 * scale, z], [0.24 * scale, 0.018 * scale, 0.24 * scale])
  m.part(
    'houseplant',
    'foliage',
    '#718361',
    [x, y + 0.47 * scale, z],
    [0.66 * scale, 0.46 * scale, 0.6 * scale],
  )
}

function communalShelves(m: ModelBuilder) {
  // Cookbooks from the shared kitchen, a pottery bowl and the plant kept above the sofa.
  for (const y of [1.56, 2.19]) {
    m.box(oak, [-11.1, y, 11.56], [3.82, 0.041, 0.37], 'oak_int')
    for (const x of [-12.45, -9.75]) m.box('#867563', [x, y - 0.078, 11.69], [0.035, 0.15, 0.065], 'steel')
  }
  for (let i = 0; i < 13; i++) {
    const h = 0.24 + (i % 4) * 0.043,
      x = -12.62 + i * 0.085
    m.box(
      ['#8c6755', '#8b9378', '#b3a183', '#667571'][i % 4],
      [x, 1.583 + h / 2, 11.53],
      [0.071, h, 0.224],
      'fabric',
    )
    m.box('#d0c2a7', [x, 1.583 + h * 0.72, 11.415], [0.047, 0.018, 0.006], 'plaster')
  }
  m.part('shade', 'ceramic', '#aa7a5f', [-10.91, 1.659, 11.54], [0.4, 0.15, 0.4], [Math.PI, 0, 0])
  plant(m, -9.72, 1.582, 11.53, 0.82)
  for (let i = 0; i < 4; i++) {
    m.part(
      'round',
      'ceramic',
      i % 2 ? '#a3ac95' : '#d1c9b5',
      [-11.66 + i * 0.26, 2.303, 11.51],
      [0.16, 0.19, 0.16],
    )
  }
  // Cup rail over the kitchen counter.
  m.box(oak, [-6.25, 1.98, 2.2], [0.29, 0.045, 2.7], 'oak_int')
  for (let i = 0; i < 5; i++)
    m.part(
      'round',
      'ceramic',
      i % 2 ? '#c4a98b' : '#d9d7c5',
      [-6.3, 2.07, 1.25 + i * 0.26],
      [0.14, 0.13, 0.14],
    )
}

export function residentialFinishes() {
  const m = new ModelBuilder()
  for (const r of bedrooms) finishRoom(m, r, FLOORS.B2.clearHeight)
  for (const room of livingRooms)
    finishRoom(m, footprint(room.bounds), room.clearHeightOverride!, false, room.corridorGlazing)
  for (const r of [publicBath, laundry]) finishRoom(m, r, FLOORS.B2.clearHeight, true)
  rug(m, -0.27, 9.13, 0.8, 1.94, '#9f775f')
  rug(m, -11.51, 9.67, 4.38, 2.58, '#878a76')
  communalShelves(m)
  // A folded hand towel on the dry side, two hooks and a patterned bathmat beside the showers.
  m.beam([-3.76, 1.56, 11.65], [-2.63, 1.56, 11.65], 0.028, 0.028, '#8a7d67')
  for (let i = 0; i < 2; i++) {
    const x = -3.49 + i * 0.51
    m.box('#81725c', [x, 1.56, 11.715], [0.033, 0.055, 0.16], 'steel')
    m.part('cushion', 'fabric', i ? '#b89a82' : '#95a18c', [x, 1.31, 11.626], [0.34, 0.54, 0.049])
    m.box('#d7ccba', [x, 1.11, 11.6], [0.32, 0.024, 0.003], 'fabric')
  }
  rug(m, -3.84, 7.3, 0.69, 1.62, '#9f9c88')
  for (const p of pilotFixtures.pendants) lamp(m, p, 0.61, 0.22, true)
  const [fx, fy, fz] = pilotFixtures.floorLamp
  m.part('round', 'steel', '#7c7260', [fx, 0.052, fz], [0.37, 0.065, 0.37])
  m.beam([fx, 0.075, fz], [fx, fy + 0.02, fz], 0.033, 0.033, '#a78d64')
  lamp(m, pilotFixtures.floorLamp, 0.44, 0.28, false)
  const [bx, by, bz] = pilotFixtures.bedside
  m.part('round', 'ceramic', '#b97a5f', [bx, 0.65, bz], [0.16, 0.28, 0.16])
  m.beam([bx, 0.79, bz], [bx, by, bz], 0.024, 0.024, '#b8986d')
  lamp(m, pilotFixtures.bedside, 0.31, 0.215, false)
  // A recessed reveal around the live sky panel. The sky itself is drawn by PhysicalSky.
  const [sx, sy, sz] = pilotFixtures.skyPanel,
    [w, h] = pilotFixtures.skyPanelSize
  for (const side of [-1, 1]) {
    m.box(oak, [sx + (side * (w + 0.055)) / 2, sy, sz + 0.012], [0.055, h + 0.11, 0.075], 'oak_int')
    m.box(oak, [sx, sy + (side * (h + 0.055)) / 2, sz + 0.012], [w, 0.055, 0.075], 'oak_int')
  }
  return m
}

/** Ceiling and coves belong to a separately switchable layer; none are walk obstacles. */
export function addLivingCoves(m: ModelBuilder, r: PlanRect, height: number) {
  for (const side of [-1, 1]) {
    const z = side < 0 ? r.z0 + 0.29 : r.z1 - 0.29
    m.box('#e4dece', [(r.x0 + r.x1) / 2, height - 0.094, z], [r.x1 - r.x0 - 0.17, 0.19, 0.37], 'plaster')
    m.box(
      '#f2d4a2',
      [(r.x0 + r.x1) / 2, height - 0.13, z - side * 0.187],
      [r.x1 - r.x0 - 0.6, 0.023, 0.009],
      'lamp',
    )
  }
}
