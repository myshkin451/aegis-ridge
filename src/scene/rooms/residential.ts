import type { EquipmentUnit, Point3 } from '../../types/shelter'
import type { ModelBuilder } from '../utils/modelBuilder'
import { bedroomFurniture } from '../../data/roomLayouts/residential'
import { doors, leafOffset } from '../../geometry/doors'
import { bedrooms } from '../../geometry/residentialPlan'

const timber = '#a97e5a',
  paleWood = '#c5aa84',
  steel = '#8b9b9a',
  dark = '#424e50'
const paper = '#dbd9c8',
  linen = '#b6c5c0'
const bookColors = ['#ad6552', '#788e89', '#bfab7b', '#5a717b', '#627362', '#aa8e74', '#866d69']

function wheel(m: ModelBuilder, x: number, z: number, y = 0.09) {
  m.part('round', 'epoxy', dark, [x, y, z], [0.135, 0.054, 0.135], [0, 0, Math.PI / 2])
  m.box(steel, [x, y + 0.07, z], [0.055, 0.12, 0.06], 'steel')
}
function round(m: ModelBuilder, p: Point3, size: Point3, color = steel, rot?: Point3) {
  m.part('round', 'steel', color, p, size, rot)
}
function book(m: ModelBuilder, x: number, y: number, z: number, i: number, w = 0.06, h = 0.28, d = 0.22) {
  m.box(bookColors[i % bookColors.length], [x, y + h / 2, z], [w, h, d], 'epoxy')
  m.box(paper, [x, y + h * 0.72, z + d / 2], [w * 0.72, 0.014, 0.004], 'epoxy')
}
function deskLamp(m: ModelBuilder, x: number, y: number, z: number) {
  round(m, [x, y + 0.015, z], [0.17, 0.026, 0.17], dark)
  m.beam([x, y + 0.02, z], [x + 0.1, y + 0.32, z], 0.022, 0.022, steel)
  m.box(dark, [x + 0.15, y + 0.34, z], [0.25, 0.04, 0.105], 'steel')
  m.box('#ffe3ae', [x + 0.15, y + 0.313, z], [0.19, 0.008, 0.085], 'lamp')
}
function chair(m: ModelBuilder, x: number, z: number, dx = 0, dz = 1) {
  m.box(paleWood, [x, 0.45, z], [0.41, 0.055, 0.4], 'wood')
  m.box(timber, [x + dx * 0.185, 0.71, z + dz * 0.18], dx ? [0.048, 0.44, 0.39] : [0.39, 0.44, 0.048], 'wood')
  for (const a of [-0.16, 0.16])
    for (const b of [-0.15, 0.15]) m.box(dark, [x + a, 0.214, z + b], [0.037, 0.428, 0.036], 'steel')
}
function mug(m: ModelBuilder, x: number, y: number, z: number, color: string) {
  round(m, [x, y + 0.065, z], [0.105, 0.13, 0.105], color)
  round(m, [x, y + 0.133, z], [0.08, 0.006, 0.08], '#5c463b')
  for (const dy of [0.04, 0.1]) m.box(color, [x + 0.06, y + dy, z], [0.046, 0.012, 0.015], 'steel')
  m.box(color, [x + 0.083, y + 0.07, z], [0.012, 0.067, 0.015], 'steel')
}

function isolation(m: ModelBuilder) {
  for (const x of [-1.57, 1.57]) {
    m.box('#c9d2ce', [x, 0.43, 0], [0.095, 0.86, 4.23], 'epoxy')
    m.box('#a8c3bd', [x, 1.53, 0], [0.055, 1.3, 4.23], 'glass')
    for (const z of [-2.03, 0, 2.03]) m.box(steel, [x, 1.26, z], [0.09, 2.5, 0.06], 'steel')
    m.box(paper, [x, 2.36, 0], [0.08, 0.32, 4.23], 'epoxy')
  }
  m.box('#b8c7c0', [0, 1.25, -2.06], [3.18, 2.5, 0.095], 'epoxy')
  m.box('#aac2bc', [-0.72, 1.29, 2.06], [1.75, 2.42, 0.045], 'glass')
  for (const x of [-1.57, 0.14, 1.57]) m.box(steel, [x, 1.25, 2.06], [0.06, 2.5, 0.085], 'steel')
  m.box(paper, [0, 2.43, 2.06], [3.15, 0.14, 0.094], 'epoxy')
  round(m, [-1.35, 1.68, 2.1], [0.19, 0.034, 0.19], paper, [Math.PI / 2, 0, 0])
  m.beam([-1.35, 1.68, 2.122], [-1.3, 1.71, 2.122], 0.008, 0.008, dark)
  // Wheeled adjustable bed, siderails and bedside monitoring.
  for (const x of [-0.82, -0.07]) for (const z of [-1.1, 0.57]) wheel(m, x, z)
  m.box(steel, [-0.44, 0.26, -0.23], [0.8, 0.12, 1.8], 'steel')
  m.beam([-0.44, 0.29, -1.0], [-0.44, 0.58, 0.49], 0.1, 0.12, dark)
  m.box(paper, [-0.44, 0.63, -0.23], [0.92, 0.17, 2.1], 'epoxy')
  m.box('#769c9b', [-0.44, 0.735, 0.11], [0.89, 0.05, 1.35], 'epoxy')
  m.box('#e6e8da', [-0.44, 0.77, -0.94], [0.64, 0.12, 0.4], 'epoxy')
  for (const x of [-0.93, 0.05]) {
    for (const z of [-0.6, 0.44]) m.box(steel, [x, 0.76, z], [0.033, 0.34, 0.038], 'steel')
    m.box(steel, [x, 0.93, -0.08], [0.038, 0.034, 1.16], 'steel')
  }
  m.box('#bccdca', [-1.25, 0.48, -0.95], [0.42, 0.85, 0.5], 'epoxy')
  m.box(steel, [-1.25, 1.13, -0.95], [0.044, 0.53, 0.06], 'steel')
  m.box(dark, [-1.25, 1.49, -0.95], [0.46, 0.31, 0.06], 'epoxy')
  for (let j = 0; j < 8; j++) {
    const pulse = [0, 0, 0.015, -0.022, 0.066, -0.028, 0.011, 0, 0]
    m.beam(
      [-1.44 + j * 0.045, 1.48 + pulse[j], -0.915],
      [-1.44 + (j + 1) * 0.045, 1.48 + pulse[j + 1], -0.915],
      0.009,
      0.006,
      '#92bea8',
      'lamp',
    )
  }
}
function lab(m: ModelBuilder) {
  m.box('#767f7e', [0, 0.1, 0], [1.36, 0.2, 3.3], 'steel')
  m.box('#c5d3d0', [0, 0.51, 0], [1.45, 0.71, 3.4], 'epoxy')
  m.box('#d6ded8', [0, 0.9, 0], [1.57, 0.08, 3.54], 'steel')
  for (let z = -1.32; z < 1.42; z += 0.55) {
    m.box('#9aaba7', [-0.74, 0.52, z], [0.027, 0.56, 0.48], 'epoxy')
    m.box(steel, [-0.762, 0.71, z], [0.028, 0.026, 0.17], 'steel')
  }
  m.box(dark, [0.26, 1.13, 0.85], [0.09, 0.4, 0.14], 'steel')
  m.box('#384545', [0.27, 1.53, 0.85], [0.075, 0.59, 0.85], 'epoxy')
  m.box('#92aaa9', [0.226, 1.53, 0.85], [0.009, 0.52, 0.77], 'epoxy')
  m.box('#dbe1d4', [-0.05, 1.14, -0.62], [0.73, 0.4, 0.74], 'epoxy')
  round(m, [-0.05, 1.36, -0.62], [0.38, 0.06, 0.38], dark)
  m.box('#727f79', [-0.26, 0.96, -1.36], [0.45, 0.04, 0.43], 'steel')
  for (let i = 0; i < 6; i++)
    round(m, [-0.4 + (i % 3) * 0.13, 1.085, -1.44 + Math.floor(i / 3) * 0.16], [0.065, 0.2, 0.065], '#aabdb6')
}
function coldCabinet(m: ModelBuilder) {
  m.box('#9aaca9', [0, 0.98, 0], [0.9, 1.86, 0.77], 'steel')
  m.box(dark, [0, 1.1, 0.391], [0.76, 1.47, 0.018], 'epoxy')
  m.box('#a9c0bc', [0, 1.1, 0.407], [0.69, 1.4, 0.014], 'glass')
  for (let i = 0; i < 4; i++) m.box(paper, [0, 0.55 + i * 0.33, 0.402], [0.66, 0.02, 0.024], 'steel')
  m.box(dark, [0.36, 1.13, 0.415], [0.037, 0.47, 0.018], 'steel')
  for (let i = 0; i < 6; i++) m.box(dark, [0, 0.09 + i * 0.032, 0.392], [0.68, 0.012, 0.02], 'steel')
}

function shelves(m: ModelBuilder) {
  m.box('#8a745a', [0, 1.55, -0.325], [10.42, 3.1, 0.09], 'wood')
  for (let i = 0; i < 86; i++) m.box(paleWood, [-5.15 + i * 0.12, 1.62, -0.26], [0.049, 3.22, 0.047], 'wood')
  for (let bay = 0; bay < 8; bay++) {
    const x = -4.51 + bay * 1.29
    m.box(timber, [x - 0.635, 1.45, -0.015], [0.05, 2.9, 0.62], 'wood')
    for (let level = 0; level < 6; level++) {
      const y = 0.16 + level * 0.45
      m.box(paleWood, [x, y, 0], [1.27, 0.045, 0.62], 'wood')
      for (let i = 0; i < ((bay + level) % 4) + 9; i++)
        book(
          m,
          x - 0.53 + i * 0.077,
          y + 0.024,
          0.085,
          i + 2 * bay + level,
          0.061 + ((bay + i) % 3) * 0.006,
          0.28 + ((bay + level + i) % 4) * 0.027,
          0.29,
        )
    }
  }
  m.box(timber, [5.16, 1.45, -0.015], [0.05, 2.9, 0.62], 'wood')
  m.box('#ffd29c', [0, 3.14, -0.19], [10.12, 0.023, 0.044], 'lamp')
}
function studyDesk(m: ModelBuilder, i: number) {
  m.box(paleWood, [0, 0.76, -0.23], [1.32, 0.071, 0.84], 'wood')
  for (const x of [-0.55, 0.55])
    for (const z of [-0.54, 0.11]) m.box(dark, [x, 0.36, z], [0.048, 0.72, 0.05], 'steel')
  chair(m, 0.12, 0.45)
  deskLamp(m, -0.41, 0.798, -0.47)
  m.box(paper, [0.14, 0.811, -0.2], [0.4, 0.023, 0.26], 'epoxy', [0, 0.12 * i, 0])
  m.box(bookColors[i], [0.29, 0.836, -0.2], [0.011, 0.01, 0.22], 'epoxy')
}
function cart(m: ModelBuilder) {
  for (const x of [-0.34, 0.34])
    for (const z of [-0.22, 0.22]) {
      wheel(m, x, z)
      m.box(steel, [x, 0.55, z], [0.031, 0.76, 0.031], 'steel')
    }
  for (const y of [0.23, 0.62]) {
    m.box(paleWood, [0, y, 0], [0.81, 0.045, 0.54], 'wood')
    for (let i = 0; i < 6; i++) book(m, -0.31 + i * 0.069, y + 0.024, 0.035, i + 3, 0.058, 0.24, 0.21)
  }
  m.box(dark, [0.34, 0.955, 0], [0.053, 0.043, 0.5], 'steel')
}
function consoleDesk(m: ModelBuilder) {
  const radius = 6.4,
    count = 7
  for (let i = 0; i < count; i++) {
    const a = (i - 3) * 0.139
    const locate = (x: number, y: number, z: number): Point3 => [
      (radius - z) * Math.sin(a) + x * Math.cos(a),
      y,
      5.75 - (radius - z) * Math.cos(a) + x * Math.sin(a),
    ]
    const box = (
      color: string,
      p: Point3,
      size: Point3,
      mat: 'steel' | 'epoxy' | 'lamp' | 'wood' = 'epoxy',
    ) => m.box(color, locate(p[0] * 0.84, p[1], p[2]), [size[0] * 0.84, size[1], size[2]], mat, [0, -a, 0])
    box(dark, [0, 0.44, 0], [0.88, 0.83, 0.61], 'steel')
    box('#a9b1ac', [0, 0.91, 0.09], [1.02, 0.11, 0.88])
    box(steel, [0, 1.24, -0.2], [0.065, 0.6, 0.085], 'steel')
    box('#323d40', [0, 1.6, -0.24], [1, 0.68, 0.061])
    box('#425e62', [0, 1.6, -0.2], [0.93, 0.6, 0.012])
    for (let j = 0; j < 9; j++) {
      const h = 0.09 + 0.19 * (0.5 + 0.5 * Math.sin(j * 1.32 + i * 0.62))
      box(j > 6 ? '#cda878' : '#9abbb1', [-0.37 + j * 0.09, 1.4 + h / 2, -0.19], [0.058, h, 0.007])
    }
    box('#9baea7', [0, 1.82, -0.19], [0.7, 0.014, 0.009])
    box('#535f5e', [0, 0.982, 0.23], [0.59, 0.026, 0.2])
  }
  for (const x of [-2.12, 0, 2.12]) chair(m, x, 0.95)
}
function serverRack(m: ModelBuilder, i: number) {
  m.box(dark, [0, 1.08, 0], [0.8, 2.1, 1.12], 'steel')
  const face = 0.567
  for (const x of [-0.37, 0.37]) m.box(steel, [x, 1.09, face], [0.037, 2.01, 0.027], 'steel')
  for (let j = 0; j < 13; j++) {
    const y = 0.24 + j * 0.138
    m.box(j % 4 === 0 ? '#7b8682' : '#606c6a', [0, y, face], [0.68, 0.113, 0.027], 'grate')
    m.box(j === i + 1 ? '#d2a879' : '#92b19b', [-0.25, y, face + 0.018], [0.024, 0.021, 0.006], 'lamp')
    m.box(dark, [0.21, y, face + 0.021], [0.15, 0.026, 0.016], 'steel')
  }
  m.box(paper, [0, 2.03, face], [0.31, 0.068, 0.02], 'epoxy')
}

function atriumGlass(m: ModelBuilder, eq: EquipmentUnit) {
  const [width, , depth] = eq.moduleSizeM
  // Two-by-three panes meet on narrow laminated-steel bearing strips.
  for (let col = 0; col < 2; col++)
    for (let row = 0; row < 3; row++)
      m.box(
        '#c6e0da',
        [(-0.25 + col * 0.5) * width, 0.033, ((-1 + row) * depth) / 3],
        [width / 2 - 0.045, 0.057, depth / 3 - 0.045],
        'glass',
      )
  for (let i = 0; i <= 2; i++)
    m.box(steel, [((i - 1) * (width - 0.055)) / 2, 0.028, 0], [0.055, 0.056, depth], 'steel')
  for (let i = 0; i <= 3; i++)
    m.box(steel, [0, 0.028, (i / 3 - 0.5) * (depth - 0.055)], [width, 0.056, 0.055], 'steel')
  for (const x of [-width / 2 + 0.11, width / 2 - 0.11])
    for (const z of [-depth / 2 + 0.11, depth / 2 - 0.11])
      round(m, [x, 0.062, z], [0.045, 0.006, 0.045], dark)
}
function dining(m: ModelBuilder) {
  for (const z of [-1.52, 0, 1.52]) {
    m.box(dark, [0, 0.36, z], [0.19, 0.7, 0.16], 'steel')
    m.box(dark, [0, 0.04, z], [1.16, 0.08, 0.23], 'steel')
  }
  for (let i = 0; i < 7; i++)
    m.box(i % 2 ? paleWood : '#c1a07a', [(i - 3) * 0.173, 0.754, 0], [0.168, 0.082, 4.46], 'wood')
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) chair(m, side * 1.02, -1.74 + i * 0.87, side, 0)
  // A game paused over lunch, two cups left opposite one another.
  for (let x = 0; x < 8; x++)
    for (let z = 0; z < 8; z++)
      m.box(
        (x + z) % 2 ? timber : paper,
        [(x - 3.5) * 0.061, 0.8, 1.05 + (z - 3.5) * 0.061],
        [0.061, 0.009, 0.061],
        'wood',
      )
  for (const [x, z, color] of [
    [0, 0, 0],
    [2, 1, 0],
    [4, 3, 0],
    [6, 1, 0],
    [2, 6, 1],
    [3, 5, 1],
    [5, 4, 1],
    [7, 6, 1],
  ])
    m.part(
      'cone',
      'wood',
      color ? '#e2cfa5' : '#584b3b',
      [(x - 3.5) * 0.061, 0.832, 1.05 + (z - 3.5) * 0.061],
      [0.043, 0.056, 0.043],
    )
  mug(m, -0.44, 0.795, 0.86, '#6c9292')
  mug(m, 0.39, 0.795, 1.43, '#a36c54')
  for (const z of [-1.65, -0.7])
    for (const x of [-0.38, 0.38]) round(m, [x, 0.803, z], [0.23, 0.011, 0.23], paper)
}
function kitchen(m: ModelBuilder) {
  // Along the east service wall. Drawer fronts face the dining table to the west.
  for (let i = 0; i < 4; i++) {
    const z = (i - 1.5) * 0.84
    m.box(i % 3 ? '#a7b7a8' : '#91a39a', [0, 0.46, z], [0.65, 0.83, 0.815], 'epoxy')
    m.box(dark, [-0.338, 0.72, z], [0.022, 0.031, 0.32], 'steel')
  }
  m.box('#cfcdc0', [0, 0.92, 0], [0.74, 0.085, 3.46], 'stone')
  m.box(dark, [0, 0.977, -0.83], [0.59, 0.022, 1.47], 'epoxy')
  for (const z of [-1.16, -0.52]) round(m, [0, 1, z], [0.43, 0.026, 0.43], steel)
  m.box(steel, [0, 0.978, 0.86], [0.59, 0.024, 0.79], 'steel')
  m.box(dark, [0, 0.994, 0.86], [0.45, 0.016, 0.64], 'epoxy')
  m.beam([0.29, 0.98, 0.92], [0.29, 1.27, 0.92], 0.035, 0.035, steel)
  m.beam([0.29, 1.27, 0.92], [0.06, 1.27, 0.92], 0.035, 0.035, steel)
  for (const z of [-1.5, -0.16]) m.box(steel, [0.31, 1.26, z], [0.033, 0.56, 0.037], 'steel')
  m.box('#c4c7bf', [0.035, 1.58, -0.83], [0.65, 0.13, 1.57], 'steel')
}
function optic(m: ModelBuilder) {
  round(m, [0, 0.07, 0], [0.65, 0.13, 0.65], dark)
  round(m, [0, 1.77, -0.09], [0.235, 3.38, 0.235], steel)
  for (const y of [0.27, 1.32, 2.82]) round(m, [0, y, -0.09], [0.31, 0.069, 0.31], dark)
  round(m, [0, 1.52, 0.1], [0.17, 0.39, 0.17], steel, [Math.PI / 2, 0, 0])
  round(m, [0, 1.52, 0.32], [0.18, 0.065, 0.18], dark, [Math.PI / 2, 0, 0])
  m.box(steel, [0, 3.23, 0.01], [0.39, 0.33, 0.46], 'steel')
  m.box('#93aaa9', [0, 3.23, 0.25], [0.31, 0.21, 0.021], 'glass')
}
function strength(m: ModelBuilder) {
  for (const x of [-0.8, 0.8]) {
    m.box(dark, [x, 0.055, 0], [0.17, 0.11, 1.63], 'steel')
    for (const z of [-0.69, 0.69]) {
      m.box(steel, [x, 1.22, z], [0.09, 2.41, 0.09], 'steel')
      for (let i = 0; i < 13; i++)
        m.box(dark, [x, 0.62 + i * 0.103, z + 0.046], [0.03, 0.026, 0.004], 'epoxy')
    }
    m.box(dark, [x, 2.32, 0], [0.09, 0.085, 1.46], 'steel')
  }
  m.box(dark, [0, 2.35, -0.69], [1.71, 0.085, 0.11], 'steel')
  round(m, [0, 1.23, 0.5], [0.041, 2.15, 0.041], steel, [0, 0, Math.PI / 2])
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++)
      round(m, [side * (0.87 + 0.055 * i), 1.23, 0.5], [0.42, 0.051, 0.42], i === 1 ? '#647775' : dark, [
        0,
        0,
        Math.PI / 2,
      ])
  m.box('#7b8980', [0, 0.54, 0], [0.38, 0.15, 1.34], 'epoxy')
  for (const z of [-0.42, 0.46]) m.box(steel, [0, 0.23, z], [0.08, 0.46, 0.11], 'steel')
}
function rower(m: ModelBuilder) {
  for (const z of [-0.92, 1.13]) m.box(dark, [0, 0.08, z], [0.77, 0.11, 0.14], 'steel')
  m.beam([0, 0.36, -0.65], [0, 0.16, 1.12], 0.09, 0.12, steel)
  m.box('#657775', [0, 0.36, 0.3], [0.35, 0.11, 0.37], 'epoxy')
  round(m, [0, 0.45, -0.89], [0.68, 0.28, 0.68], dark, [0, 0, Math.PI / 2])
  for (const x of [-0.15, 0.15]) round(m, [x, 0.45, -0.89], [0.52, 0.026, 0.52], steel, [0, 0, Math.PI / 2])
  for (const x of [-0.17, 0.17])
    m.box('#515d59', [x, 0.28, -0.44], [0.18, 0.06, 0.37], 'epoxy', [-0.39, 0, 0])
  m.beam([0, 0.69, -0.92], [0, 1.05, -0.74], 0.032, 0.034, steel)
  m.box(dark, [0, 1.1, -0.74], [0.25, 0.15, 0.05], 'epoxy')
}
function therapy(m: ModelBuilder) {
  m.box(dark, [-0.7, 1.05, 0], [0.1, 1.98, 1.84], 'steel')
  for (let i = 0; i < 10; i++)
    m.box(i % 3 === 0 ? '#fff4dc' : '#e9eadd', [-0.64, 1.16, (i - 4.5) * 0.17], [0.035, 1.32, 0.13], 'lamp')
  m.box(linen, [0.27, 0.52, 0.26], [0.71, 0.14, 1.17], 'epoxy')
  m.box(linen, [0.27, 0.79, -0.53], [0.71, 0.13, 0.66], 'epoxy', [0.58, 0, 0])
  for (const z of [-0.67, 0.69]) m.box(dark, [0.27, 0.23, z], [0.42, 0.45, 0.09], 'steel')
  m.box(paper, [0.27, 0.98, -0.68], [0.49, 0.11, 0.27], 'epoxy', [0.58, 0, 0])
}

// Door numbers reuse the floor's box/steel and box/epoxy instance batches.
const digitSegments = [
  'abcdef',
  'bc',
  'abdeg',
  'abcdg',
  'bcfg',
  'acdfg',
  'acdefg',
  'abc',
  'abcdefg',
  'abcdfg',
]
const segments: [string, number, number, boolean][] = [
  ['a', 0, 0.06, true],
  ['b', 0.032, 0.03, false],
  ['c', 0.032, -0.03, false],
  ['d', 0, -0.06, true],
  ['e', -0.032, -0.03, false],
  ['f', -0.032, 0.03, false],
  ['g', 0, 0, true],
]
export function bedroomNumbers(m: ModelBuilder) {
  for (const [i, bedroom] of bedrooms.entries()) {
    const door = doors.find((d) => d.id === bedroom.id)!
    const [x, , z] = door.base
    // Outward normal toward the reader. Its perpendicular is the reader's left-to-right axis.
    const nx = bedroom.onCall ? -1 : 0,
      nz = bedroom.onCall ? 0 : bedroom.z0 === 0 ? 1 : -1
    const along = leafOffset(door, 1, 1) + door.width / 4 + 0.21
    function mark(dx: number, dy: number, depth: number, w: number, h: number, t: number, plate: boolean) {
      const center: Point3 = [
        x + nz * (along + dx) + nx * depth,
        1.55 + dy,
        z - nx * (along + dx) + nz * depth,
      ]
      m.box(
        plate ? dark : paper,
        center,
        door.axis === 'x' ? [w, h, t] : [t, h, w],
        plate ? 'steel' : 'epoxy',
      )
    }
    mark(0, 0, 0.082, 0.31, 0.22, 0.014, true)
    for (const [j, digit] of [...String(i + 1).padStart(2, '0')].entries())
      for (const [name, dx, dy, flat] of segments)
        if (digitSegments[Number(digit)].includes(name))
          mark((j - 0.5) * 0.1 + dx, dy, 0.091, flat ? 0.061 : 0.009, flat ? 0.009 : 0.053, 0.004, false)
  }
}

function sleepFitout(m: ModelBuilder, e: EquipmentUnit, i: number) {
  const b = bedrooms.find((room) => room.id === e.sleepingRoomId)!
  const { beds, desk } = bedroomFurniture(b)
  const towardHall = b.z0 === 0 ? 1 : -1
  const tone = bookColors[i % bookColors.length]
  for (const { x, z, tiers } of beds) {
    for (let tier = 0; tier < tiers; tier++) {
      const y = 0.38 + tier * 1.05
      m.box(timber, [x, y, z], [0.94, 0.12, 2.02], 'wood')
      m.box(paper, [x, y + 0.115, z], [0.91, 0.12, 1.98], 'epoxy')
      m.box(tone, [x, y + 0.19, z + towardHall * 0.27], [0.9, 0.045, 1.39], 'epoxy')
      m.box(linen, [x, y + 0.21, z - towardHall * 0.71], [0.61, 0.105, 0.41], 'epoxy')
    }
    for (const dx of [-0.43, 0.43])
      for (const dz of [-0.95, 0.95]) {
        const h = tiers === 2 ? 1.96 : 0.45
        m.box(timber, [x + dx, h / 2, z + dz], [0.045, h, 0.045], 'wood')
      }
    if (tiers === 2) {
      m.box(steel, [x - 0.43, 1.9, z - 0.2], [0.035, 0.045, 1.43], 'steel')
      for (let k = 1; k <= 5; k++) m.box(steel, [x - 0.43, k * 0.27, z + 0.72], [0.04, 0.035, 0.42], 'steel')
    }
  }
  m.box(paleWood, [desk.x, 0.77, desk.z], [0.91, 0.075, 0.55], 'wood')
  for (const dx of [-0.39, 0.39]) m.box(timber, [desk.x + dx, 0.37, desk.z], [0.055, 0.73, 0.47], 'wood')
  deskLamp(m, desk.x - 0.33, 0.81, desk.z)
  for (let j = 0; j < 3 + (i % 3); j++) book(m, desk.x + 0.01 + j * 0.071, 0.81, desk.z, i + j)
  // A different recessed sky panel for each bedroom, on its exterior-side wall.
  const back = -towardHall * 2.38
  m.box(timber, [0, 1.78, back], [1.42, 0.76, 0.04], 'wood')
  m.box(i % 2 ? '#b3c8ce' : '#abc2ba', [0, 1.78, back + towardHall * 0.025], [1.34, 0.67, 0.009], 'lamp')
}

function livingRoom(m: ModelBuilder, type: string) {
  if (type === 'SOF') {
    m.box(timber, [0, 0.13, 0.54], [3.78, 0.25, 0.94], 'wood')
    for (let i = 0; i < 4; i++) m.box(linen, [-1.43 + i * 0.95, 0.38, 0.53], [0.93, 0.25, 0.94], 'epoxy')
    m.box(linen, [0, 0.62, 0.95], [3.8, 0.47, 0.17], 'epoxy')
    m.box(linen, [-1.42, 0.29, -0.5], [0.95, 0.52, 1.08], 'epoxy')
    m.box(linen, [-1.82, 0.47, -0.5], [0.14, 0.4, 1.08], 'epoxy')
  } else {
    m.box(timber, [0, 0.33, 0], [0.63, 0.63, 2.5], 'wood')
    m.box(dark, [0.18, 1.17, 0], [0.08, 1.15, 2.17], 'epoxy')
    m.box('#4d6269', [0.134, 1.17, 0], [0.009, 1.07, 2.09], 'epoxy')
  }
}

function sanitary(m: ModelBuilder, type: string) {
  if (type === 'WC') {
    m.box(paper, [0, 0.48, 0.33], [0.55, 0.95, 0.2], 'epoxy')
    round(m, [0, 0.22, -0.07], [0.53, 0.41, 0.62], paper)
    round(m, [0, 0.43, -0.09], [0.62, 0.055, 0.72], linen)
    round(m, [0, 0.462, -0.09], [0.42, 0.012, 0.48], '#718583')
    m.box(steel, [0, 0.81, 0.218], [0.17, 0.062, 0.013], 'steel')
  } else if (type === 'BAS') {
    m.box(paper, [0, 0.76, 0], [0.71, 0.23, 0.59], 'epoxy')
    round(m, [0, 0.88, 0], [0.46, 0.013, 0.35], '#a3b6b1')
    m.beam([0.27, 0.88, 0.1], [0.27, 1.07, 0.1], 0.032, 0.032, steel)
    m.beam([0.27, 1.07, 0.1], [0.06, 1.07, 0.1], 0.032, 0.032, steel)
  } else if (type === 'SH') {
    m.box('#bcc6c1', [0, 0.023, 0], [1.44, 0.045, 1.77], 'epoxy')
    for (const z of [-0.86, 0.86]) m.box(linen, [0, 1.1, z], [1.43, 2.2, 0.045], 'epoxy')
    m.box(linen, [-0.69, 1.1, 0], [0.06, 2.2, 1.76], 'epoxy')
    for (let i = 0; i < 8; i++)
      m.box(paper, [0.65 - (i % 2) * 0.025, 1, -0.78 + i * 0.055], [0.035, 1.86, 0.072], 'epoxy')
    m.beam([-0.64, 0.87, 0], [-0.64, 2.02, 0], 0.031, 0.031, steel)
    m.box(steel, [-0.53, 2.04, 0], [0.25, 0.045, 0.18], 'steel')
    round(m, [-0.34, 0.049, 0.34], [0.15, 0.008, 0.15], dark)
  } else {
    for (const x of [-0.57, 0.57]) {
      m.box(paper, [x, 0.5, 0], [1.07, 0.98, 1.01], 'epoxy')
      round(m, [x, 0.51, -0.517], [0.62, 0.04, 0.62], dark, [Math.PI / 2, 0, 0])
      round(m, [x, 0.51, -0.544], [0.49, 0.015, 0.49], steel, [Math.PI / 2, 0, 0])
      m.box(dark, [x + 0.21, 0.89, -0.512], [0.25, 0.078, 0.018], 'epoxy')
    }
  }
}

export function drawGym(m: ModelBuilder, type: string) {
  if (type === 'GYM') strength(m)
  else if (type === 'ROW') rower(m)
  else therapy(m)
}

export function drawResidential(m: ModelBuilder, e: EquipmentUnit) {
  const [type, serial] = e.tagCode.split('-'),
    i = Number(serial) - 201
  switch (type) {
    case 'ISO':
      return isolation(m)
    case 'LAB':
      return lab(m)
    case 'REF':
      return coldCabinet(m)
    case 'LIB':
      return shelves(m)
    case 'DES':
      return studyDesk(m, i)
    case 'CRT':
      return cart(m)
    case 'HMI':
      return consoleDesk(m)
    case 'IT':
      return serverRack(m, i)
    case 'GL':
      return atriumGlass(m, e)
    case 'DIN':
      return dining(m)
    case 'KIT':
      return kitchen(m)
    case 'FO':
      round(m, [0, 0.21, 0], [0.41, 0.15, 0.41], steel)
      round(m, [0, 0.11, 0], [0.32, 0.08, 0.32], dark)
      m.part('round', 'glass', '#e3dcb9', [0, 0.059, 0], [0.24, 0.053, 0.24])
      return
    case 'OPT':
      return optic(m)
    case 'SOF':
    case 'AV':
      return livingRoom(m, type)
    case 'WC':
    case 'BAS':
    case 'SH':
    case 'WM':
      return sanitary(m, type)
    case 'CAB':
      return sleepFitout(m, e, i)
    default:
      throw new Error('Unknown residential unit ' + e.tagCode)
  }
}
