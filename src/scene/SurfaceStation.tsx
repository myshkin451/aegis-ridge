import { slabPlan } from '../geometry/planGeometry'
import { Color, Group } from 'three'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { roomsOn } from '../data/defaultBlueprint'
import { FLOORS, SLAB } from '../data/floors'
import { useShelterStore } from '../store/useShelterStore'
import type { Point3 } from '../types/shelter'
import { footprint, getFloorElevation, shaftPlans } from '../geometry/coords'
import { lid, outline } from './utils/planGeometry'
import { Model } from './utils/Model'
import { ModelBuilder } from './utils/modelBuilder'
import { addSlab, iBeam, shaftFrames, stairStructure, steel, warm } from './utils/shellGeometry'
import { randomSource } from '../geometry/random'

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
    m.box('#afb7b3', [x, l1h / 2, l1.z0 + 2.2], [0.17, l1h, 4.4])
    m.box('#afb7b3', [x, l1h / 2, l1.z1 - 2.6], [0.17, l1h, 5.2])
    m.box(steel, [x, l1h - 0.24, l1.z], [0.23, 0.48, l1.d], 'steel')
  }
  m.box('#a6aca2', [l1.x, 0.04, l1.z1 + 0.87], [l1.w, 0.08, 1.74])
  m.box('#8b9290', [garage.x, 0.095, l1.z1 + 0.85], [garage.w - 0.4, 0.07, 1.67])
  for (let x = garage.x0 + 0.75; x < garage.x1; x += 1.3)
    m.box('#d0b58a', [x, 0.138, l1.z1 + 1.25], [0.1, 0.014, 0.65], 'wood', [0, 0.44, 0])
  // The garage crane centres on the freight hatch within the garage footprint.
  const freight = shaftPlans.find((s) => s.id === 'freight')!
  iBeam(m, (garage.x0 + freight.x + 0.8) / 2, l1h + 0.12, freight.z, freight.x + 0.8 - garage.x0, true, 0.32)
  m.box('#bca177', [freight.x, l1h - 0.1, freight.z], [0.7, 0.3, 0.45], 'steel')
  for (const x of [freight.x - 0.91, freight.x + 0.91])
    for (const z of [freight.z - 0.91, freight.z + 0.91])
      m.box('#b6a382', [x, 0.53, z], [0.11, 1.06, 0.11], 'steel')
  shaftFrames(m, 0, FLOORS.L1.pitch, 'L2')
  stairStructure(m, 'L1')
  return m
}

function groundFacade(walk = false) {
  const m = new ModelBuilder()
  m.box(ivory, [l1.x, l1h / 2, l1.z0 + 0.14], [l1.w, l1h, 0.28])
  for (const x of [l1.x0 + 0.12, l1.x1 - 0.12]) {
    m.box('#c3c4b8', [x, 0.74, l1.z], [0.24, 1.48, l1.d])
    m.box(glass, [x, 2.05, l1.z], [0.12, 1.14, l1.d], 'glass')
    m.box(ivory, [x, 3.01, l1.z], [0.24, 0.78, l1.d])
    for (let z = l1.z0 + 0.2; z < l1.z1; z += 1.32) m.box(mullion, [x, 2.04, z], [0.28, 1.2, 0.07], 'steel')
  }
  for (let bay = 0; bay < 2; bay++) {
    const x = garage.x0 + garage.w * (0.25 + bay * 0.5),
      z = garage.z1
    m.box(mullion, [x, 1.5, z - 0.16], [4.38, 3.0, 0.2], 'steel')
    for (let j = 0; j < 14; j++)
      m.box(j === 9 ? '#80979a' : '#596568', [x, 0.14 + j * 0.204, z - 0.025], [4.18, 0.176, 0.15], 'steel')
    for (const dx of [-2.22, 2.22]) m.box(ivory, [x + dx, 1.58, z], [0.22, 3.16, 0.3])
    m.box('#ecd1a0', [x, 3.09, z + 0.1], [2.9, 0.06, 0.12], 'lamp')
  }
  m.box('#b7b8ac', [garage.x, 3.23, garage.z1], [garage.w, 0.34, 0.35])
  for (let x = lobby.x0 + 0.85; x < lobby.x1; x += 1.7) {
    m.box(glass, [x, 1.75, lobby.z1 - 0.1], [1.64, 2.94, 0.1], 'glass')
    m.box(mullion, [x - 0.82, 1.75, lobby.z1 - 0.08], [0.09, 3.18, 0.13], 'steel')
  }
  m.box(cedar, [lobby.x, l1h - 0.15, lobby.z1], [lobby.w, 0.3, 0.3], 'wood')
  if (!walk) {
    m.box('#767c79', [vestibule.x, 1.55, l1.z1 - 0.25], [vestibule.w - 0.3, 3.1, 0.25], 'steel')
    for (const dx of [-0.61, 0.61])
      m.box('#424f52', [vestibule.x + dx, 1.37, l1.z1 - 0.06], [1.14, 2.68, 0.12], 'steel')
  } else {
    const jamb = (vestibule.w - 2.4) / 2
    for (const sign of [-1, 1])
      m.box(
        '#88938d',
        [vestibule.x + sign * (1.2 + jamb / 2), 1.54, l1.z1 - 0.12],
        [jamb, 3.08, 0.22],
        'steel',
      )
    m.box('#707a75', [vestibule.x, 2.94, l1.z1 - 0.12], [2.4, 0.52, 0.22], 'steel')
    for (const side of [-1, 1])
      m.box('#a9b1a9', [vestibule.x + side * (1.2 + jamb / 2), 1.55, l1.z1 - 3.8], [jamb, 3.1, 0.16])
    m.box('#818b83', [vestibule.x, 2.94, l1.z1 - 3.8], [2.4, 0.52, 0.18], 'steel')
  }
  for (let i = 0; i < 8; i++)
    m.box(cedar, [lobby.x1 - 2.3 + i * 0.29, 1.68, l1.z1 + 0.1], [0.095, 3.2, 0.32], 'wood')
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

function observationFloor() {
  const m = new ModelBuilder(),
    random = randomSource(305)
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
  for (const sign of [-1, 1]) {
    const leaf = (garden.w - 1.45) / 2
    m.box(glass, [garden.x + sign * (0.725 + leaf / 2), l2h / 2, beds.z0], [leaf, l2h, 0.09], 'glass')
  }
  for (const x of [beds.x0 + 1.6, beds.x + 0.2, beds.x1 - 1.5]) {
    m.box('#999b89', [x, 0.21, beds.z], [1.38, 0.42, beds.d - 2.2])
    m.box('#655e4c', [x, 0.43, beds.z], [1.2, 0.035, beds.d - 2.4], 'wood')
    for (let z = beds.z0 + 1.7; z < beds.z1 - 0.8; z += 1.1) {
      const h = 0.7 + random() * 0.92
      m.part('bud', 'foliage', '#829067', [x, 0.46 + h * 0.42, z], [1.14, h, 1.04], [0, random() * 4, 0.24])
      m.part('bud', 'foliage', '#657a5b', [x + 0.27, 0.52 + h * 0.29, z + 0.22], [0.88, h * 0.68, 0.7])
    }
  }
  for (let z = hall.z0 + 1; z < hall.z1 - 0.4; z += 2.25) {
    m.box(cedar, [hall.x0 + 0.65, 0.5, z], [0.63, 1.0, 1.89], 'wood')
    m.box('#718381', [hall.x0 + 0.62, 1.02, z], [0.76, 0.1, 2.02], 'steel')
  }
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
  for (const x of [l2.x0 + 0.09, l2.x1 - 0.09, garden.x0]) {
    if (x === garden.x0) {
      for (const side of [-1, 1])
        m.box(
          glass,
          [x, l2h / 2, l2.z + side * (l2.d / 4 + 0.42)],
          [0.085, l2h - 0.24, l2.d / 2 - 0.84],
          'glass',
        )
    } else m.box(glass, [x, l2h / 2, l2.z], [0.085, l2h - 0.24, l2.d], 'glass')
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
  const tilt = folded ? 1.32 : 0.19,
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
    m.beam([x + dx, y - 1.3, z], [x + dx, y - 0.1, z - 0.88], 0.12, 0.11, mullion)
    m.beam([x + dx, y - 1.3, z], [x + dx, y - 0.23, z + 0.88], 0.12, 0.11, mullion)
  }
}

function roofscape(cold = false) {
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
  radome(m, hall.x - 0.55, roof + 0.06, hall.z + 1.25)
  const pz = l2.z0 + 1.05,
    py = roof + 1.4
  m.box(mullion, [hall.x + 0.6, roof + 0.35, pz], [15.6, 0.3, 0.34], 'steel')
  for (const x of [hall.x - 3.85, hall.x + 5.15]) solarWing(m, x, py, pz, cold)
  for (const x of [hall.x0 + 0.7, hall.x1 - 0.7]) {
    const z = hall.z1 - 1.0
    m.part('round', 'steel', '#8a928f', [x, roof + 1.32, z], [0.1, 2.64, 0.1])
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3,
        dx = Math.cos(a) * 0.41,
        dz = Math.sin(a) * 0.41
      m.beam([x, roof + 1.65, z], [x + dx, roof + 2.1, z + dz], 0.09, 0.1, ivory)
      m.beam([x + dx, roof + 2.1, z + dz], [x + dx, roof + 2.83, z + dz], 0.12, 0.09, ivory)
      m.beam([x + dx, roof + 2.83, z + dz], [x, roof + 3.17, z], 0.09, 0.1, ivory)
    }
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
        [l2.x, 0.3 + i * 0.23, z + side * 0.13],
        [l2.w, 0.23, 0.11],
        'steel',
        [side * 0.22, 0, 0],
      )
    const x = side > 0 ? l2.x1 : l2.x0
    for (let i = 0; i < 14; i++)
      m.box('#899b9e', [x + side * 0.17, 0.3 + i * 0.23, l2.z], [0.1, 0.23, l2.d], 'steel')
  }
  const entryZ = l1.z1 + 0.04
  for (const dx of [-1.18, 1.18])
    m.box('#ffbf70', [vestibule.x + dx, 1.3 - FLOORS.L2.elevation, entryZ], [0.075, 2.6, 0.09], 'lamp')
  m.box('#ffce83', [vestibule.x, 2.63 - FLOORS.L2.elevation, entryZ], [2.42, 0.085, 0.09], 'lamp')
  m.box('#dae3e6', [hall.x, roof + 0.095, hall.z], [hall.w, 0.08, hall.d], 'snow')
  return m
}
const closedWeatherRoof = () => roofscape(true)
const walkFacade = () => groundFacade(true)

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

export function SurfaceStation() {
  const floor = useShelterStore((s) => s.floor),
    mode = useShelterStore((s) => s.mode),
    plenum = useShelterStore((s) => s.plenum)
  const walk = useShelterStore((s) => s.cameraState === 'walkthrough'),
    cold = useShelterStore((s) => s.cold)
  const building = useRef<Group>(null)
  useFrame(({ camera }) => {
    if (building.current) building.current.visible = !walk || camera.position.y > -10.3
  })
  const lower = walk || floor === 'ALL' || floor === 'L1' || floor === 'L2'
  const upper = walk || floor === 'ALL' || floor === 'L2'
  const wire = mode === 'xray'
  return (
    <group ref={building} name="科研观测站">
      <group position-y={getFloorElevation('L1')}>
        <Model build={groundFloor} opacity={lower ? (wire ? 0.1 : 1) : 0} />
        <Model build={lowerServices} opacity={Number(lower && !wire && (plenum || floor === 'L2'))} />
        <Model
          build={walk ? walkFacade : groundFacade}
          opacity={Number(lower && !wire && (floor !== 'L1' || walk))}
        />
        <Model build={lowerCeiling} opacity={upper ? (wire ? 0.06 : 1) : 0} />
        <Model build={lowerOutline} opacity={lower && wire ? 0.12 : 0} />
      </group>
      <group position-y={getFloorElevation('L2')}>
        <Model build={observationFloor} opacity={upper ? (wire ? 0.12 : 1) : 0} />
        <Model build={upperServices} opacity={Number(upper && plenum && !wire)} />
        <Model build={upperFacade} opacity={Number(upper && !wire)} />
        <Model
          build={cold ? closedWeatherRoof : roofscape}
          opacity={wire ? 0.09 : Number(floor === 'ALL' || walk)}
        />
        {cold && <Model build={stormShutters} opacity={Number(upper && !wire)} />}
        <Model build={upperOutline} opacity={upper && wire ? 0.12 : 0} />
      </group>
    </group>
  )
}
