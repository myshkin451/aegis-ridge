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
const ivory = '#ddd9c9',
  mullion = '#444e51',
  glass = '#91c1c8',
  cedar = '#b09675'
const l1h = FLOORS.L1.clearHeight,
  l2h = FLOORS.L2.clearHeight,
  roof = FLOORS.L2.pitch

const outerEntry = doors.find((d) => d.id === 'entry')!
const innerEntry = doors.find((d) => d.id === 'entry-inner')!
const garageDoors = doors.filter(
  (d) => d.floor === 'L1' && d.zones.includes('l1_garage') && d.zones.includes('surface'),
)
const lowerDoorLeaves = () => closedDoors('L1')
const upperDoorLeaves = () => closedDoors('L2')

function groundFloor() {
  const m = new ModelBuilder()
  addSlab(m, 'L1')
  for (const x of [garage.x0 + 0.2, garage.x1 - 0.2, vestibule.x1 - 0.2, lobby.x1 - 0.2]) {
    for (const z of [l1.z0 + 0.23, l1.z1 - 0.23]) {
      m.box(ivory, [x, l1h / 2, z], [0.38, l1h, 0.4])
      m.box(steel, [x, 0.13, z], [0.48, 0.26, 0.48], 'steel')
    }
  }
  for (const x of [garage.x1, lobby.x0]) {
    partition(m, 'L1', 'z', x, l1.z0, l1.z1, l1h)
    m.box(steel, [x, l1h - 0.24, l1.z], [0.23, 0.48, l1.d], 'steel')
  }
  partition(m, 'L1', 'x', innerEntry.base[2], vestibule.x0, vestibule.x1, l1h)
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
  m.box(ivory, [l1.x, l1h / 2, l1.z0 + 0.14], [l1.w, l1h, 0.28])
  for (const x of [l1.x0 + 0.12, l1.x1 - 0.12]) {
    m.box('#c3c4b8', [x, 0.74, l1.z], [0.24, 1.48, l1.d])
    m.box(glass, [x, 2.05, l1.z], [0.12, 1.14, l1.d], 'glass')
    m.box(ivory, [x, 3.01, l1.z], [0.24, 0.78, l1.d])
    for (let z = l1.z0 + 0.2; z < l1.z1; z += 1.32) m.box(mullion, [x, 2.04, z], [0.28, 1.2, 0.07], 'steel')
  }
  partition(m, 'L1', 'x', garage.z1, garage.x0, garage.x1, l1h)
  for (const d of garageDoors)
    m.box('#ecd1a0', [d.base[0], d.height + 0.1, d.base[2] + 0.1], [2.9, 0.06, 0.12], 'lamp')
  for (let x = lobby.x0 + 0.85; x < lobby.x1; x += 1.7) {
    m.box(glass, [x, 1.75, lobby.z1 - 0.1], [1.64, 2.94, 0.1], 'glass')
    m.box(mullion, [x - 0.82, 1.75, lobby.z1 - 0.08], [0.09, 3.18, 0.13], 'steel')
  }
  m.box(cedar, [lobby.x, l1h - 0.15, lobby.z1], [lobby.w, 0.3, 0.3], 'wood')
  partition(m, 'L1', 'x', outerEntry.base[2], vestibule.x0, vestibule.x1, l1h)
  for (let i = 0; i < 8; i++)
    m.box(cedar, [lobby.x1 - 2.3 + i * 0.29, 1.68, l1.z1 + 0.1], [0.095, 3.2, 0.32], 'wood')
  return m
}

function garageShutters() {
  const m = new ModelBuilder()
  for (const d of garageDoors) {
    const [x, , z] = d.base
    for (let j = 0; j < 14; j++)
      m.box(
        j === 9 ? '#80979a' : '#596568',
        [x, ((j + 0.5) / 14) * d.height, z + 0.22],
        [d.width - 0.08, d.height / 16, 0.055],
        'steel',
      )
  }
  return m
}

function lowerCeiling() {
  const m = new ModelBuilder()
  const y = FLOORS.L1.pitch - SLAB
  // Slab inside the L2 outline belongs to L2. These are the exposed setback terraces.
  for (const [x0, x1, z0, z1] of [
    [l1.x0, l2.x0, l1.z0, l1.z1],
    [l2.x1, l1.x1, l1.z0, l1.z1],
    [l2.x0, l2.x1, l2.z1, l1.z1],
  ])
    m.box(ivory, [(x0 + x1) / 2, y + SLAB / 2, (z0 + z1) / 2], [x1 - x0, SLAB, z1 - z0])
  m.box(steel, [l1.x, y - 0.16, l1.z1], [l1.w + 0.35, 0.28, 0.46], 'steel')
  m.box(ivory, [lobby.x, y - 0.35, l1.z1 + 0.75], [lobby.w + 1.4, 0.16, 1.75])
  for (const z of [l2.z1 + 0.08, l1.z1 - 0.1])
    m.box(cedar, [l2.x, y + SLAB + 0.025, z], [l2.w, 0.05, 0.16], 'wood')
  for (let x = l2.x0 + 0.15; x < l2.x1; x += 0.34)
    m.box(cedar, [x, y + SLAB + 0.018, (l2.z1 + l1.z1) / 2], [0.3, 0.04, l1.z1 - l2.z1 - 0.12], 'wood')
  for (let x = l2.x0; x <= l2.x1; x += 2)
    m.box(mullion, [x, y + SLAB + 0.48, l1.z1 - 0.1], [0.06, 0.96, 0.07], 'steel')
  m.box(mullion, [l2.x, y + SLAB + 0.96, l1.z1 - 0.1], [l2.w, 0.075, 0.08], 'steel')
  m.box(glass, [l2.x, y + SLAB + 0.45, l1.z1 - 0.1], [l2.w, 0.78, 0.035], 'glass')
  return m
}

// The greenhouse has full-height glass on both sides of its dry observation area.
function glassPartition(m: ModelBuilder, axis: WallAxis, fixed: number, from: number, to: number) {
  const addPane = (a: number, b: number, bottom: number) => {
    if (b <= a) return
    const axisCentre = (a + b) / 2,
      h = l2h - bottom,
      y = bottom + h / 2
    m.box(
      glass,
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
  for (const x of [l2.x0 + 0.16, garden.x0, l2.x1 - 0.16])
    for (const z of [l2.z0 + 0.15, l2.z1 - 0.15]) {
      m.box(mullion, [x, l2h / 2, z], [0.23, l2h, 0.2], 'steel')
      m.box(ivory, [x, 0.1, z], [0.35, 0.2, 0.36])
    }
  const beds = footprint(roomsOn('L2').find((r) => r.wetBounds)!.wetBounds!)
  glassPartition(m, 'x', beds.z0, garden.x0, garden.x1)
  glassPartition(m, 'z', garden.x0, l2.z0, l2.z1)
  return m
}

function upperFacade() {
  const m = new ModelBuilder()
  for (const r of [hall, garden]) {
    const bays = Math.round(r.w / 1.8),
      step = r.w / bays
    for (const end of [-1, 1]) {
      const z = end === 1 ? r.z1 : r.z0
      const tilt = r === hall ? end * 0.095 : 0
      for (let i = 0; i < bays; i++) {
        const x = r.x0 + (i + 0.5) * step,
          mid = z - end * (r === hall ? 0.18 : 0.07)
        m.box(glass, [x, l2h / 2, mid], [step - 0.07, l2h - 0.24, 0.07], 'glass', [tilt, 0, 0])
        m.box(mullion, [x - step / 2, l2h / 2, mid], [0.09, l2h, 0.12], 'steel', [tilt, 0, 0])
      }
      m.box(mullion, [r.x, l2h * 0.69, z - end * 0.1], [r.w, 0.07, 0.1], 'steel')
      m.box(ivory, [r.x, 0.15, z - end * 0.17], [r.w, 0.3, 0.32])
      m.box(mullion, [r.x, l2h - 0.12, z], [r.w, 0.24, 0.18], 'steel')
    }
  }
  for (const x of [l2.x0 + 0.09, l2.x1 - 0.09]) {
    m.box(glass, [x, l2h / 2, l2.z], [0.085, l2h - 0.24, l2.d], 'glass')
    for (let z = l2.z0; z <= l2.z1; z += 2) m.box(mullion, [x, l2h / 2, z], [0.14, l2h, 0.09], 'steel')
    m.box(mullion, [x, l2h * 0.68, l2.z], [0.12, 0.075, l2.d], 'steel')
  }
  for (let i = 0; i < 18; i++)
    m.box(warm, [hall.x0 - 0.09, 1.9, hall.z0 + 0.23 + i * 0.35], [0.35, 3.12, 0.1], 'wood')
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
  m.part('round', 'stone', ivory, [x, y + 0.49, z], [r * 1.97, 0.32, r * 1.97])
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

function solarWing(m: ModelBuilder, x: number, y: number, z: number, folded: boolean) {
  const tilt = folded ? 0.018 : 0.19,
    w = 5.8,
    d = 3
  m.box('#9ba5a4', [x, y, z], [w + 0.15, 0.16, d + 0.15], 'steel', [tilt, 0, 0])
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 3; j++) {
      const dx = ((i - 2.5) * w) / 6,
        dz = ((j - 1) * d) / 3
      m.box(
        (i + j) % 3 === 0 ? '#354f64' : '#405c70',
        [x + dx, y + 0.11 - dz * Math.sin(tilt), z + dz * Math.cos(tilt)],
        [w / 6 - 0.06, 0.045, d / 3 - 0.045],
        'solar',
        [tilt, 0, 0],
      )
    }
  for (const dx of [-1.9, 1.9]) {
    m.beam(
      [x + dx, roof + 0.31, z],
      [x + dx, y - 0.08 + 0.88 * Math.sin(tilt), z - 0.88],
      0.12,
      0.11,
      mullion,
    )
    m.beam(
      [x + dx, roof + 0.31, z],
      [x + dx, y - 0.08 - 0.88 * Math.sin(tilt), z + 0.88],
      0.12,
      0.11,
      mullion,
    )
  }
}

function roofscape() {
  const m = new ModelBuilder()
  m.box(mullion, [hall.x, roof - 0.36, hall.z], [hall.w + 0.7, 0.34, hall.d + 0.67], 'steel')
  m.box(ivory, [hall.x, roof - 0.13, hall.z], [hall.w + 0.92, 0.26, hall.d + 0.92])
  m.box('#9ba39d', [hall.x, roof + 0.03, hall.z], [hall.w - 0.1, 0.06, hall.d - 0.16])
  const span = garden.w / 2,
    rise = roof - l2h
  for (let bay = 0; bay < 2; bay++)
    for (const side of [-1, 1]) {
      const ridge = garden.x0 + span * (bay + 0.5),
        edge = ridge + (side * span) / 2,
        centre = (ridge + edge) / 2
      const length = Math.hypot(span / 2, rise),
        tilt = -side * Math.atan2(rise, span / 2)
      m.box(glass, [centre, l2h + rise / 2, garden.z], [length, 0.1, garden.d], 'glass', [0, 0, tilt])
      for (let z = garden.z0; z <= garden.z1; z += 1.75)
        m.beam([edge, l2h, z], [ridge, roof, z], 0.09, 0.115, '#b0b6ae')
      m.box(mullion, [ridge, roof, garden.z], [0.11, 0.12, garden.d], 'steel')
      m.box('#97a19d', [centre, l2h + rise / 2, garden.z], [0.075, 0.06, garden.d], 'steel')
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
function wings(folded: boolean) {
  const m = new ModelBuilder()
  for (const x of [hall.x - 3.85, hall.x + 5.15])
    solarWing(m, x, roof + (folded ? 0.64 : 1.4), l2.z0 + 1.05, folded)
  return m
}
const extendedWings = () => wings(false)
const foldedWings = () => wings(true)
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
    m.beam([x, roof + 1.65, z], [x + dx, roof + 2.1, z + dz], 0.09, 0.1, ivory)
    m.beam([x + dx, roof + 2.1, z + dz], [x + dx, roof + 2.83, z + dz], 0.12, 0.09, ivory)
    m.beam([x + dx, roof + 2.83, z + dz], [x, roof + 3.17, z], 0.09, 0.1, ivory)
  }
  return m
}

function stormShutters() {
  const m = new ModelBuilder()
  for (const side of [-1, 1]) {
    const z = side > 0 ? l2.z1 : l2.z0
    for (let i = 0; i < 14; i++)
      m.box(
        i % 3 ? '#849599' : '#94a4a6',
        [l2.x, 0.3 + i * 0.23, z + side * 0.49],
        [l2.w + 0.84, 0.23, 0.11],
        'steel',
        [side * 0.22, 0, 0],
      )
    const x = side > 0 ? l2.x1 : l2.x0
    for (let i = 0; i < 14; i++)
      m.box('#899b9e', [x + side * 0.49, 0.3 + i * 0.23, l2.z], [0.1, 0.23, l2.d + 0.84], 'steel')
  }
  const entryZ = l1.z1 + 0.04
  for (const dx of [-1.18, 1.18])
    m.box('#ffbf70', [vestibule.x + dx, 1.3 - FLOORS.L2.elevation, entryZ], [0.075, 2.6, 0.09], 'lamp')
  m.box('#ffce83', [vestibule.x, 2.63 - FLOORS.L2.elevation, entryZ], [2.42, 0.085, 0.09], 'lamp')
  m.box('#dae3e6', [hall.x, roof + 0.095, hall.z], [hall.w, 0.08, hall.d], 'snow')
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
const lowerOutline = () => facadeOutline(l1, l1h)
const upperOutline = () => facadeOutline(l2, l2h)

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
    if (!reduceMotion() && !cold && upper && !wire && (floor === 'ALL' || walk)) {
      const step = Math.min(dt, 0.08)
      if (radar.current) radar.current.rotation.y += step * 0.075
      if (a.current) a.current.rotation.y += step * 0.47
      if (b.current) b.current.rotation.y += step * 0.39
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
        <Model build={groundFloor} opacity={lower ? (wire ? 0.1 : 1) : 0} />
        <Model build={lowerServices} opacity={Number(lower && !wire && (plenum || floor === 'L2'))} />
        <Model build={groundFacade} opacity={Number(lower && !wire && (floor !== 'L1' || walk))} />
        <group ref={panels} visible={!walk && lower && !wire} userData={{ skipWalk: true }}>
          <Model build={lowerDoorLeaves} />
          <Model build={garageShutters} />
        </group>
        <group ref={setback}>
          <Model build={lowerCeiling} opacity={upper ? (wire ? 0.06 : 1) : 0} />
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
        <Model build={observationFloor} opacity={upper ? (wire ? 0.12 : 1) : 0} />
        <Model build={upperServices} opacity={Number(upper && plenum && !wire)} />
        <Model build={upperFacade} opacity={Number(upper && !wire)} />
        <group ref={roofShell}>
          <Model build={roofscape} opacity={wire ? 0.09 : Number(floor === 'ALL' || walk)} />
          <group visible={upper && !wire && (floor === 'ALL' || walk)}>
            <group visible={!cold}>
              <Model build={extendedWings} />
            </group>
            <group visible={cold}>
              <Model build={foldedWings} />
            </group>
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
          <Model build={stormShutters} />
        </group>
        <Model build={upperOutline} opacity={upper && wire ? 0.12 : 0} />
      </group>
    </group>
  )
}
