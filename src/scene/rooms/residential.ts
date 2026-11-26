import type { EquipmentUnit, Point3 } from '../../types/shelter'
import type { ModelBuilder } from '../utils/modelBuilder'
import { cabinDepth, cabinWidth } from '../../data/roomLayouts/residential'

const timber = '#a97e5a',
  paleWood = '#c5aa84',
  steel = '#8b9b9a',
  dark = '#424e50'
const paper = '#dbd9c8',
  linen = '#b6c5c0',
  green = '#819576'
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
    const a = (i - 3) * 0.167
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
    ) => m.box(color, locate(...p), size, mat, [0, -a, 0])
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
  m.box('#717c79', [0, 0.105, 0], [6.72, 0.21, 0.87], 'steel')
  for (let i = 0; i < 8; i++) {
    const x = -2.94 + i * 0.84
    m.box(i % 3 === 0 ? '#91a39a' : '#a7b7a8', [x, 0.52, 0], [0.822, 0.72, 0.88], 'epoxy')
    m.box(dark, [x, 0.72, -0.455], [0.32, 0.031, 0.023], 'steel')
  }
  m.box('#cfcdc0', [0, 0.92, 0], [6.86, 0.085, 1.03], 'stone')
  m.box(dark, [-1.75, 0.977, 0], [1.47, 0.022, 0.73], 'epoxy')
  for (const x of [-2.08, -1.44]) {
    round(m, [x, 1.0, 0], [0.42, 0.026, 0.42], steel)
    round(m, [x, 1.018, 0], [0.34, 0.01, 0.34], dark)
  }
  m.box(steel, [1.48, 0.978, 0], [0.79, 0.024, 0.62], 'steel')
  m.box(dark, [1.48, 0.994, 0], [0.64, 0.016, 0.46], 'epoxy')
  m.beam([1.82, 0.98, 0.33], [1.82, 1.29, 0.33], 0.035, 0.034, steel)
  m.beam([1.82, 1.29, 0.33], [1.55, 1.29, 0.33], 0.035, 0.034, steel)
  for (const x of [-2.41, -1.07]) m.box(steel, [x, 1.26, 0.47], [0.033, 0.56, 0.037], 'steel')
  m.box('#c4c7bf', [-1.75, 1.58, 0.06], [1.57, 0.13, 0.83], 'steel')
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

// Segment lettering in the same instance batch as the furniture also remains crisp at close range.
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
function roomNumber(m: ModelBuilder, n: number, side: number, x: number, y: number, z: number) {
  const digits = String(n).padStart(2, '0')
  const segments: [string, number, number, boolean][] = [
    ['a', 0, 0.06, true],
    ['b', 0.032, 0.03, false],
    ['c', 0.032, -0.03, false],
    ['d', 0, -0.06, true],
    ['e', -0.032, -0.03, false],
    ['f', -0.032, 0.03, false],
    ['g', 0, 0, true],
  ]
  for (let j = 0; j < 2; j++)
    for (const [s, dx, dy, flat] of segments)
      if (digitSegments[Number(digits[j])].includes(s))
        m.box(
          paper,
          [x + side * ((j - 0.5) * 0.1 + dx), y + dy, z],
          [flat ? 0.061 : 0.009, flat ? 0.009 : 0.053, 0.005],
          'epoxy',
        )
}
function cabinFitout(m: ModelBuilder, i: number) {
  const side = i < 5 ? 1 : -1,
    front = side * (cabinDepth / 2 - 0.075),
    back = -front,
    tone = bookColors[i % bookColors.length]
  for (const x of [-1.12, 1.12]) m.box('#a39b8c', [x, 1.275, 0], [0.08, 2.55, cabinDepth], 'wood')
  m.box('#b7b5a5', [0, 1.275, back], [2.16, 2.55, 0.09], 'epoxy')
  m.box('#a6a99d', [-0.54, 1.275, front], [1.08, 2.55, 0.09], 'epoxy')
  m.box(paleWood, [0.54, 2.36, front], [1.08, 0.38, 0.09], 'wood')
  m.box(timber, [0.015, 1.085, front], [0.037, 2.17, 0.11], 'wood')
  m.box(dark, [-0.3, 1.56, front + side * 0.051], [0.31, 0.22, 0.015], 'steel')
  roomNumber(m, i + 1, side, -0.3, 1.56, front + side * 0.063)
  // Fitted daylight panel and diffuser. Each cabin has its own sky hue, bedding and mementos.
  m.box(timber, [0, 1.82, back + side * 0.07], [1.62, 0.79, 0.08], 'wood')
  m.box(i % 2 ? '#b3c8ce' : '#abc2ba', [0, 1.85, back + side * 0.119], [1.49, 0.63, 0.012], 'lamp')
  m.box('#c6c9b9', [0, 1.64, back + side * 0.129], [1.49, 0.18, 0.01], 'epoxy')
  m.box(paleWood, [-0.56, 0.25, -side * 0.44], [0.95, 0.5, 2.04], 'wood')
  m.box(paper, [-0.56, 0.53, -side * 0.44], [0.91, 0.09, 1.98], 'epoxy')
  m.box(tone, [-0.56, 0.589, -side * 0.19], [0.9, 0.038, 1.34], 'epoxy')
  m.box(linen, [-0.56, 0.615, -side * 1.12], [0.61, 0.093, 0.41], 'epoxy')
  m.box(paleWood, [0.58, 0.78, -side * 1.24], [0.93, 0.08, 0.53], 'wood')
  m.box(timber, [0.98, 0.37, -side * 1.24], [0.095, 0.73, 0.46], 'wood')
  for (const z of [-0.68, -0.41]) m.box(timber, [0.42, 0.214, z * side], [0.29, 0.42, 0.041], 'wood')
  m.box(tone, [0.42, 0.455, -side * 0.54], [0.37, 0.06, 0.35], 'epoxy')
  const p = (x: number, y: number, z: number): Point3 => [x, y, -side * z]
  const item = i % 10
  if (item === 1 || item === 8) {
    const guitar = item === 1
    m.part('bud', 'wood', guitar ? '#bc8256' : dark, p(0.68, 1.17, 1.48), [0.36, 0.46, 0.084])
    if (guitar) m.part('bud', 'wood', paleWood, p(0.68, 1.35, 1.48), [0.26, 0.27, 0.083])
    round(m, p(0.68, 1.26, 1.424), [0.09, 0.014, 0.09], dark, [Math.PI / 2, 0, 0])
    m.box(dark, p(0.68, 1.61, 1.46), [0.047, 0.44, 0.04], 'wood')
    m.box(timber, p(0.68, 1.84, 1.46), [0.081, 0.1, 0.05], 'wood')
  } else if (item === 2 || item === 3) {
    round(m, p(0.48, 0.91, 1.24), [0.21, 0.17, 0.21], '#b78e70')
    for (let leaf = 0; leaf < 7; leaf++) {
      const a = leaf * 0.9
      m.part(
        'leaf',
        'foliage',
        leaf % 2 ? green : '#678769',
        p(0.48 + 0.07 * Math.sin(a), 1.06 + 0.011 * leaf, 1.24 + 0.07 * Math.cos(a)),
        [0.13, 0.23, 0.28],
        [0.35, a, 0],
      )
    }
    if (item === 3) {
      m.box(paleWood, p(-0.65, 1.17, 1.61), [0.4, 0.36, 0.024], 'wood')
      m.part('leaf', 'foliage', green, p(-0.65, 1.17, 1.58), [0.15, 0.02, 0.29], [Math.PI / 2, 0, 0])
    }
  } else if (item === 5 || item === 9) {
    for (let j = 0; j < 3; j++) {
      const x = 0.36 + j * 0.205
      m.box(timber, p(x, 1.22, 1.61), [0.19, 0.23, 0.033], 'wood')
      m.box(bookColors[(i + j) % 7], p(x, 1.22, 1.59), [0.15, 0.19, 0.011], 'epoxy')
    }
    round(m, p(0.44, 0.86, 1.2), [0.12, 0.075, 0.12], dark)
    if (item === 9) m.box(paper, p(0.69, 0.831, 1.15), [0.42, 0.02, 0.27], 'epoxy')
  } else if (item === 7) {
    for (let j = 0; j < 3; j++)
      mug(m, 0.32 + j * 0.22, 0.822, -side * (1.16 + (j % 2) * 0.12), bookColors[j + 3])
  } else {
    const count = item === 6 ? 8 : 4
    for (let j = 0; j < count; j++)
      book(m, 0.23 + j * 0.07, 0.821, -side * 1.36, j + i, 0.058, 0.18 + (j % 3) * 0.022, 0.16)
    if (item === 4) m.box(paper, p(0.69, 0.839, 1.14), [0.3, 0.021, 0.22], 'epoxy', [0, 0.16, 0])
    else mug(m, 0.78, 0.821, -side * 1.09, tone)
  }
  m.box('#fff1d3', [-cabinWidth / 2 + 0.08, 1.15, -side * 0.37], [0.025, 0.032, 1.13], 'lamp')
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
    case 'RCK':
      return strength(m)
    case 'ROW':
      return rower(m)
    case 'PHY':
      return therapy(m)
    case 'CAB':
      return cabinFitout(m, i)
    default:
      throw new Error('Unknown residential unit ' + e.tagCode)
  }
}
