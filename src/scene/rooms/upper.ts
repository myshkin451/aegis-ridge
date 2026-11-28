import { vegetationV3 } from '../terrain/foliageAssets'
import { plantBed } from './cropBeds'
import { drawGym } from './residential'
import type { EquipmentUnit, Point3 } from '../../types/shelter'
import type { ModelBuilder } from '../utils/modelBuilder'
import type { Finish } from '../materials/pbrLibrary'

const enamel = '#b3c1b8',
  dark = '#39494b',
  inox = '#aebbb8',
  bronze = '#b9a077'
const spruce = '#a78660',
  yellow = '#c99849',
  signal = '#b6d4ba',
  paper = '#dfd9bc'
const round = (
  m: ModelBuilder,
  p: Point3,
  s: Point3,
  color = inox,
  rot?: Point3,
  material: Finish = 'steel',
) => m.part('round', material, color, p, s, rot)

function top(m: ModelBuilder, w: number, h: number, d: number, tint = spruce) {
  m.box(tint, [0, h - 0.055, 0], [w, 0.11, d], 'oak_int')
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      m.box(dark, [x * (w / 2 - 0.13), (h - 0.11) / 2, z * (d / 2 - 0.12)], [0.075, h - 0.11, 0.075], 'steel')
  for (const z of [-1, 1]) m.box(inox, [0, h - 0.16, z * (d / 2 - 0.12)], [w - 0.19, 0.11, 0.04], 'steel')
}

function thermos(m: ModelBuilder, x: number, y: number, z: number) {
  round(m, [x, y + 0.135, z], [0.089, 0.27, 0.089], '#a1624c')
  round(m, [x, y + 0.284, z], [0.082, 0.032, 0.082])
}
function book(m: ModelBuilder, x: number, y: number, z: number, tint = '#627a77') {
  m.box(tint, [x, y + 0.026, z], [0.31, 0.052, 0.23], 'oak_int', [0, -0.12, 0])
  m.box(paper, [x, y + 0.028, z + 0.009], [0.299, 0.035, 0.218], 'oak_int', [0, -0.12, 0])
}
function gauge(m: ModelBuilder, x: number, y: number, z: number, r = 0.11) {
  round(m, [x, y, z], [r * 2.24, 0.051, r * 2.24], dark, [Math.PI / 2, 0, 0])
  round(m, [x, y, z + 0.031], [r * 2, 0.015, r * 2], paper, [Math.PI / 2, 0, 0])
  m.box('#9c584b', [x + 0.018, y + 0.02, z + 0.045], [0.012, r * 1.22, 0.009], 'steel', [0, 0, -0.56])
}
function readout(m: ModelBuilder, x: number, y: number, z: number, w: number, h: number, seed = 0) {
  m.box(dark, [x, y, z], [w, h, 0.075], 'steel')
  m.box('#38504e', [x, y, z + 0.046], [w * 0.93, h * 0.86, 0.012], 'epoxy')
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 16; i++) {
      const sample = (n: number) =>
        y + (row - 0.5) * h * 0.41 + Math.sin(n * (row + 0.8) + seed) * Math.sin(n * 0.23) * h * 0.15
      m.beam(
        [x + (i / 16 - 0.46) * w * 0.92, sample(i), z + 0.058],
        [x + ((i + 1) / 16 - 0.46) * w * 0.92, sample(i + 1), z + 0.058],
        0.012,
        0.008,
        row ? '#cdb38d' : '#a4c6b2',
        'lamp',
      )
    }
}
function telescope(m: ModelBuilder) {
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3
    m.beam(
      [Math.cos(a) * 0.87, 0.06, Math.sin(a) * 0.87],
      [Math.cos(a) * 0.17, 1.28, Math.sin(a) * 0.17],
      0.1,
      0.13,
      inox,
    )
    round(m, [Math.cos(a) * 0.87, 0.05, Math.sin(a) * 0.87], [0.22, 0.1, 0.22], dark)
  }
  round(m, [0, 1.36, 0], [0.45, 0.25, 0.45], dark)
  round(m, [0, 1.57, 0], [0.31, 0.33, 0.31], enamel)
  const tilt = 0.96
  for (const [offset, length, diameter, color] of [
    [0, 1.58, 0.46, '#cecfc2'],
    [-0.69, 0.18, 0.48, dark],
    [0.73, 0.2, 0.51, dark],
    [0.837, 0.018, 0.405, '#729c9f'],
    [-0.92, 0.28, 0.13, inox],
  ] as const)
    round(
      m,
      [0, 1.84 + offset * Math.cos(tilt), offset * Math.sin(tilt)],
      [diameter, length, diameter],
      color,
      [tilt, 0, 0],
    )
  round(m, [0.28, 1.91, 0.01], [0.09, 0.62, 0.09], bronze, [tilt, 0, 0])
  m.beam([-0.13, 1.51, 0], [-0.53, 1.07, 0], 0.06, 0.06, inox)
  round(m, [-0.5, 1.12, 0], [0.28, 0.28, 0.28], dark, [0, 0, -0.72])
}

function weatherDesk(m: ModelBuilder) {
  top(m, 5.44, 0.81, 1.12)
  for (const [i, x] of [-1.72, -0.57, 0.58, 1.73].entries()) {
    m.box(inox, [x, 0.96, -0.19], [0.077, 0.3, 0.075], 'steel')
    readout(m, x, 1.36, -0.19, 1.07, 0.58, i * 3)
    m.box('#697874', [x, 0.831, 0.19], [0.61, 0.043, 0.18], 'epoxy')
  }
  thermos(m, 2.45, 0.81, 0.09)
  book(m, -2.43, 0.81, 0.1)
}
function planter(m: ModelBuilder, e: EquipmentUnit) {
  top(m, 1.45, 0.32, 4.62, '#967d60')
  m.box('#4d5140', [0, 0.342, 0], [1.29, 0.06, 4.45], 'epoxy')
  for (const x of [-0.7, 0.7]) m.box('#a89b84', [x, 0.375, 0], [0.074, 0.24, 4.62], 'oak_int')
  for (const z of [-2.25, 2.25]) m.box('#a89b84', [0, 0.375, z], [1.47, 0.24, 0.075], 'oak_int')
  if (vegetationV3) {
    const tuber = e.tagCode.endsWith('B')
    // Keep the front ID plate and the timber edge clear, including the full card rectangle.
    plantBed(
      m,
      {
        width: 1.25,
        length: 4.1,
        columns: 2,
        surface: 0.372,
        rowPitch: 0.55,
        originZ: -0.09,
        headroom: 1.03,
      },
      tuber ? 'tuber' : 'greens',
      0,
      tuber ? 212 : 211,
    )
  } else {
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 2; j++) {
        const a = i * 1.83 + j * 2.38,
          x = (j - 0.5) * 0.57 + Math.cos(a) * 0.06,
          z = (i - 3) * 0.603
        const h = 0.32 + Math.sin(a) * 0.09
        if (e.tagCode.endsWith('A')) {
          for (let k = 0; k < 8; k++) {
            const phi = a + k * 0.785,
              r = 0.15 + (k % 2) * 0.04
            m.part(
              'leaf',
              'foliage',
              ['#697b54', '#789557', '#506c55'][k % 3],
              [x + r * Math.sin(phi), 0.51 + (k % 2) * 0.07, z + r * Math.cos(phi)],
              [0.21, 0.33, 0.44],
              [0.25, phi, 0],
            )
          }
        } else {
          m.beam([x, 0.37, z], [x + 0.05, 0.72 + h, z], 0.022, 0.022, '#697755', 'oak_int')
          for (let k = 0; k < 5; k++) {
            const phi = k * 2.4
            m.part(
              'leaf',
              'foliage',
              '#71916a',
              [x + Math.sin(phi) * 0.13, 0.46 + k * 0.074, z + Math.cos(phi) * 0.13],
              [0.19, 0.12, 0.33],
              [0.2, phi, 0],
            )
          }
          for (let k = 0; k < 3; k++)
            m.part(
              'bud',
              'foliage',
              k % 2 ? '#b49b94' : '#c1b388',
              [x + 0.05 + Math.cos(k * 2.1) * 0.054, 0.73 + h + k * 0.045, z + Math.sin(k * 2.1) * 0.055],
              [0.13, 0.15, 0.14],
            )
        }
      }
  }
  m.box(paper, [-0.58, 0.56, 2.15], [0.23, 0.13, 0.035], 'oak_int', [0.14, -0.18, 0])
}

function coupler(m: ModelBuilder) {
  round(m, [0, 0.41, 0], [0.59, 0.1, 0.59], dark)
  round(m, [0, 0.23, 0], [0.42, 0.27, 0.42])
  for (const r of [0.12, 0.18, 0.24, 0.3]) round(m, [0, r, 0], [0.46, 0.025, 0.46])
  round(m, [0, 0.065, 0], [0.21, 0.12, 0.21], bronze)
}
function sampleDesk(m: ModelBuilder, biology: boolean) {
  top(m, biology ? 3 : 2.64, 0.88, 1.18)
  book(m, -0.94, 0.88, 0.12)
  if (!biology) {
    m.box(paper, [0.29, 0.892, 0], [1.29, 0.02, 0.76], 'oak_int')
    for (let i = 0; i < 8; i++)
      for (let k = 0; k < 8; k++) {
        const r = 0.04 + 0.035 * i,
          p = (n: number): Point3 => [
            0.31 + Math.cos((n * Math.PI) / 4) * r * 1.65,
            0.905,
            Math.sin((n * Math.PI) / 4) * r * 0.7,
          ]
        m.beam(p(k), p(k + 1), 0.006, 0.007, '#9d9476', 'oak_int')
      }
    m.part('rock', 'granite', '#889283', [-0.62, 0.984, -0.21], [0.41, 0.21, 0.31])
  } else {
    for (let i = 0; i < 5; i++) {
      const x = i * 0.38 - 0.4
      round(m, [x, 1, 0], [0.2, 0.24, 0.2], bronze)
      m.part('bud', 'foliage', '#849669', [x, 1.17, 0], [0.24, 0.105, 0.24])
    }
  }
}
function vehicle(m: ModelBuilder, e: EquipmentUnit) {
  const paint = e.tagCode.endsWith('A') ? '#78897c' : '#a39978'
  m.box(dark, [0, 0.53, 0.02], [1.49, 0.33, 3.23], 'steel')
  for (const x of [-0.844, 0.844])
    for (const z of [-1.11, 1.11]) {
      round(m, [x, 0.413, z], [0.824, 0.31, 0.824], '#3d4441', [0, 0, Math.PI / 2], 'epoxy')
      round(m, [x * 1.17, 0.413, z], [0.44, 0.044, 0.44], inox, [0, 0, Math.PI / 2])
      round(m, [x * 1.191, 0.413, z], [0.17, 0.018, 0.17], dark, [0, 0, Math.PI / 2])
      m.box(paint, [x * 0.917, 0.86, z], [0.45, 0.12, 0.98], 'steel')
    }
  m.box(paint, [0, 0.79, 0.93], [1.46, 0.34, 1.21], 'steel', [-0.07, 0, 0])
  m.box(dark, [0, 0.7, 1.58], [1.4, 0.39, 0.09], 'steel')
  for (let i = 0; i < 5; i++) m.box(inox, [0, 0.57 + i * 0.059, 1.644], [0.67, 0.022, 0.026], 'steel')
  for (const x of [-0.58, 0.58]) {
    m.box('#ffe5c2', [x, 0.78, 1.645], [0.21, 0.15, 0.036], 'lamp')
    m.beam([x, 0.83, 0.56], [x, 1.69, 0.2], 0.06, 0.06, dark)
    m.beam([x, 1.69, 0.2], [x, 1.69, -0.7], 0.06, 0.06, dark)
    m.beam([x, 1.69, -0.7], [x, 0.77, -0.73], 0.06, 0.06, dark)
  }
  m.box(paint, [0, 1.74, -0.24], [1.59, 0.09, 1.22], 'steel')
  for (const x of [-0.37, 0.37]) {
    m.box('#665d50', [x, 0.81, -0.18], [0.49, 0.16, 0.62], 'epoxy')
    m.box('#625f54', [x, 1.08, -0.45], [0.5, 0.57, 0.12], 'epoxy', [-0.1, 0, 0])
  }
  m.box(paint, [0, 0.83, -1.18], [1.49, 0.17, 0.94], 'steel')
  for (const x of [-0.72, 0.72]) m.box(paint, [x, 1.0, -1.18], [0.075, 0.31, 0.94], 'steel')
  m.box(paint, [0, 1, -1.64], [1.49, 0.31, 0.07], 'steel')
  m.box(inox, [0, 0.44, 1.74], [1.62, 0.11, 0.12], 'steel')
  round(m, [-0.38, 1.14, 0.2], [0.25, 0.032, 0.25], dark, [0.89, 0, 0])
  m.box('#ab8964', [0.23, 1.0, -1.2], [0.68, 0.27, 0.6], 'oak_int')
  for (const x of [0.03, 0.42]) m.box(dark, [x, 1.145, -1.2], [0.045, 0.016, 0.61], 'epoxy')
}
function crane(m: ModelBuilder) {
  for (const x of [-4.54, 4.54]) {
    for (const z of [-3.22, 3.22]) {
      m.box(dark, [x, 0.06, z], [0.4, 0.12, 0.4], 'steel')
      m.box(yellow, [x, 1.66, z], [0.22, 3.21, 0.25], 'steel')
      for (const side of [-1, 1]) m.box(bronze, [x + side * 0.1, 1.67, z], [0.056, 3.21, 0.32], 'steel')
      m.beam([x, 2.62, z], [x, 3.19, z - Math.sign(z) * 0.62], 0.1, 0.13, dark)
    }
    m.box(yellow, [x, 3.27, 0], [0.26, 0.25, 6.76], 'steel')
  }
  for (const z of [-0.27, 0.27]) {
    m.box(yellow, [0, 3.36, z], [9.41, 0.3, 0.125], 'steel')
    m.box(bronze, [0, 3.535, z], [9.4, 0.086, 0.24], 'steel')
  }
  m.box(dark, [2.96, 3.22, 0], [0.96, 0.32, 0.8], 'steel')
  round(m, [2.96, 3.03, 0], [0.31, 0.55, 0.31], bronze, [0, 0, Math.PI / 2])
  for (const x of [2.9, 3.02]) m.box(inox, [x, 2.82, 0], [0.018, 0.38, 0.018], 'steel')
  m.beam([2.91, 2.65, 0], [2.98, 2.59, 0], 0.045, 0.05, yellow)
  m.beam([2.98, 2.59, 0], [3.06, 2.67, 0], 0.045, 0.05, yellow)
}
function plow(m: ModelBuilder) {
  for (let i = 0; i < 3; i++)
    m.box(yellow, [0, 0.2 + i * 0.24, 0.48 - i * 0.07], [2.53, 0.26, 0.12], 'steel', [-0.24 + i * 0.14, 0, 0])
  for (const x of [-0.92, 0.92]) m.beam([x, 0.28, 0.36], [x * 0.23, 0.45, -0.57], 0.1, 0.08, dark)
  m.box(dark, [0, 0.45, -0.59], [0.57, 0.2, 0.18], 'steel')
}
function statusPanel(m: ModelBuilder) {
  m.box(dark, [0, 0.07, 0], [0.68, 0.14, 0.81], 'steel')
  m.box(enamel, [0, 0.98, 0], [0.57, 1.83, 0.55], 'steel')
  m.box(dark, [0, 1.36, 0.31], [0.51, 0.72, 0.055], 'steel')
  gauge(m, 0, 1.49, 0.35, 0.12)
  for (const x of [-0.13, 0.13])
    round(m, [x, 1.11, 0.35], [0.081, 0.04, 0.081], x > 0 ? '#9c5b49' : signal, [Math.PI / 2, 0, 0], 'lamp')
  for (let k = 0; k < 6; k++) m.box(dark, [0, 0.37 + k * 0.064, 0.29], [0.36, 0.018, 0.035], 'steel')
  round(m, [0, 1.99, 0], [0.1, 0.18, 0.1], signal, undefined, 'lamp')
}
function lockers(m: ModelBuilder, e: EquipmentUnit) {
  const w = e.moduleSizeM[0] - 0.08,
    n = e.tagCode.startsWith('PPE') ? 6 : 4,
    bay = w / n
  m.box(dark, [0, 1.05, 0], [w, 2.02, 0.73], 'steel')
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5 - n / 2) * bay
    m.box(i % 2 ? '#9ca99b' : '#8f9e94', [x, 1.08, 0.375], [bay - 0.032, 1.93, 0.055], 'steel')
    for (let j = 0; j < 4; j++) m.box(dark, [x, 1.81 - j * 0.054, 0.407], [bay * 0.51, 0.018, 0.012], 'steel')
    m.box(inox, [x + bay * 0.3, 1.08, 0.414], [0.033, 0.15, 0.029], 'steel')
    m.box(paper, [x, 1.53, 0.407], [0.18, 0.06, 0.012], 'oak_int')
  }
}
function bootBench(m: ModelBuilder) {
  top(m, 1.35, 0.44, 0.85)
  for (const x of [-0.37, 0.04, 0.39]) {
    m.box('#61584c', [x, 0.55, 0], [0.21, 0.22, 0.44], 'epoxy')
    m.box('#716954', [x, 0.75, -0.09], [0.19, 0.35, 0.22], 'epoxy')
    m.box(dark, [x, 0.927, -0.09], [0.13, 0.02, 0.14], 'epoxy')
  }
  m.box(inox, [0, 1.08, -0.42], [1.29, 0.13, 0.13], 'steel')
}
function geology(m: ModelBuilder) {
  top(m, 5.81, 0.68, 1.41)
  m.box('#8a9084', [0, 1.51, -0.55], [5.76, 1.62, 0.12], 'oak_int')
  for (let i = 0; i < 19; i++)
    for (let j = 0; j < 4; j++) {
      const height = 0.38 + 0.11 * Math.cos(i * 0.61 + j * 0.3) + 0.13 * Math.sin(i * 0.34) - j * 0.035
      m.box(
        ['#8b887a', '#ac947e', '#b6a584', '#c6b89c'][j],
        [(i - 9) * 0.28, 1.07 + j * 0.19 + height * 0.6, -0.474],
        [0.272, height * 0.59, 0.088],
        'stone',
      )
    }
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.78
    m.part(
      'rock',
      'granite',
      ['#857a70', '#968f7f', '#777b73'][i % 3],
      [x, 0.86, 0],
      [0.43, 0.33, 0.39],
      [0, i, 0],
    )
    m.box(paper, [x, 0.709, 0.42], [0.27, 0.039, 0.15], 'oak_int', [0.14, 0, 0])
  }
}
function windVane(m: ModelBuilder) {
  top(m, 3.16, 0.8, 1.38)
  round(m, [-0.79, 1.16, 0], [0.05, 0.72, 0.05])
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3,
      x = -0.79 + Math.sin(a) * 0.34,
      z = Math.cos(a) * 0.34
    m.beam([-0.79, 1.51, 0], [x, 1.51, z], 0.02, 0.02, inox)
    m.part('bud', 'steel', inox, [x, 1.51, z], [0.15, 0.13, 0.16], [0, a, 0])
  }
  for (let k = 0; k < 7; k++) round(m, [0.07, 0.92 + k * 0.079, -0.05], [0.44, 0.058, 0.44], paper)
  readout(m, 0.96, 1.12, -0.17, 0.79, 0.46)
  book(m, 0.83, 0.8, 0.36)
}
function visitor(m: ModelBuilder) {
  top(m, 2.29, 0.9, 1.13)
  m.box('#9d8c76', [0, 0.46, -0.44], [1.94, 0.73, 0.07], 'oak_int')
  for (let i = 0; i < 6; i++)
    m.box(paper, [-0.68 + i * 0.22, 0.97, 0.05], [0.19, 0.13, 0.32], 'oak_int', [0, -0.15, 0])
  book(m, 0.65, 0.9, -0.03)
  round(m, [0.92, 1.01, 0], [0.1, 0.22, 0.1], bronze)
}
function shower(m: ModelBuilder) {
  m.box('#6d827f', [0, 0.024, 0], [2.49, 0.048, 4.57], 'grate')
  for (const [k, z] of [-1.73, 0, 1.73].entries()) {
    for (const x of [-1.12, 1.12]) {
      m.box(dark, [x, 0.06, z], [0.29, 0.12, 0.34], 'steel')
      m.box(k === 1 ? '#90a8a5' : inox, [x, 1.18, z], [0.15, 2.24, 0.19], 'steel')
      m.beam([x, 2.28, z], [x * 0.8, 2.54, z], 0.17, 0.19, inox)
      for (const y of [0.73, 1.36, 1.96])
        round(m, [x * 0.924, y, z], [0.067, 0.06, 0.067], bronze, [0, 0, Math.PI / 2])
      m.box(k === 1 ? '#b8c9ad' : '#c2d9d7', [x, 1.69, z + 0.107], [0.063, 0.68, 0.022], 'lamp')
    }
    m.box(inox, [0, 2.54, z], [1.86, 0.18, 0.2], 'steel')
    for (const x of [-0.52, 0, 0.52]) round(m, [x, 2.425, z], [0.14, 0.052, 0.14], dark)
  }
}
function sump(m: ModelBuilder) {
  round(m, [0, 0.76, 0], [1.36, 1.45, 1.95], inox)
  round(m, [0, 1.514, 0], [1.4, 0.105, 2], dark)
  round(m, [0.21, 1.6, 0.17], [0.39, 0.08, 0.39], bronze)
  gauge(m, 0.07, 0.99, 0.94)
}
function robotCart(m: ModelBuilder, e: EquipmentUnit) {
  m.box(enamel, [0, 0.46, -0.83], [1.46, 0.92, 0.32], 'steel')
  for (const x of [-0.47, 0.47]) m.box(bronze, [x, 0.36, -0.64], [0.14, 0.28, 0.025], 'steel')
  m.box(dark, [0, 0.15, 0.12], [1.18, 0.23, 1.46], 'epoxy')
  m.box('#a8b2a1', [0, 0.32, 0.14], [1.3, 0.26, 1.55], 'steel')
  round(m, [0, 0.47, 0.18], [1.05, 0.06, 1.05], inox)
  for (const x of [-0.48, 0.48]) m.box(yellow, [x, 0.3, 0.928], [0.19, 0.071, 0.024], 'lamp')
  round(m, [0.38, 0.55, -0.38], [0.12, 0.14, 0.12], dark)
  const n = e.tagCode.slice(-1).charCodeAt(0) - 64
  for (let i = 0; i < n; i++) m.box(paper, [0.32 + i * 0.081, 0.342, 0.934], [0.04, 0.1, 0.017], 'oak_int')
}
function scale(m: ModelBuilder) {
  m.box(dark, [0, 0.08, 0], [1.67, 0.16, 2], 'steel')
  m.box(inox, [0, 0.177, 0], [1.55, 0.033, 1.89], 'grate')
  for (const x of [-0.73, 0.73]) m.box(enamel, [x, 1.11, -0.42], [0.095, 1.94, 0.14], 'steel')
  m.box(enamel, [0, 2.09, -0.42], [1.56, 0.14, 0.16], 'steel')
  m.box(dark, [0, 1.97, -0.42], [0.36, 0.12, 0.18], 'steel')
  m.box('#c5a888', [0, 0.44, 0.29], [0.74, 0.5, 0.72], 'oak_int')
  m.box(paper, [0.06, 0.695, 0.32], [0.38, 0.015, 0.26], 'oak_int')
  for (let i = 0; i < 8; i++)
    m.box(dark, [-0.048 + i * 0.028, 0.706, 0.33], [0.009 + (i % 2) * 0.005, 0.006, 0.15], 'epoxy')
}
function droneDock(m: ModelBuilder) {
  top(m, 5.92, 0.82, 2.11, '#9c9c8c')
  for (const x of [-1.81, 0, 1.81]) {
    m.box(dark, [x, 0.853, 0], [1.61, 0.065, 1.59], 'epoxy')
    for (const i of [-1, 1])
      for (const j of [-1, 1]) {
        const px = x + i * 0.44,
          pz = j * 0.4
        m.beam([x, 1.12, 0], [px, 1.16, pz], 0.065, 0.07, inox)
        round(m, [px, 1.18, pz], [0.1, 0.12, 0.1], dark)
        m.box(dark, [px, 1.251, pz], [0.47, 0.016, 0.046], 'steel', [0, i * j * 0.45, 0])
      }
    m.part('bud', 'steel', enamel, [x, 1.13, 0], [0.45, 0.22, 0.58])
    round(m, [x, 1.01, 0.19], [0.12, 0.15, 0.12], dark, [Math.PI / 2, 0, 0])
    for (const i of [-1, 1]) m.box(inox, [x + i * 0.18, 0.97, 0], [0.035, 0.18, 0.42], 'steel')
    m.box(signal, [x, 0.877, 0.86], [0.29, 0.028, 0.053], 'lamp')
  }
}
function fieldGear(m: ModelBuilder) {
  const w = 2.11
  for (const y of [0.13, 0.85, 1.57, 2.27]) m.box(inox, [0, y, 0], [w, 0.075, 1.08], 'steel')
  for (const x of [-0.98, 0.98])
    for (const z of [-0.49, 0.49]) m.box(dark, [x, 1.16, z], [0.057, 2.32, 0.06], 'steel')
  for (let k = 0; k < 3; k++) {
    const x = (k - 1) * 0.61
    round(m, [x, 0.36, 0], [0.45, 0.36, 0.45], '#b4946a')
    round(m, [x, 0.56, 0], [0.38, 0.08, 0.38], inox)
    m.box('#73847c', [x, 1.04, 0], [0.53, 0.28, 0.67], 'epoxy')
    for (let i = 0; i < 4; i++) round(m, [x, 1.71 + i * 0.09, 0], [0.35, 0.06, 0.35], paper)
  }
}
function rack(m: ModelBuilder) {
  for (const x of [-0.84, 0.84])
    for (const z of [-3.63, 0, 3.63]) {
      m.box('#6f8885', [x, 1.35, z], [0.083, 2.7, 0.1], 'steel')
      m.box(dark, [x, 0.045, z], [0.12, 0.09, 0.14], 'steel')
    }
  for (let j = 0; j < 4; j++) {
    const y = 0.18 + j * 0.64
    m.box(inox, [0, y, 0], [1.71, 0.09, 7.32], 'steel')
    for (const x of [-0.83, 0.83]) m.box(bronze, [x, y - 0.035, 0], [0.09, 0.14, 7.34], 'steel')
    for (let k = 0; k < 8; k++) {
      const z = (k - 3.5) * 0.88,
        color = ['#7c918b', '#a19c80', '#87959a', '#ac9174'][(k + 2 * j) % 4]
      m.box(color, [0, y + 0.265, z], [1.42, 0.42, 0.79], 'epoxy')
      m.box(dark, [0, y + 0.494, z], [1.45, 0.047, 0.81], 'epoxy')
      for (const x of [-0.716, 0.716]) {
        m.box(dark, [x, y + 0.36, z], [0.015, 0.056, 0.25], 'epoxy')
        m.box(paper, [x, y + 0.22, z - 0.17], [0.02, 0.09, 0.16], 'oak_int')
      }
    }
  }
}
function trolley(m: ModelBuilder) {
  m.box('#9c9e8d', [0, 0.27, 0], [1.58, 0.09, 1.16], 'steel')
  for (const x of [-0.62, 0.62])
    for (const z of [-0.43, 0.43]) round(m, [x, 0.13, z], [0.23, 0.09, 0.23], dark, [0, 0, Math.PI / 2])
  for (const x of [-0.69, 0.69]) m.box(inox, [x, 0.69, -0.48], [0.043, 0.79, 0.043], 'steel')
  m.box(dark, [0, 1.08, -0.48], [1.42, 0.07, 0.07], 'steel')
  m.box('#9e967b', [-0.25, 0.52, 0.02], [0.76, 0.41, 0.73], 'oak_int')
  book(m, -0.26, 0.725, 0)
}
function recycler(m: ModelBuilder) {
  for (const x of [-0.91, 0.91])
    for (const z of [-0.8, 0.8]) m.box(dark, [x, 0.39, z], [0.18, 0.78, 0.18], 'steel')
  m.box('#879588', [0, 1.06, 0.12], [2.25, 0.87, 1.76], 'steel')
  const lip = 1.24,
    throat = 0.77
  for (const s of [-1, 1]) {
    m.beam([s * throat, 1.43, 0.12], [s * lip, 2.16, 0.12], 0.1, 2.07, bronze)
    m.box(yellow, [0, 1.815, 0.12 + s * 0.987], [2.38, 0.8, 0.09], 'steel', [s * 0.16, 0, 0])
    m.box(inox, [s * lip, 2.18, 0.12], [0.11, 0.09, 2.18], 'steel')
  }
  for (const x of [-0.38, 0.38]) {
    round(m, [x, 1.49, 0.12], [0.38, 1.6, 0.38], dark, [Math.PI / 2, 0, 0])
    for (let i = 0; i < 8; i++)
      round(m, [x, 1.5, -0.59 + i * 0.2], [0.47, 0.055, 0.47], inox, [Math.PI / 2, 0, 0])
  }
  m.box(dark, [0, 0.57, -0.62], [1.27, 0.22, 1.18], 'steel', [0.14, 0, 0])
}
function mill(m: ModelBuilder) {
  m.box(dark, [0, 0.17, 0], [3.03, 0.34, 2.65], 'steel')
  m.box('#98a89f', [0, 0.58, 0], [3.08, 0.53, 2.64], 'steel')
  m.box(enamel, [0, 1.6, 1.13], [3.02, 1.51, 0.22], 'steel')
  for (const x of [-1.41, 1.41]) m.box(enamel, [x, 1.63, 0], [0.2, 1.56, 2.52], 'steel')
  m.box(enamel, [0, 2.39, 0], [3.05, 0.23, 2.55], 'steel')
  for (const x of [-1.05, 1.05]) {
    m.box(inox, [x, 1.62, -1.21], [0.75, 1.49, 0.12], 'steel')
    for (let k = 0; k < 5; k++) m.box(dark, [x, 0.97 + k * 0.051, -1.28], [0.45, 0.022, 0.016], 'steel')
  }
  m.box('#96aaa2', [0, 1.65, -1.244], [1.3, 1.31, 0.047], 'glass')
  for (const x of [-0.69, 0.69]) m.box(dark, [x, 1.61, -1.265], [0.049, 1.4, 0.045], 'steel')
  round(m, [0, 0.96, 0], [1.13, 0.19, 1.13], dark)
  round(m, [0, 1.11, 0], [0.96, 0.11, 0.96], inox)
  m.box('#8c8c78', [0.03, 1.26, 0], [0.41, 0.22, 0.31], 'steel', [0, 0.28, 0])
  m.box(enamel, [0, 2.02, 0.08], [0.37, 0.54, 0.45], 'steel')
  round(m, [0, 1.66, 0.06], [0.18, 0.25, 0.18], inox)
  m.box('#e7dcb9', [0, 2.24, -0.38], [1.28, 0.03, 0.11], 'lamp')
  m.box(dark, [1.12, 1.66, -1.32], [0.56, 0.77, 0.09], 'steel')
  m.box('#8aa7a0', [1.12, 1.77, -1.373], [0.45, 0.24, 0.01], 'lamp')
  for (let i = 0; i < 4; i++)
    m.box(i === 3 ? '#b36e57' : inox, [0.95 + i * 0.108, 1.42, -1.374], [0.043, 0.041, 0.012], 'steel')
}
function printer(m: ModelBuilder) {
  const w = 2.69,
    d = 2.33
  m.box(dark, [0, 0.25, 0], [w, 0.5, d], 'steel')
  for (const x of [-1.26, 1.26])
    for (const z of [-1.08, 1.08]) m.box(inox, [x, 1.35, z], [0.11, 1.74, 0.11], 'steel')
  for (const x of [-1.26, 1.26]) m.box('#91ada6', [x, 1.37, 0], [0.04, 1.63, 2.04], 'glass')
  m.box('#c1c8b6', [0, 2.18, 0], [w, 0.16, d], 'steel')
  m.box(enamel, [0, 1.38, 1.11], [2.56, 1.64, 0.08], 'steel')
  m.box(dark, [0, 0.76, 0], [1.65, 0.12, 1.63], 'steel')
  for (let k = 0; k < 9; k++)
    round(m, [0.1, 0.84 + k * 0.042, 0], [0.64 + k * 0.027, 0.042, 0.64 + k * 0.027], '#aa8366')
  for (const x of [-0.96, 0.96]) m.box(dark, [x, 1.63, 0], [0.069, 0.069, 2.12], 'steel')
  m.box(inox, [0, 1.62, -0.18], [2.01, 0.081, 0.09], 'steel')
  m.box(enamel, [0.17, 1.47, -0.18], [0.24, 0.22, 0.23], 'steel')
  round(m, [0.17, 1.31, -0.18], [0.081, 0.13, 0.081], bronze)
  for (const x of [-0.84, 0.84]) round(m, [x, 1.65, 0.88], [0.49, 0.15, 0.49], bronze, [Math.PI / 2, 0, 0])
  m.box('#a6b8b1', [0, 1.34, -1.102], [2.39, 1.58, 0.04], 'glass')
}
function solder(m: ModelBuilder) {
  top(m, 3.04, 0.88, 1.67, '#ac9674')
  m.box('#658e83', [-0.32, 0.885, -0.13], [1.46, 0.025, 0.83], 'epoxy')
  m.box('#596e52', [-0.2, 0.911, -0.19], [0.38, 0.023, 0.27], 'epoxy')
  for (let i = 0; i < 8; i++)
    m.box(
      dark,
      [-0.32 + (i % 4) * 0.078, 0.931, -0.23 + Math.floor(i / 4) * 0.105],
      [0.044, 0.02, 0.046],
      'epoxy',
    )
  m.box(inox, [0.96, 1.04, 0], [0.49, 0.31, 0.54], 'steel')
  m.box('#566864', [0.96, 1.07, -0.28], [0.31, 0.13, 0.022], 'epoxy')
  m.beam([-0.82, 0.93, 0.48], [-0.84, 1.61, 0.48], 0.052, 0.055, dark)
  m.beam([-0.84, 1.61, 0.48], [-0.43, 1.76, 0.09], 0.046, 0.05, inox)
  m.box(paper, [-0.43, 1.715, 0.08], [0.54, 0.084, 0.21], 'lamp')
  book(m, -1.15, 0.88, 0)
}
function rail(m: ModelBuilder, length: number) {
  const trolley = length * 0.28
  for (const y of [0.167, 0.38]) m.box(bronze, [0, y, 0], [length - 0.07, 0.055, 0.21], 'steel')
  m.box(dark, [0, 0.277, 0], [length - 0.12, 0.19, 0.065], 'steel')
  m.box(yellow, [trolley, 0.16, 0], [0.53, 0.21, 0.3], 'steel')
  m.box(inox, [trolley, 0.054, 0], [0.065, 0.103, 0.07], 'steel')
}

export const upperVisuals: Record<string, (m: ModelBuilder, e: EquipmentUnit) => void> = {
  'TEL': telescope,
  'MET': weatherDesk,
  'MAP': (m) => sampleDesk(m, false),
  'BOT': planter,
  'SOL': coupler,
  'POT': (m) => sampleDesk(m, true),
  'ATV': vehicle,
  'HOI': crane,
  'PLW': plow,
  'AIR': statusPanel,
  'PPE': lockers,
  'locker': lockers,
  'DRY': bootBench,
  'GEO': geology,
  'WTH': windVane,
  'VIS': visitor,
  'GYM': (m) => drawGym(m, 'GYM'),
  'ROW': (m) => drawGym(m, 'ROW'),
  'PHY': (m) => drawGym(m, 'PHY'),
  'DEC': shower,
  'SUM': sump,
  'AGV': robotCart,
  'SCL': scale,
  'UAV': droneDock,
  'INS': fieldGear,
  'RCK': rack,
  'PAL': trolley,
  'REC': recycler,
  'CNC': mill,
  'AMF': printer,
  'PCB': solder,
  'RAI': (m, e) => rail(m, e.moduleSizeM[0]),
}
