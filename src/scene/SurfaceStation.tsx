import { useShiftClock } from '../store/useShiftClock'
import { RoomInteriors } from './rooms/RoomInteriors'
import { doors, openingsAlong, type WallAxis } from '../geometry/doors'
import { slabPlan } from '../geometry/planGeometry'
import { Color, Group } from 'three'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { roomsOn } from '../data/defaultBlueprint'
import { FLOORS, SLAB } from '../data/floors'
import { useShelterStore } from '../store/useShelterStore'
import type { Point3 } from '../types/shelter'
import { footprint, getFloorElevation, shaftPlans } from '../geometry/coords'
import { lid, outline } from './utils/planGeometry'
import type { SurveyRuntime } from './camera/runtime'
import { groundAt, type TerrainAtlas } from '../geometry/siteElevations'
import { Model, reduceMotion } from './utils/Model'
import { ModelBuilder } from './utils/modelBuilder'
import {
  addSlab,
  closedDoors,
  iBeam,
  partition,
  shaftFrames,
  stairStructure,
  steel,
  warm,
} from './utils/shellGeometry'

const l1 = footprint(FLOORS.L1.bounds),
  l2 = footprint(FLOORS.L2.bounds)
const [lobby, garage, vestibule] = ['l1_lobby', 'l1_garage', 'l1_vestibule'].map((id) =>
  footprint(roomsOn('L1').find((r) => r.id === id)!.bounds),
)
const [hall, garden] = ['l2_observatory', 'l2_greenhouse'].map((id) =>
  footprint(roomsOn('L2').find((r) => r.id === id)!.bounds),
)

// Alpine architectural concrete, weathered larch, dark anodized steel, corten surrounds & deep low-iron glass.
const concrete = '#c9c5b9',
  concreteHi = '#d6d2c5',
  plinth = '#9f9d94',
  mullion = '#31393c',
  steelTrim = '#434d51',
  corten = '#7c4b2d',
  extGlass = '#4d6d78',
  intGlass = '#87b4bc',
  cedar = '#a98a67'

const l1h = FLOORS.L1.clearHeight,
  l1Top = FLOORS.L1.pitch - SLAB,
  l2h = FLOORS.L2.clearHeight,
  l2Top = FLOORS.L2.pitch - SLAB,
  roof = FLOORS.L2.pitch

const outerEntry = doors.find((d) => d.id === 'entry')!
const innerEntry = doors.find((d) => d.id === 'entry-inner')!
const garageDoors = doors.filter(
  (d) => d.floor === 'L1' && d.zones.includes('l1_garage') && d.zones.includes('surface'),
)
const lowerDoorLeaves = () => closedDoors('L1')
const upperDoorLeaves = () => closedDoors('L2')

/** Watertight closed triangular prism along Z for solid gable walls (compatible with stencil section caps). */
function gablePrism(
  m: ModelBuilder,
  xLeft: number,
  xRidge: number,
  xRight: number,
  yBase: number,
  yPeak: number,
  zFront: number,
  zBack: number,
  tint: string,
) {
  const fL: Point3 = [xLeft, yBase, zFront],
    fR: Point3 = [xRight, yBase, zFront],
    fT: Point3 = [xRidge, yPeak, zFront]
  const bL: Point3 = [xLeft, yBase, zBack],
    bR: Point3 = [xRight, yBase, zBack],
    bT: Point3 = [xRidge, yPeak, zBack]
  m.tri(fL, fR, fT, tint)
  m.tri(bR, bL, bT, tint)
  m.quad(bL, bR, fR, fL, tint)
  m.quad(bL, fL, fT, bT, tint)
  m.quad(fR, bR, bT, fT, tint)
}

function groundFloor() {
  const m = new ModelBuilder()
  addSlab(m, 'L1')
  for (const x of [garage.x0 + 0.24, garage.x1 - 0.24, vestibule.x1 - 0.24, lobby.x1 - 0.24]) {
    for (const z of [l1.z0 + 0.24, l1.z1 - 0.24]) {
      m.box(concreteHi, [x, l1Top / 2, z], [0.38, l1Top, 0.38])
      m.box(steel, [x, 0.13, z], [0.48, 0.26, 0.48], 'steel')
    }
  }
  for (const x of [garage.x1, lobby.x0]) {
    partition(m, 'L1', 'z', x, l1.z0, l1.z1, l1Top)
    m.box(steel, [x, l1h - 0.24, l1.z], [0.23, 0.48, l1.d], 'steel')
  }
  partition(m, 'L1', 'x', innerEntry.base[2], vestibule.x0, vestibule.x1, l1Top)
  m.box('#8b9290', [garage.x, 0.095, l1.z1 + 0.85], [garage.w - 0.4, 0.07, 1.67])
  for (let x = garage.x0 + 0.75; x < garage.x1; x += 1.3)
    m.box('#d0b58a', [x, 0.138, l1.z1 + 1.25], [0.1, 0.014, 0.65], 'wood', [0, 0.44, 0])
  const freight = shaftPlans.find((s) => s.id === 'freight')!
  for (const x of [freight.x - 0.91, freight.x + 0.91])
    for (const z of [freight.z - 0.91, freight.z + 0.91])
      m.box('#b6a382', [x, 0.53, z], [0.11, 1.06, 0.11], 'steel')
  shaftFrames(m, 0, FLOORS.L1.pitch, 'L2')
  stairStructure(m, 'L1')
  return m
}

function groundFacade() {
  const m = new ModelBuilder()
  const wt = 0.34

  // North windward wall: full monolithic reinforced concrete sealed flush to L2 slab underside (y = 4.10).
  m.box(concrete, [l1.x, l1Top / 2, l1.z0 + wt / 2], [l1.w, l1Top, wt])
  m.box(plinth, [l1.x, 0.28, l1.z0 + wt / 2 - 0.02], [l1.w + 0.04, 0.56, wt + 0.04])
  for (const x of [-15.78, -10, -4, 2, 8, 13.78])
    m.box(concreteHi, [x, l1Top / 2, l1.z0 + 0.02], [0.42, l1Top, 0.1])

  // West garage wall (x = -16): monolithic bunker plinth with 5 deeply recessed high armored clerestories.
  const wx = l1.x0 + wt / 2
  m.box(concrete, [wx, 2.45 / 2, l1.z], [wt, 2.45, l1.d])
  m.box(plinth, [wx - 0.02, 0.28, l1.z], [wt + 0.04, 0.56, l1.d + 0.04])
  m.box(concrete, [wx, (3.2 + l1Top) / 2, l1.z], [wt, l1Top - 3.2, l1.d])
  m.box(concrete, [wx, 2.825, (l1.z0 + -7.6) / 2], [wt, 0.75, -7.6 - l1.z0])
  m.box(concrete, [wx, 2.825, (5.6 + l1.z1) / 2], [wt, 0.75, l1.z1 - 5.6])
  const slotSpan = 13.2 / 5
  for (let i = 0; i <= 5; i++) m.box(concrete, [wx, 2.825, -7.6 + i * slotSpan], [wt, 0.75, 0.72])
  for (let i = 0; i < 5; i++) {
    const z0 = -7.6 + i * slotSpan
    const zc = z0 + slotSpan / 2
    const openW = slotSpan - 0.72
    // Recessed dark-steel window frame, flashing sill, and deep-set double glazing.
    m.box(extGlass, [l1.x0 + 0.26, 2.825, zc], [0.08, 0.71, openW], 'glass')
    m.box(mullion, [l1.x0 + 0.16, 2.47, zc], [0.36, 0.06, openW + 0.04], 'steel')
    m.box(mullion, [l1.x0 + 0.16, 3.18, zc], [0.34, 0.06, openW + 0.04], 'steel')
    m.box(mullion, [l1.x0 + 0.24, 2.825, zc], [0.12, 0.71, 0.07], 'steel')
    for (const dz of [-openW / 2, openW / 2])
      m.box(mullion, [l1.x0 + 0.18, 2.825, zc + dz], [0.28, 0.75, 0.07], 'steel')
  }

  // South garage facade (x = -16..-2, z = 8): full-height concrete wall + deep armored door portals.
  partition(m, 'L1', 'x', garage.z1, garage.x0, garage.x1, l1Top)
  const gcz = garage.z1 - wt / 2
  m.box(concrete, [(-16 + -14.61) / 2, l1Top / 2, gcz], [1.39, l1Top, wt])
  m.box(concrete, [(-10.39 + -7.61) / 2, l1Top / 2, gcz], [2.78, l1Top, wt])
  m.box(concrete, [(-3.39 + -2) / 2, l1Top / 2, gcz], [1.39, l1Top, wt])
  m.box(concrete, [garage.x, (3.06 + l1Top) / 2, gcz], [garage.w, l1Top - 3.06, wt])
  m.box(plinth, [(-16 + -14.61) / 2, 0.28, gcz + 0.02], [1.41, 0.56, wt + 0.04])
  m.box(plinth, [(-10.39 + -7.61) / 2, 0.28, gcz + 0.02], [2.8, 0.56, wt + 0.04])
  m.box(plinth, [(-3.39 + -2) / 2, 0.28, gcz + 0.02], [1.41, 0.56, wt + 0.04])
  for (const d of garageDoors) {
    const [dx, , dz] = d.base
    // Deep armored lintel hood, steel portal surround & crash bollards clear of the drive opening.
    m.box(corten, [dx, d.height + 0.15, dz + 0.16], [d.width + 0.44, 0.22, 0.46], 'corten')
    m.box(mullion, [dx, d.height + 0.02, dz + 0.04], [d.width + 0.28, 0.12, 0.34], 'steel')
    for (const side of [-1, 1]) {
      m.box(mullion, [dx + side * (d.width / 2 + 0.09), d.height / 2, dz + 0.04], [0.16, d.height, 0.34], 'steel')
      m.part('round', 'steel', '#c49a4e', [dx + side * (d.width / 2 + 0.34), 0.46, dz + 0.42], [0.17, 0.92, 0.17])
      m.part('round', 'steel', mullion, [dx + side * (d.width / 2 + 0.34), 0.06, dz + 0.42], [0.24, 0.12, 0.24])
    }
    m.box('#f0d4a4', [dx, d.height + 0.03, dz + 0.24], [d.width - 0.6, 0.055, 0.09], 'lamp')
  }

  // South armored vestibule portal (x = -2..4, z = 7.92): full concrete massing + corten storm porch.
  partition(m, 'L1', 'x', outerEntry.base[2], vestibule.x0, vestibule.x1, l1Top)
  const vcz = vestibule.z1 - wt / 2
  const entryLeft = outerEntry.base[0] - outerEntry.width / 2
  const entryRight = outerEntry.base[0] + outerEntry.width / 2
  m.box(concrete, [(vestibule.x0 + entryLeft) / 2, l1Top / 2, vcz], [entryLeft - vestibule.x0, l1Top, wt])
  m.box(concrete, [(entryRight + vestibule.x1) / 2, l1Top / 2, vcz], [vestibule.x1 - entryRight, l1Top, wt])
  m.box(concrete, [vestibule.x, (outerEntry.height + l1Top) / 2, vcz], [vestibule.w, l1Top - outerEntry.height, wt])
  m.box(plinth, [(vestibule.x0 + entryLeft) / 2, 0.28, vcz + 0.02], [entryLeft - vestibule.x0 + 0.02, 0.56, wt + 0.04])
  m.box(plinth, [(entryRight + vestibule.x1) / 2, 0.28, vcz + 0.02], [vestibule.x1 - entryRight + 0.02, 0.56, wt + 0.04])
  // Projecting corten armored entry hood and protective side cheeks.
  for (const side of [-1, 1]) {
    const cx = outerEntry.base[0] + side * (outerEntry.width / 2 + 0.16)
    m.box(corten, [cx, 1.49, outerEntry.base[2] + 0.28], [0.28, 2.98, 0.66], 'corten')
  }
  m.box(corten, [outerEntry.base[0], outerEntry.height + 0.22, outerEntry.base[2] + 0.38], [outerEntry.width + 0.64, 0.28, 0.88], 'corten')
  m.box(mullion, [outerEntry.base[0], outerEntry.height + 0.04, outerEntry.base[2] + 0.1], [outerEntry.width + 0.2, 0.1, 0.34], 'steel')
  m.box('#f6dca8', [outerEntry.base[0], outerEntry.height + 0.06, outerEntry.base[2] + 0.44], [outerEntry.width - 0.3, 0.05, 0.1], 'lamp')
  // Entry access panel & intercom bezel beside the armored vestibule portal.
  m.box(mullion, [entryRight + 0.55, 1.48, vestibule.z1 + 0.05], [0.24, 0.44, 0.09], 'steel')
  m.box('#a7d1b0', [entryRight + 0.55, 1.58, vestibule.z1 + 0.1], [0.1, 0.06, 0.02], 'lamp')

  // South public research lobby (x = 4..14, z = 8): solid concrete piers, plinth curb, full upper spandrel & recessed bays.
  const lcz = lobby.z1 - wt / 2
  const lobbyOpen0 = lobby.x0 + 0.95,
    lobbyOpen1 = lobby.x1 - 0.95,
    lobbySpan = lobbyOpen1 - lobbyOpen0
  m.box(concrete, [(lobby.x0 + lobbyOpen0) / 2, l1Top / 2, lcz], [0.95, l1Top, wt])
  m.box(concrete, [(lobbyOpen1 + lobby.x1) / 2, l1Top / 2, lcz], [0.95, l1Top, wt])
  m.box(concrete, [lobby.x, 0.26, lcz], [lobbySpan, 0.52, wt])
  m.box(plinth, [lobby.x, 0.26, lcz + 0.02], [lobby.w + 0.02, 0.52, wt + 0.04])
  m.box(mullion, [lobby.x, 0.54, lcz + 0.01], [lobbySpan + 0.06, 0.06, wt + 0.04], 'steel')
  m.box(concrete, [lobby.x, (3.16 + l1Top) / 2, lcz], [lobbySpan, l1Top - 3.16, wt])
  m.box(cedar, [lobby.x, 3.13, lobby.z1 - 0.14], [lobbySpan, 0.08, 0.32], 'wood')
  const lobbyBays = 4,
    bayStep = lobbySpan / lobbyBays
  for (let i = 0; i < lobbyBays; i++) {
    const bx = lobbyOpen0 + (i + 0.5) * bayStep
    m.box(extGlass, [bx, 1.84, lobby.z1 - 0.24], [bayStep - 0.1, 2.54, 0.09], 'glass')
    if (i > 0) m.box(mullion, [lobbyOpen0 + i * bayStep, 1.84, lobby.z1 - 0.18], [0.11, 2.6, 0.24], 'steel')
  }
  for (const bx of [lobbyOpen0, lobbyOpen1])
    m.box(mullion, [bx, 1.84, lobby.z1 - 0.18], [0.11, 2.6, 0.24], 'steel')
  m.box(mullion, [lobby.x, 2.44, lobby.z1 - 0.2], [lobbySpan, 0.08, 0.18], 'steel')
  // Cantilevered public research entrance canopy with cedar soffit and warm recessed linear lamps.
  m.box(concreteHi, [lobby.x, 3.42, lobby.z1 + 0.62], [lobby.w + 0.24, 0.2, 1.32])
  m.box(mullion, [lobby.x, 3.44, lobby.z1 + 1.29], [lobby.w + 0.3, 0.24, 0.07], 'steel')
  m.box(cedar, [lobby.x, 3.3, lobby.z1 + 0.58], [lobby.w - 0.1, 0.06, 1.2], 'wood')
  for (const dx of [-2.8, 0, 2.8])
    m.box('#f3d6a0', [lobby.x + dx, 3.26, lobby.z1 + 0.66], [2.1, 0.04, 0.09], 'lamp')

  // East public lobby wall (x = 14, z = -10..8): solid concrete corners, lower dado, full spandrel & 3 recessed gallery bays.
  const ex = l1.x1 - wt / 2
  m.box(concrete, [ex, l1Top / 2, (l1.z0 + -7.2) / 2], [wt, l1Top, -7.2 - l1.z0])
  m.box(concrete, [ex, l1Top / 2, (5.2 + l1.z1) / 2], [wt, l1Top, l1.z1 - 5.2])
  m.box(concrete, [ex, 1.18 / 2, -1], [wt, 1.18, 12.4])
  m.box(plinth, [ex + 0.02, 0.28, l1.z], [wt + 0.04, 0.56, l1.d + 0.04])
  m.box(concrete, [ex, (2.96 + l1Top) / 2, -1], [wt, l1Top - 2.96, 12.4])
  const eastBays = 3,
    eastStep = 12.4 / eastBays
  for (let i = 0; i <= eastBays; i++) m.box(concrete, [ex, 2.07, -7.2 + i * eastStep], [wt, 1.78, 0.78])
  for (let i = 0; i < eastBays; i++) {
    const z0 = -7.2 + i * eastStep
    const zc = z0 + eastStep / 2
    const openW = eastStep - 0.78
    m.box(extGlass, [l1.x1 - 0.25, 2.07, zc], [0.09, 1.76, openW], 'glass')
    m.box(mullion, [l1.x1 - 0.16, 1.2, zc], [0.36, 0.06, openW + 0.04], 'steel')
    m.box(mullion, [l1.x1 - 0.16, 2.94, zc], [0.34, 0.06, openW + 0.04], 'steel')
    m.box(mullion, [l1.x1 - 0.22, 2.07, zc], [0.14, 1.74, 0.08], 'steel')
    for (const dz of [-openW / 2, openW / 2])
      m.box(mullion, [l1.x1 - 0.18, 2.07, zc + dz], [0.28, 1.78, 0.08], 'steel')
  }
  return m
}

function garageShutters() {
  const m = new ModelBuilder()
  for (const d of garageDoors) {
    const [x, , z] = d.base
    for (let j = 0; j < 14; j++)
      m.box(
        j === 9 ? '#82999c' : j % 2 ? '#556265' : '#4a5659',
        [x, ((j + 0.5) / 14) * d.height, z + 0.22],
        [d.width - 0.08, d.height / 16, 0.06],
        'steel',
      )
  }
  // Armored stainless push-bar & seam detail on the closed outer vestibule airlock leaves.
  const [ex, , ez] = outerEntry.base
  m.box('#4e4337', [ex, outerEntry.height / 2, ez + 0.22], [0.05, outerEntry.height - 0.08, 0.04], 'steel')
  for (const side of [-1, 1]) {
    m.box('#b7c2be', [ex + side * 0.22, 1.12, ez + 0.24], [0.045, 0.56, 0.05], 'steel')
    m.box('#929c98', [ex + side * 0.55, 1.92, ez + 0.22], [0.46, 0.36, 0.04], 'glass')
    m.box(mullion, [ex + side * 0.55, 1.92, ez + 0.225], [0.52, 0.42, 0.02], 'steel')
  }
  return m
}

function lowerSoffit() {
  const m = new ModelBuilder()
  // Clean interior drop ceiling at y = 3.60..3.68 so exterior windows never glimpse empty plenum framing.
  for (const [x0, x1, z0, z1] of [
    [l1.x0 + 0.34, -8, l1.z0 + 0.34, l1.z1 - 0.34],
    [-8, 4, l1.z0 + 0.34, -6],
    [-8, 4, -2, l1.z1 - 0.34],
    [4, l1.x1 - 0.34, l1.z0 + 0.34, l1.z1 - 0.34],
  ])
    m.box('#d8d4c7', [(x0 + x1) / 2, l1h + 0.04, (z0 + z1) / 2], [x1 - x0, 0.08, z1 - z0])
  return m
}

function lowerCeiling() {
  const m = new ModelBuilder()
  const y = l1Top
  const top = y + SLAB
  // Slab inside the L2 outline belongs to L2. These are the exposed setback terraces.
  for (const [x0, x1, z0, z1] of [
    [l1.x0, l2.x0, l1.z0, l1.z1],
    [l2.x1, l1.x1, l1.z0, l1.z1],
    [l2.x0, l2.x1, l2.z1, l1.z1],
  ])
    m.box(concrete, [(x0 + x1) / 2, y + SLAB / 2, (z0 + z1) / 2], [x1 - x0, SLAB, z1 - z0])

  // Continuous dark-steel perimeter drip fascia wrapping all 4 edges of the L1/L2 junction (zero gaps).
  m.box(mullion, [l1.x, y + 0.14, l1.z1 + 0.05], [l1.w + 0.24, 0.42, 0.14], 'steel')
  m.box(mullion, [l1.x, y + 0.14, l1.z0 - 0.05], [l1.w + 0.24, 0.42, 0.14], 'steel')
  m.box(mullion, [l1.x0 - 0.05, y + 0.14, l1.z], [0.14, 0.42, l1.d + 0.18], 'steel')
  m.box(mullion, [l1.x1 + 0.05, y + 0.14, l1.z], [0.14, 0.42, l1.d + 0.18], 'steel')

  // Monolithic concrete parapet walls (0.58 m tall) with corten/dark metal coping on West and East terraces.
  const ph = 0.58,
    pt = 0.28,
    py = top + ph / 2,
    capY = top + ph + 0.03
  // West terrace parapet (x = -16, returns along north & south to L2 wall at x = -12).
  m.box(concreteHi, [l1.x0 + pt / 2, py, l1.z], [pt, ph, l1.d])
  m.box(concreteHi, [(l1.x0 + l2.x0) / 2, py, l1.z0 + pt / 2], [l2.x0 - l1.x0, ph, pt])
  m.box(concreteHi, [(l1.x0 + l2.x0) / 2, py, l1.z1 - pt / 2], [l2.x0 - l1.x0, ph, pt])
  m.box(mullion, [l1.x0 + pt / 2, capY, l1.z], [pt + 0.08, 0.06, l1.d + 0.08], 'steel')
  m.box(mullion, [(l1.x0 + l2.x0) / 2, capY, l1.z0 + pt / 2], [l2.x0 - l1.x0 + 0.06, 0.06, pt + 0.08], 'steel')
  m.box(mullion, [(l1.x0 + l2.x0) / 2, capY, l1.z1 - pt / 2], [l2.x0 - l1.x0 + 0.06, 0.06, pt + 0.08], 'steel')
  // East terrace parapet (x = 14, returns along north & south to L2 wall at x = 12).
  m.box(concreteHi, [l1.x1 - pt / 2, py, l1.z], [pt, ph, l1.d])
  m.box(concreteHi, [(l2.x1 + l1.x1) / 2, py, l1.z0 + pt / 2], [l1.x1 - l2.x1, ph, pt])
  m.box(concreteHi, [(l2.x1 + l1.x1) / 2, py, l1.z1 - pt / 2], [l1.x1 - l2.x1, ph, pt])
  m.box(mullion, [l1.x1 - pt / 2, capY, l1.z], [pt + 0.08, 0.06, l1.d + 0.08], 'steel')
  m.box(mullion, [(l2.x1 + l1.x1) / 2, capY, l1.z0 + pt / 2], [l1.x1 - l2.x1 + 0.06, 0.06, pt + 0.08], 'steel')
  m.box(mullion, [(l2.x1 + l1.x1) / 2, capY, l1.z1 - pt / 2], [l1.x1 - l2.x1 + 0.06, 0.06, pt + 0.08], 'steel')

  // South cedar terrace decking & solid-curbed balustrade joining cleanly into the west/east parapets.
  for (const z of [l2.z1 + 0.08, l1.z1 - 0.14]) m.box(cedar, [l2.x, top + 0.025, z], [l2.w, 0.05, 0.16], 'wood')
  for (let x = l2.x0 + 0.15; x < l2.x1; x += 0.34)
    m.box(cedar, [x, top + 0.018, (l2.z1 + l1.z1) / 2], [0.3, 0.04, l1.z1 - l2.z1 - 0.16], 'wood')
  m.box(concreteHi, [l2.x, top + 0.12, l1.z1 - 0.14], [l2.w, 0.24, 0.26])
  for (let x = l2.x0; x <= l2.x1; x += 2)
    m.box(mullion, [x, top + 0.62, l1.z1 - 0.14], [0.065, 0.84, 0.075], 'steel')
  m.box(mullion, [l2.x, top + 1.04, l1.z1 - 0.14], [l2.w + 0.1, 0.075, 0.09], 'steel')
  m.box(extGlass, [l2.x, top + 0.62, l1.z1 - 0.14], [l2.w - 0.1, 0.72, 0.04], 'glass')
  return m
}

// The greenhouse has glazed separation on its interior dry observation boundary.
function glassPartition(m: ModelBuilder, axis: WallAxis, fixed: number, from: number, to: number) {
  const addPane = (a: number, b: number, bottom: number) => {
    if (b <= a) return
    const axisCentre = (a + b) / 2,
      h = l2h - bottom,
      y = bottom + h / 2
    m.box(
      intGlass,
      axis === 'x' ? [axisCentre, y, fixed] : [fixed, y, axisCentre],
      axis === 'x' ? [b - a, h, 0.09] : [0.09, h, b - a],
      'glass',
    )
  }
  let start = from
  for (const d of openingsAlong('L2', axis, fixed, from, to)) {
    const centre = d.base[axis === 'x' ? 0 : 2]
    addPane(start, centre - d.width / 2, 0)
    addPane(centre - d.width / 2, centre + d.width / 2, d.height)
    start = centre + d.width / 2
  }
  addPane(start, to, 0)
}

function observationFloor() {
  const m = new ModelBuilder()
  addSlab(m, 'L2')
  const hallPlan = slabPlan(roomsOn('L2')[0].bounds, FLOORS.L2.elevation)
  lid(m, hallPlan, 0.012, '#bca688')
  outline(m, hallPlan, 0.015, '#8e8372')
  for (const x of [l2.x0 + 0.22, garden.x0, l2.x1 - 0.22])
    for (const z of [l2.z0 + 0.22, l2.z1 - 0.22]) {
      m.box(mullion, [x, l2Top / 2, z], [0.24, l2Top, 0.24], 'steel')
      m.box(concrete, [x, 0.1, z], [0.36, 0.2, 0.36])
    }
  // Thermal shear partition between Observatory and Greenhouse (preserves greenhouse-observation door at z = -7.45).
  partition(m, 'L2', 'z', garden.x0, l2.z0, -4.4, l2Top)
  m.box(concrete, [garden.x0, 1.05 / 2, (-4.4 + 3.8) / 2], [0.22, 1.05, 8.2])
  m.box(concrete, [garden.x0, (2.85 + l2Top) / 2, (-4.4 + 3.8) / 2], [0.22, l2Top - 2.85, 8.2])
  m.box(intGlass, [garden.x0, 1.95, -0.3], [0.08, 1.76, 8.1], 'glass')
  for (const z of [-4.4, -1.65, 1.05, 3.8]) m.box(mullion, [garden.x0, 1.95, z], [0.24, 1.82, 0.09], 'steel')
  m.box(concrete, [garden.x0, l2Top / 2, (3.8 + l2.z1) / 2], [0.22, l2Top, l2.z1 - 3.8])
  // Dry-observation glass divider inside greenhouse (preserves greenhouse-growing door at x = 7, z = -2).
  const beds = footprint(roomsOn('L2').find((r) => r.wetBounds)!.wetBounds!)
  glassPartition(m, 'x', beds.z0, garden.x0, garden.x1)
  return m
}

function upperFacade() {
  const m = new ModelBuilder()
  const wt = 0.34

  // --- L2 NORTH WINDWARD WALL (z = -10, x = -12..12): solid insulated concrete + weathered-larch rainscreen ---
  const nz = l2.z0 + wt / 2
  // Observatory north wall (x = -12..2, full height y = 0..4.10) with 3 recessed high-altitude instrument ports.
  m.box(concrete, [hall.x, 1.6 / 2, nz], [hall.w, 1.6, wt])
  m.box(concrete, [hall.x, (2.75 + l2Top) / 2, nz], [hall.w, l2Top - 2.75, wt])
  const northWins = [-9.2, -6.5, -3.8]
  const nwW = 1.68
  let cursorX = hall.x0
  for (const wx of northWins) {
    const a = wx - nwW / 2,
      b = wx + nwW / 2
    if (a > cursorX) m.box(concrete, [(cursorX + a) / 2, 2.175, nz], [a - cursorX, 1.15, wt])
    m.box(extGlass, [wx, 2.175, l2.z0 + 0.26], [nwW - 0.06, 1.07, 0.08], 'glass')
    m.box(corten, [wx, 1.62, l2.z0 + 0.14], [nwW + 0.08, 0.07, 0.36], 'corten')
    m.box(corten, [wx, 2.73, l2.z0 + 0.14], [nwW + 0.08, 0.07, 0.36], 'corten')
    for (const side of [-1, 1])
      m.box(mullion, [wx + (side * nwW) / 2, 2.175, l2.z0 + 0.18], [0.08, 1.15, 0.28], 'steel')
    cursorX = b
  }
  if (cursorX < hall.x1) m.box(concrete, [(cursorX + hall.x1) / 2, 2.175, nz], [hall.x1 - cursorX, 1.15, wt])
  // Greenhouse north wall (x = 2..12, y = 0..3.64): solid thermal shield facing the cold cliff.
  m.box(concrete, [garden.x, 3.64 / 2, nz], [garden.w, 3.64, wt])
  // Vertical weathered-larch rainscreen battens across the upper solid north facade.
  for (let x = l2.x0 + 0.35; x < l2.x1 - 0.25; x += 0.42) {
    const inWin = northWins.some((wx) => Math.abs(x - wx) < nwW / 2 + 0.12)
    if (inWin) {
      m.box(warm, [x, 0.85, l2.z0 - 0.03], [0.16, 1.46, 0.06], 'wood')
      m.box(warm, [x, 3.4, l2.z0 - 0.03], [0.16, 1.24, 0.06], 'wood')
    } else {
      const topH = x < hall.x1 ? 3.96 : 3.52
      m.box(warm, [x, topH / 2 + 0.06, l2.z0 - 0.03], [0.16, topH - 0.12, 0.06], 'wood')
    }
  }

  // --- L2 OBSERVATORY WEST WINDWARD WALL (x = -12, z = -10..6) ---
  const wx = l2.x0 + wt / 2
  // Solid insulated corner shear piers: NW (-10..-5.6) and SW (3.4..6.0), full height to y = 4.10.
  m.box(concrete, [wx, l2Top / 2, (-10 + -5.6) / 2], [wt, l2Top, 4.4])
  m.box(concrete, [wx, l2Top / 2, (3.4 + 6) / 2], [wt, l2Top, 2.6])
  // Vertical weathered-larch timber rainscreen accent on the NW & SW windward piers.
  for (let z = -9.6; z <= -5.85; z += 0.36) m.box(warm, [l2.x0 - 0.03, 2.05, z], [0.06, 3.85, 0.16], 'wood')
  for (let z = 3.65; z <= 5.75; z += 0.36) m.box(warm, [l2.x0 - 0.03, 2.05, z], [0.06, 3.85, 0.16], 'wood')
  // Recessed west panoramic bay (z = -5.6..3.4, span 9.0 m): solid dado (0..1.05) + full upper spandrel (3.10..4.10).
  m.box(concrete, [wx, 1.05 / 2, -1.1], [wt, 1.05, 9.0])
  m.box(concrete, [wx, (3.1 + l2Top) / 2, -1.1], [wt, l2Top - 3.1, 9.0])
  m.box(mullion, [l2.x0 + 0.14, 1.07, -1.1], [0.36, 0.06, 9.08], 'steel')
  m.box(mullion, [l2.x0 + 0.14, 3.09, -1.1], [0.36, 0.07, 9.08], 'steel')
  const westBays = 4,
    westStep = 9.0 / westBays
  for (let i = 0; i < westBays; i++) {
    const zc = -5.6 + (i + 0.5) * westStep
    m.box(extGlass, [l2.x0 + 0.25, 2.08, zc], [0.085, 1.98, westStep - 0.09], 'glass')
    m.box(mullion, [l2.x0 + 0.2, 2.08, -5.6 + i * westStep], [0.22, 2.06, 0.1], 'steel')
  }
  m.box(mullion, [l2.x0 + 0.2, 2.08, 3.4], [0.22, 2.06, 0.1], 'steel')
  m.box(mullion, [l2.x0 + 0.22, 2.45, -1.1], [0.16, 0.075, 9.0], 'steel')

  // --- L2 OBSERVATORY SOUTH VALLEY-PANORAMA WALL (z = 6, x = -12..2) ---
  const sz = l2.z1 - wt / 2
  const sWin0 = -10.5,
    sWin1 = 0.8,
    sWinSpan = sWin1 - sWin0,
    sWinMid = (sWin0 + sWin1) / 2
  // Solid concrete corner shear piers at SW (-12..-10.5) and observatory/greenhouse junction (0.8..2.0).
  m.box(concrete, [(hall.x0 + sWin0) / 2, l2Top / 2, sz], [sWin0 - hall.x0, l2Top, wt])
  m.box(concrete, [(sWin1 + hall.x1) / 2, l2Top / 2, sz], [hall.x1 - sWin1, l2Top, wt])
  // Solid lower dado (0..0.95) + solid upper header spandrel (3.15..4.10) sealing flush into the roof fascia.
  m.box(concrete, [sWinMid, 0.95 / 2, sz], [sWinSpan, 0.95, wt])
  m.box(concrete, [sWinMid, (3.15 + l2Top) / 2, sz], [sWinSpan, l2Top - 3.15, wt])
  m.box(corten, [sWinMid, 0.97, l2.z1 - 0.14], [sWinSpan + 0.1, 0.065, 0.38], 'corten')
  m.box(corten, [sWinMid, 3.14, l2.z1 - 0.14], [sWinSpan + 0.1, 0.075, 0.38], 'corten')
  // Deeply recessed vertical panoramic glazing (6 crisp bays, zero corner wedge gaps).
  const southBays = 6,
    southStep = sWinSpan / southBays
  for (let i = 0; i < southBays; i++) {
    const xc = sWin0 + (i + 0.5) * southStep
    m.box(extGlass, [xc, 2.05, l2.z1 - 0.26], [southStep - 0.09, 2.14, 0.085], 'glass')
    m.box(mullion, [sWin0 + i * southStep, 2.05, l2.z1 - 0.2], [0.1, 2.2, 0.22], 'steel')
  }
  m.box(mullion, [sWin1, 2.05, l2.z1 - 0.2], [0.1, 2.2, 0.22], 'steel')
  m.box(mullion, [sWinMid, 2.48, l2.z1 - 0.22], [sWinSpan, 0.075, 0.16], 'steel')
  // Warm subtle interior ceiling cove strip inside observatory so dusk/dawn windows read warm & inhabited.
  m.box('#f2cf97', [sWinMid, 3.52, l2.z1 - 1.2], [sWinSpan - 1.4, 0.045, 0.12], 'lamp')

  // --- L2 ALPINE GREENHOUSE SOUTH (z = 6, x = 2..12) & EAST (x = 12, z = -10..6) WALLS ---
  const gwt = 0.32
  // Solid insulated concrete knee wall (0..1.05) + solid SE & NE structural anchor piers.
  m.box(concrete, [garden.x, 1.05 / 2, l2.z1 - gwt / 2], [garden.w, 1.05, gwt])
  m.box(concrete, [l2.x1 - gwt / 2, 1.05 / 2, garden.z], [gwt, 1.05, garden.d])
  m.box(concrete, [(10.8 + garden.x1) / 2, 3.66 / 2, l2.z1 - gwt / 2], [1.2, 3.66, gwt])
  m.box(concrete, [l2.x1 - gwt / 2, 3.66 / 2, (4.8 + l2.z1) / 2], [gwt, 3.66, 1.2])
  m.box(concrete, [l2.x1 - gwt / 2, 3.66 / 2, (l2.z0 + -8.4) / 2], [gwt, 3.66, 1.6])
  // Steel sills & heavy eave header box beams sealing cleanly to the twin pitched rafters.
  m.box(mullion, [(2 + 10.8) / 2, 1.07, l2.z1 - 0.14], [8.84, 0.065, 0.36], 'steel')
  m.box(mullion, [l2.x1 - 0.14, 1.07, (-8.4 + 4.8) / 2], [0.36, 0.065, 13.24], 'steel')
  m.box(mullion, [garden.x, 3.56, l2.z1 - 0.12], [garden.w, 0.22, 0.24], 'steel')
  m.box(mullion, [l2.x1 - 0.12, 3.56, garden.z], [0.24, 0.22, garden.d], 'steel')
  // Greenhouse South glazed bays (x = 2..10.8, y = 1.08..3.46).
  const gsBays = 4,
    gsStep = 8.8 / gsBays
  for (let i = 0; i < gsBays; i++) {
    const xc = 2 + (i + 0.5) * gsStep
    m.box(extGlass, [xc, 2.27, l2.z1 - 0.14], [gsStep - 0.1, 2.38, 0.08], 'glass')
    m.box(mullion, [2 + i * gsStep, 2.27, l2.z1 - 0.12], [0.11, 2.42, 0.2], 'steel')
  }
  m.box(mullion, [10.8, 2.27, l2.z1 - 0.12], [0.11, 2.42, 0.2], 'steel')
  m.box(mullion, [6.4, 2.35, l2.z1 - 0.13], [8.8, 0.075, 0.16], 'steel')
  // Greenhouse East glazed bays (z = -8.4..4.8, y = 1.08..3.46).
  const geBays = 6,
    geStep = 13.2 / geBays
  for (let i = 0; i < geBays; i++) {
    const zc = -8.4 + (i + 0.5) * geStep
    m.box(extGlass, [l2.x1 - 0.14, 2.27, zc], [0.08, 2.38, geStep - 0.1], 'glass')
    m.box(mullion, [l2.x1 - 0.12, 2.27, -8.4 + i * geStep], [0.2, 2.42, 0.11], 'steel')
  }
  m.box(mullion, [l2.x1 - 0.12, 2.27, 4.8], [0.2, 2.42, 0.11], 'steel')
  m.box(mullion, [l2.x1 - 0.13, 2.35, -1.8], [0.16, 0.075, 13.2], 'steel')
  return m
}

function upperSoffit() {
  const m = new ModelBuilder()
  // Clean acoustic timber-toned ceiling inside L2 observatory (excluding stair/electrical shafts at gx=7..9, gz=3..4 -> x=-2..4, z=-6..-2).
  for (const [x0, x1, z0, z1] of [
    [hall.x0 + 0.34, -2, hall.z0 + 0.34, hall.z1 - 0.34],
    [-2, hall.x1 - 0.22, hall.z0 + 0.34, -6],
    [-2, hall.x1 - 0.22, -2, hall.z1 - 0.34],
  ])
    m.box('#d8d2c3', [(x0 + x1) / 2, l2h + 0.04, (z0 + z1) / 2], [x1 - x0, 0.08, z1 - z0])
  return m
}

function servicesFrame(id: 'L1' | 'L2') {
  const m = new ModelBuilder(),
    f = FLOORS[id],
    r = footprint(f.bounds)
  const low = f.clearHeight,
    high = f.pitch - SLAB
  for (const z of [r.z0 + 0.27, r.z1 - 0.27]) {
    iBeam(m, r.x, high - 0.1, z, r.w - 0.32, true, 0.18)
    for (let x = r.x0 + 0.28; x < r.x1; x += 2.5)
      m.box('#899496', [x, (low + high) / 2, z], [0.07, high - low, 0.1], 'steel')
  }
  const end = id === 'L2' ? hall.x1 : r.x1
  for (let x = r.x0 + 1.8; x < end; x += 3.5) iBeam(m, x, high - 0.12, r.z, r.d - 0.54, false, 0.18)
  return m
}
const lowerServices = () => servicesFrame('L1')
const upperServices = () => servicesFrame('L2')

function radome(m: ModelBuilder, x: number, y: number, z: number) {
  const r = 2.12,
    n = 16,
    rings = 5
  m.part('round', 'steel', mullion, [x, y + 0.18, z], [r * 2 + 0.25, 0.36, r * 2 + 0.25])
  m.part('round', 'stone', concreteHi, [x, y + 0.49, z], [r * 1.97, 0.32, r * 1.97])
  const point = (j: number, i: number): Point3 => {
    const phi = ((j / rings) * Math.PI) / 2,
      a = ((i + (j % 2) * 0.5) * Math.PI * 2) / n
    return [
      x + r * Math.cos(phi) * Math.cos(a),
      y + 0.65 + r * Math.sin(phi),
      z + r * Math.cos(phi) * Math.sin(a),
    ]
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < n; i++) {
      const a = point(j, i),
        b = point(j, i + 1),
        c = point(j + 1, i),
        d = point(j + 1, i + 1)
      const shade = new Color(i % 3 === 0 ? '#dcded3' : '#eaebdf')
      if (j % 2 === 0) {
        m.tri(a, c, b, shade)
        if (j < rings - 1) m.tri(b, c, d, '#e0e3d9')
        m.line(c, b, '#a8b0a9')
      } else {
        m.tri(a, d, b, shade)
        if (j < rings - 1) m.tri(a, c, d, '#e0e3d9')
        m.line(a, d, '#a8b0a9')
      }
      m.line(a, b, '#aeb5af')
      m.line(a, c, '#acb4ac')
    }
}

function roofscape() {
  const m = new ModelBuilder()
  // Observatory monolithic roof deck sealed solidly onto y = 4.10 walls (deck spans y = 3.96..4.40, zero floating gap!).
  m.box(mullion, [hall.x, roof - 0.34, hall.z], [hall.w + 0.46, 0.28, hall.d + 0.46], 'steel')
  m.box(concreteHi, [hall.x, roof - 0.12, hall.z], [hall.w + 0.52, 0.24, hall.d + 0.52])
  m.box('#8f9690', [hall.x, roof + 0.03, hall.z], [hall.w - 0.3, 0.06, hall.d - 0.3])

  // Solid architectural roof parapet (0.46 m tall) + dark metal coping around all 4 edges of observatory roof.
  const rph = 0.46,
    rpt = 0.3,
    rpy = roof + rph / 2,
    rcap = roof + rph + 0.03
  m.box(concreteHi, [hall.x, rpy, hall.z0 + rpt / 2], [hall.w + 0.24, rph, rpt])
  m.box(concreteHi, [hall.x, rpy, hall.z1 - rpt / 2], [hall.w + 0.24, rph, rpt])
  m.box(concreteHi, [hall.x0 + rpt / 2, rpy, hall.z], [rpt, rph, hall.d + 0.24])
  m.box(concreteHi, [hall.x1 - rpt / 2, rpy, hall.z], [rpt, rph, hall.d + 0.24])
  m.box(mullion, [hall.x, rcap, hall.z0 + rpt / 2], [hall.w + 0.34, 0.06, rpt + 0.08], 'steel')
  m.box(mullion, [hall.x, rcap, hall.z1 - rpt / 2], [hall.w + 0.34, 0.06, rpt + 0.08], 'steel')
  m.box(mullion, [hall.x0 + rpt / 2, rcap, hall.z], [rpt + 0.08, 0.06, hall.d + 0.34], 'steel')
  m.box(mullion, [hall.x1 - rpt / 2, rcap, hall.z], [rpt + 0.08, 0.06, hall.d + 0.34], 'steel')

  // Twin-ridge greenhouse roof with continuous box gutters, rafters & sealed North/South gable framing.
  const span = garden.w / 2,
    rise = roof - l2h
  // Heavy box-gutter eaves at west junction (x = 2), central valley (x = 7) & east eave (x = 12).
  for (const gx of [garden.x0, garden.x0 + span, garden.x1])
    m.box(mullion, [gx, l2h + 0.04, garden.z], [0.22, 0.22, garden.d + 0.12], 'steel')

  for (let bay = 0; bay < 2; bay++) {
    const xLeft = garden.x0 + bay * span
    const ridge = xLeft + span / 2
    const xRight = xLeft + span
    // Solid insulated north gable wall (watertight triangular prism closing z = -10..-9.68).
    gablePrism(m, xLeft + 0.08, ridge, xRight - 0.08, l2h, roof, garden.z0 + 0.32, garden.z0, concrete)
    for (const side of [-1, 1]) {
      const edge = ridge + (side * span) / 2,
        centre = (ridge + edge) / 2
      const length = Math.hypot(span / 2, rise),
        tilt = -side * Math.atan2(rise, span / 2)
      m.box(extGlass, [centre, l2h + rise / 2, garden.z], [length, 0.1, garden.d], 'glass', [0, 0, tilt])
      for (let z = garden.z0; z <= garden.z1; z += 1.6)
        m.beam([edge, l2h, z], [ridge, roof, z], 0.1, 0.13, steelTrim)
      // Heavy gable verge rafters at north and south ends.
      for (const gz of [garden.z0 + 0.08, garden.z1 - 0.08])
        m.beam([edge, l2h, gz], [ridge, roof, gz], 0.13, 0.16, mullion)
      m.box(mullion, [ridge, roof, garden.z], [0.14, 0.15, garden.d + 0.08], 'steel')
      m.box(steelTrim, [centre, l2h + rise / 2, garden.z], [0.08, 0.07, garden.d], 'steel')
    }
    // South gable structural king-post & intermediate vertical mullions (framing the glazed south gable).
    m.box(mullion, [ridge, l2h + rise / 2, garden.z1 - 0.12], [0.1, rise, 0.14], 'steel')
    for (const dx of [-span / 4, span / 4])
      m.box(mullion, [ridge + dx, l2h + rise / 4, garden.z1 - 0.12], [0.08, rise / 2, 0.12], 'steel')
  }

  // The optics sit on the east greenhouse ridge, directly over SOL-212's interior coupling.
  m.equipment('SOL-212', [9.5, roof, 4], () => {
    m.part('round', 'steel', '#a1afa8', [0, -0.4, 0], [0.16, 0.82, 0.16])
    m.box(mullion, [0, 0.09, 0], [0.86, 0.17, 1.14], 'steel')
    m.part('round', 'steel', '#91a49e', [0, 0.29, 0], [0.47, 0.32, 0.47])
    m.box(cedar, [0, 0.55, 0], [1.64, 0.13, 1.08], 'steel', [-0.22, 0, 0])
    for (let col = 0; col < 5; col++)
      for (let row = 0; row < 3; row++) {
        const x = (col - 2) * 0.3,
          z = (row - 1) * 0.31
        const y = 0.64 + z * 0.22
        m.part('round', 'steel', '#819b9a', [x, y, z], [0.28, 0.058, 0.28], [-0.22, 0, 0])
        m.part('round', 'glass', '#bdd5ca', [x, y + 0.042, z], [0.243, 0.039, 0.243], [-0.22, 0, 0])
      }
  })
  const pz = l2.z0 + 1.05
  m.box(mullion, [hall.x + 0.6, roof + 0.35, pz], [15.6, 0.3, 0.34], 'steel')
  for (const x of [hall.x0 + 0.7, hall.x1 - 0.7])
    m.part('round', 'steel', '#8a928f', [x, roof + 1.32, hall.z1 - 1], [0.1, 2.64, 0.1])
  return m
}

function greenhouseGableGlass() {
  const m = new ModelBuilder('glass')
  const span = garden.w / 2
  const z = garden.z1 - 0.14
  for (let bay = 0; bay < 2; bay++) {
    const xL = garden.x0 + bay * span + 0.08
    const xR = xL + span - 0.16
    const xT = (xL + xR) / 2
    const a: Point3 = [xL, l2h + 0.04, z],
      b: Point3 = [xR, l2h + 0.04, z],
      c: Point3 = [xT, roof - 0.04, z]
    // Double-sided gable glass so the south greenhouse gables read watertight from inside and outside.
    m.tri(a, b, c, extGlass)
    m.tri(b, a, c, extGlass)
  }
  return m
}

function dome() {
  const m = new ModelBuilder()
  radome(m, 0, 0, 0)
  return m
}
function turbine() {
  const m = new ModelBuilder(),
    x = 0,
    z = 0
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3,
      dx = Math.cos(a) * 0.41,
      dz = Math.sin(a) * 0.41
    m.beam([x, roof + 1.65, z], [x + dx, roof + 2.1, z + dz], 0.09, 0.1, concreteHi)
    m.beam([x + dx, roof + 2.1, z + dz], [x + dx, roof + 2.83, z + dz], 0.12, 0.09, concreteHi)
    m.beam([x + dx, roof + 2.83, z + dz], [x, roof + 3.17, z], 0.09, 0.1, concreteHi)
  }
  return m
}

function stormShutters() {
  const m = new ModelBuilder()
  const entryZ = l1.z1 + 0.36
  for (const dx of [-1.22, 1.22])
    m.box('#ffbf70', [vestibule.x + dx, 1.32 - FLOORS.L2.elevation, entryZ], [0.075, 2.6, 0.09], 'lamp')
  m.box('#ffce83', [vestibule.x, 2.65 - FLOORS.L2.elevation, entryZ], [2.48, 0.085, 0.09], 'lamp')
  // Accumulated roof snow inside the observatory parapet and on the L1 setback terraces.
  m.box('#dae3e6', [hall.x, roof + 0.11, hall.z], [hall.w - 0.45, 0.11, hall.d - 0.45], 'snow')
  m.box('#dae3e6', [(l1.x0 + l2.x0) / 2, 0.06, l1.z], [l2.x0 - l1.x0 - 0.4, 0.1, l1.d - 0.5], 'snow')
  m.box('#dae3e6', [(l2.x1 + l1.x1) / 2, 0.06, l1.z], [l1.x1 - l2.x1 - 0.4, 0.1, l1.d - 0.5], 'snow')
  return m
}

function facadeOutline(r: typeof l1, h: number) {
  const m = new ModelBuilder()
  for (const y of [0, h]) {
    for (const x of [r.x0, r.x1]) m.line([x, y, r.z0], [x, y, r.z1], '#b5cdd5')
    for (const z of [r.z0, r.z1]) m.line([r.x0, y, z], [r.x1, y, z], '#b5cdd5')
  }
  for (const x of [r.x0, r.x1]) for (const z of [r.z0, r.z1]) m.line([x, 0, z], [x, h, z], '#b5cdd5')
  return m
}
const lowerOutline = () => facadeOutline(l1, l1Top)
const upperOutline = () => facadeOutline(l2, l2Top)

// A 2.1 m apron falls away at 2%. Its outer wall follows the surveyed slope at metre intervals.
function stationApron(atlas: TerrainAtlas) {
  const m = new ModelBuilder('stone'),
    w = 2.1
  const corners = [
    [l1.x0, l1.z0],
    [l1.x0, l1.z1],
    [l1.x1, l1.z1],
    [l1.x1, l1.z0],
  ]
  const outer = corners.map(([x, z]) => [x + Math.sign(x - l1.x) * w, z + Math.sign(z - l1.z) * w])
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4,
      a = corners[i],
      b = corners[j],
      c = outer[i],
      d = outer[j]
    const n = Math.ceil(Math.hypot(d[0] - c[0], d[1] - c[1]))
    const point = (u: number, outerEdge: boolean): Point3 => {
      const [p, q] = outerEdge ? [c, d] : [a, b]
      return [p[0] + (q[0] - p[0]) * u, outerEdge ? 0.012 : 0.054, p[1] + (q[1] - p[1]) * u]
    }
    for (let k = 0; k < n; k++) {
      const l = point(k / n, true),
        r = point((k + 1) / n, true)
      m.quad(point(k / n, false), l, r, point((k + 1) / n, false), '#b0aea1')
      const toe = (p: Point3): Point3 => [
        p[0],
        Math.min(p[1] - 0.16, groundAt(atlas, p[0], p[2]).height - 0.15),
        p[2],
      ]
      m.quad(l, toe(l), toe(r), r, k % 5 === 0 ? '#949389' : '#8c8980')
    }
  }
  return m
}

export function surfaceEnvelopeModels() {
  return {
    l1: [groundFloor(), groundFacade(), lowerCeiling()],
    l2: [observationFloor(), upperFacade(), roofscape(), greenhouseGableGlass()],
  }
}

export function SurfaceStation({ atlas, rt }: { atlas: TerrainAtlas; rt: SurveyRuntime }) {
  const floor = useShelterStore((s) => s.floor),
    mode = useShelterStore((s) => s.mode),
    plenum = useShelterStore((s) => s.plenum)
  const walk = useShelterStore((s) => s.cameraState === 'walkthrough'),
    cold = useShelterStore((s) => s.cold)
  const apron = useMemo(() => () => stationApron(atlas), [atlas])
  const panels = useRef<Group>(null),
    gardenLeaves = useRef<Group>(null),
    building = useRef<Group>(null),
    upperFloor = useRef<Group>(null),
    roofShell = useRef<Group>(null),
    setback = useRef<Group>(null),
    radar = useRef<Group>(null),
    a = useRef<Group>(null),
    b = useRef<Group>(null)
  useFrame(({ camera }, dt) => {
    if (useShiftClock.getState().motion && !reduceMotion() && upper && !wire && (floor === 'ALL' || walk)) {
      const step = Math.min(dt, 0.08)
      if (radar.current) radar.current.rotation.y += step * 0.075
      if (!cold && a.current) a.current.rotation.y += step * 0.47
      if (!cold && b.current) b.current.rotation.y += step * 0.39
    }
    if (panels.current) panels.current.visible = !rt.garageTransfer && !walk && lower && !wire
    if (gardenLeaves.current) gardenLeaves.current.visible = !rt.garageTransfer && !walk && upper && !wire
    if (building.current)
      building.current.visible =
        (!walk || camera.position.y > -10.3) && (!rt.dropping || floor === 'L1' || floor === 'L2')
    if (upperFloor.current) upperFloor.current.visible = !(rt.dropping && floor === 'L1')
    if (roofShell.current) roofShell.current.visible = !rt.dropping
    if (setback.current) setback.current.visible = !(rt.dropping && floor === 'L1')
  })
  const lower = walk || floor === 'ALL' || floor === 'L1' || floor === 'L2'
  const upper = walk || floor === 'ALL' || floor === 'L2'
  const wire = mode === 'xray'
  return (
    <group ref={building} name="科研观测站">
      <group position-y={getFloorElevation('L1')}>
        <group visible={lower && !wire}>
          <Model build={apron} />
        </group>
        <group visible={lower && !wire}>
          <RoomInteriors id="L1" rt={rt} />
        </group>
        <Model walkSurface="wall" build={groundFloor} opacity={lower ? (wire ? 0.1 : 1) : 0} />
        <Model build={lowerServices} opacity={Number(lower && !wire && (plenum || floor === 'L2'))} />
        <Model
          walkSurface="ceiling"
          build={lowerSoffit}
          opacity={Number(lower && !wire && !plenum && (floor === 'ALL' || walk))}
        />
        <Model walkSurface="wall" build={groundFacade} opacity={Number(lower && !wire && (floor !== 'L1' || walk))} />
        <group ref={panels} visible={!walk && lower && !wire} userData={{ skipWalk: true }}>
          <Model build={lowerDoorLeaves} />
          <Model build={garageShutters} />
        </group>
        <group ref={setback}>
          <Model walkSurface="wall" build={lowerCeiling} opacity={upper ? (wire ? 0.06 : 1) : 0} />
        </group>
        <Model build={lowerOutline} opacity={lower && wire ? 0.12 : 0} />
      </group>
      <group ref={upperFloor} position-y={getFloorElevation('L2')}>
        <group visible={upper && !wire}>
          <RoomInteriors id="L2" rt={rt} />
        </group>
        <group ref={gardenLeaves} visible={!walk && upper && !wire} userData={{ skipWalk: true }}>
          <Model build={upperDoorLeaves} />
        </group>
        <Model walkSurface="wall" build={observationFloor} opacity={upper ? (wire ? 0.12 : 1) : 0} />
        <Model build={upperServices} opacity={Number(upper && plenum && !wire)} />
        <Model
          walkSurface="ceiling"
          build={upperSoffit}
          opacity={Number(upper && !wire && !plenum && (floor === 'ALL' || walk))}
        />
        <Model walkSurface="wall" build={upperFacade} opacity={Number(upper && !wire)} />
        <group ref={roofShell}>
          <Model walkSurface="wall" build={roofscape} opacity={wire ? 0.09 : Number(floor === 'ALL' || walk)} />
          <Model build={greenhouseGableGlass} opacity={Number(upper && !wire && (floor === 'ALL' || walk))} />
          <group visible={upper && !wire && (floor === 'ALL' || walk)}>
            <group ref={radar} position={[hall.x - 0.55, roof + 0.06, hall.z + 1.25]}>
              <Model build={dome} />
            </group>
            <group ref={a} position={[hall.x0 + 0.7, 0, hall.z1 - 1]}>
              <Model build={turbine} />
            </group>
            <group ref={b} position={[hall.x1 - 0.7, 0, hall.z1 - 1]}>
              <Model build={turbine} />
            </group>
          </group>
        </group>
        <group visible={cold && upper && !wire}>
          <Model walkSurface="wall" build={stormShutters} />
        </group>
        <Model build={upperOutline} opacity={upper && wire ? 0.12 : 0} />
      </group>
    </group>
  )
}
