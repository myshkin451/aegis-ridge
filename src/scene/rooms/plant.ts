import type { EquipmentUnit, Point3 } from '../../types/shelter'
import { randomSource } from '../../geometry/random'
import type { ModelBuilder } from '../utils/modelBuilder'
import type { Finish } from '../materials/pbrLibrary'

const steel = '#a6b2af',
  dark = '#435356',
  pale = '#d5d8cd',
  enamel = '#69868a'
const plumWhite = '#ffe0ee',
  amber = '#cc9352',
  blue = '#7eaaa9'
const across: Point3 = [0, 0, Math.PI / 2],
  forward: Point3 = [Math.PI / 2, 0, 0]

function drum(
  m: ModelBuilder,
  x: number,
  y: number,
  z: number,
  diameter: number,
  length: number,
  tint: string,
  rotation?: Point3,
  finish: Finish = 'steel',
) {
  m.part('round', finish, tint, [x, y, z], [diameter, length, diameter], rotation)
}

function rack(m: ModelBuilder, w: number, h: number, d: number) {
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      m.box(dark, [x * (w / 2 - 0.066), 0.045, z * (d / 2 - 0.068)], [0.13, 0.09, 0.13], 'steel')
      m.box(steel, [x * (w / 2 - 0.066), h / 2, z * (d / 2 - 0.068)], [0.052, h, 0.052], 'steel')
    }
}

function plinth(m: ModelBuilder, w: number, d: number) {
  for (const x of [-1, 1]) m.box(dark, [x * w * 0.38, 0.095, 0], [w * 0.09, 0.19, d * 0.94], 'steel')
  m.box('#748283', [0, 0.22, 0], [w, 0.12, d], 'steel')
}

function dial(m: ModelBuilder, x: number, y: number, z: number, diameter = 0.18) {
  drum(m, x, y, z, diameter, 0.045, dark, forward)
  drum(m, x, y, z + 0.029, diameter * 0.84, 0.016, '#e6e3cd', forward)
  m.box('#574836', [x - 0.01, y + 0.013, z + 0.041], [0.012, diameter * 0.48, 0.01], 'steel', [0, 0, -0.55])
}

function label(m: ModelBuilder, x: number, y: number, z: number) {
  m.box('#ede5ca', [x, y, z], [0.23, 0.11, 0.014], 'epoxy')
  for (let i = 0; i < 3; i++)
    m.box('#617175', [x - 0.018, y + 0.023 - i * 0.023, z + 0.009], [0.12 - i * 0.025, 0.009, 0.004], 'steel')
}

function logbook(m: ModelBuilder, x: number, y: number, z: number) {
  m.box('#765845', [x, y + 0.014, z], [0.24, 0.028, 0.32], 'oak_int')
  m.box('#e2ddc7', [x, y + 0.034, z + 0.005], [0.218, 0.012, 0.285], 'epoxy')
  for (let row = 0; row < 5; row++)
    m.box('#7c9191', [x, y + 0.041, z - 0.082 + row * 0.035], [0.155, 0.003, 0.006], 'steel')
  m.box(amber, [x + 0.07, y + 0.048, z - 0.005], [0.012, 0.012, 0.166], 'oak_int', [0, 0.12, 0])
}

function ring(m: ModelBuilder, x: number, y: number, z: number, radius: number, width: number, tint: string) {
  const n = 24
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n,
      b = ((i + 1) * 2 * Math.PI) / n
    m.beam(
      [x + radius * Math.cos(a), y, z + radius * Math.sin(a)],
      [x + radius * Math.cos(b), y, z + radius * Math.sin(b)],
      width,
      width,
      tint,
    )
  }
}

function tank(m: ModelBuilder) {
  const diameter = 3.61
  drum(m, 0, 0.1, 0, 3.63, 0.2, dark)
  drum(m, 0, 1.4, 0, diameter, 2.46, '#bbc7c4')
  for (const y of [0.22, 0.99, 1.78, 2.61]) drum(m, 0, y, 0, diameter + 0.028, 0.042, steel)
  drum(m, -0.23, 2.665, -0.16, 0.56, 0.09, dark)
  drum(m, -0.23, 2.724, -0.16, 0.6, 0.062, pale)
  // Side-mounted level gauge, protective rail and graduations.
  for (const z of [-0.14, 0.14]) drum(m, 1.825, 1.38, z, 0.038, 2.03, dark)
  drum(m, 1.82, 1.35, 0, 0.105, 1.85, '#c7e6d8', undefined, 'glass')
  drum(m, 1.82, 0.99, 0, 0.067, 1.13, blue)
  for (let i = 0; i < 9; i++) m.box(pale, [1.85, 0.47 + 0.21 * i, 0.14], [0.046, 0.022, 0.13], 'steel')
  for (const y of [0.34, 2.42]) m.box(dark, [1.81, y, 0], [0.22, 0.09, 0.43], 'steel')
  m.box(pale, [0, 1.44, 1.808], [0.58, 0.25, 0.022], 'epoxy')
  label(m, 0.01, 1.44, 1.826)
}

function waterPlant(m: ModelBuilder) {
  plinth(m, 1.24, 5.48)
  for (const z of [-1.85, -0.82]) {
    drum(m, 0, 1.13, z, 0.84, 1.7, enamel)
    for (const y of [0.44, 1.85]) drum(m, 0, y, z, 0.88, 0.07, steel)
    drum(m, 0, 2.05, z, 0.19, 0.16, dark)
    dial(m, 0.07, 1.51, z + 0.43)
  }
  for (const x of [-0.26, 0.26])
    for (const y of [0.72, 1.15, 1.58]) drum(m, x, y, 1.18, 0.24, 2.12, pale, forward)
  for (const z of [0.24, 2.09]) m.box(dark, [0, 1.17, z], [1.12, 0.09, 0.09], 'steel')
  drum(m, -0.27, 2.06, 0.04, 0.13, 4.8, steel, forward)
  m.box(enamel, [0.12, 1.15, 2.47], [0.86, 1.26, 0.3], 'steel')
  dial(m, 0.12, 1.34, 2.64, 0.23)
  label(m, 0.12, 0.99, 2.64)
}

function grainStation(m: ModelBuilder) {
  plinth(m, 3.2, 1.98)
  for (const x of [-0.78, 0.78]) {
    drum(m, x, 0.73, -0.11, 0.76, 0.9, dark, across)
    m.part('cone', 'steel', pale, [x, 1.37, -0.12], [0.85, 0.86, 0.85], [Math.PI, 0, 0])
    drum(m, x, 1.82, -0.12, 0.88, 0.07, steel)
    m.beam([x, 0.9, 0.15], [x, 0.6, 0.71], 0.24, 0.28, steel)
    m.box('#a1a895', [x, 0.43, 0.62], [0.68, 0.28, 0.44], 'steel')
  }
  label(m, 0.75, 0.75, 0.55)
}

function packer(m: ModelBuilder) {
  plinth(m, 2.76, 1.84)
  m.box('#a4b4b3', [-0.59, 0.97, 0], [1.24, 1.37, 1.58], 'steel')
  drum(m, -0.59, 1.13, 0.82, 0.83, 0.15, dark, forward)
  drum(m, -0.59, 1.13, 0.909, 0.65, 0.035, '#9bc2c6', forward, 'glass')
  m.box(pale, [0.73, 0.88, 0.07], [1.03, 0.13, 1.61], 'steel')
  m.box('#9ab7af', [0.73, 1.0, 0.06], [0.84, 0.15, 0.72], 'glass', [0.12, 0, 0])
  for (const z of [-0.58, 0.64]) m.box(dark, [0.73, 0.55, z], [0.79, 0.51, 0.05], 'steel')
  // Mug left at the packing bench, clear of the sealing lid.
  drum(m, 0.93, 1.034, -0.52, 0.094, 0.16, '#c99874')
  drum(m, 0.93, 1.118, -0.52, 0.071, 0.009, '#56473c')
  dial(m, -0.98, 1.54, 0.8, 0.15)
}

function fermenter(m: ModelBuilder, diameter: number, height: number) {
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      m.box(dark, [x * diameter * 0.23, 0.2, z * diameter * 0.23], [0.095, 0.4, 0.095], 'steel')
  drum(m, 0, height * 0.49, 0, diameter * 0.86, height * 0.7, steel)
  m.part('cone', 'steel', pale, [0, height * 0.865, 0], [diameter * 0.86, height * 0.09, diameter * 0.86])
  drum(m, 0, height * 0.935, 0, diameter * 0.12, height * 0.05, dark)
  for (const y of [0.25, 0.76]) drum(m, 0, height * y, 0, diameter * 0.88, 0.043, dark)
  dial(m, 0, height * 0.65, diameter * 0.435, 0.22)
}

function grainRack(m: ModelBuilder, w: number, h: number, d: number) {
  rack(m, w - 0.12, h - 0.07, d - 0.12)
  for (let j = 0; j < 3; j++) {
    const y = 0.23 + j * 0.78
    m.box(dark, [0, y, 0], [w - 0.08, 0.086, d - 0.08], 'steel')
    for (const x of [-0.79, 0.79])
      for (let i = 0; i < 4; i++) {
        const z = -1.91 + 1.27 * i
        m.box(i % 3 === 1 ? '#b1b5a1' : '#bfaf8f', [x, y + 0.28, z], [1.32, 0.48, 1.02], 'epoxy')
        m.box('#d9d0ae', [x, y + 0.54, z], [1.37, 0.055, 1.055], 'epoxy')
        for (const shift of [-0.42, 0.42])
          m.box('#788781', [x + shift, y + 0.3, z], [0.053, 0.49, 1.03], 'steel')
      }
  }
}

function seedDrawers(m: ModelBuilder) {
  plinth(m, 2.7, 4.0)
  m.box('#829799', [0, 1.06, 0], [2.55, 1.58, 3.95], 'steel')
  for (const x of [-1, 1])
    for (let y = 0; y < 5; y++)
      for (let z = 0; z < 4; z++) {
        const cy = 0.48 + y * 0.295,
          cz = -1.45 + z * 0.97
        m.box(pale, [x * 1.289, cy, cz], [0.038, 0.263, 0.895], 'steel')
        m.box(dark, [x * 1.33, cy + 0.035, cz], [0.052, 0.046, 0.29], 'steel')
        m.box('#d9bf8f', [x * 1.316, cy - 0.06, cz + 0.265], [0.01, 0.05, 0.12], 'epoxy')
      }
  logbook(m, 0.24, 1.858, 1.34)
}

function cooler(m: ModelBuilder) {
  plinth(m, 2.36, 1.14)
  m.box(steel, [0, 0.99, -0.06], [2.18, 1.4, 0.91], 'steel')
  for (const x of [-0.53, 0.53]) {
    drum(m, x, 1.12, 0.42, 0.84, 0.12, dark, forward)
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5
      m.box(
        '#8c9d9d',
        [x + Math.cos(a) * 0.17, 1.12 + Math.sin(a) * 0.17, 0.5],
        [0.3, 0.075, 0.056],
        'steel',
        [0, 0, a + 0.25],
      )
    }
    drum(m, x, 1.12, 0.545, 0.12, 0.035, steel, forward)
  }
}

function growRack(m: ModelBuilder, e: EquipmentUnit, leafy: boolean) {
  const [w, h, d] = e.moduleSizeM,
    rng = randomSource(e.position[0] * 1013)
  const front = -d / 2 + 0.14,
    back = d / 2 - 0.14
  rack(m, w - 0.04, h - 0.03, d - 0.04)
  for (const side of [-1, 1]) {
    m.box(steel, [side * (w / 2 - 0.08), h / 2, 0], [0.052, h - 0.04, 0.06], 'steel')
    m.box('#586e6d', [side * (w / 2 - 0.06), 0.19, 0], [0.055, 0.068, d - 0.19], 'steel')
  }
  for (let level = 0; level < (leafy ? 5 : 2); level++) {
    const y = leafy ? 0.23 + level * 0.525 : 0.34 + level * 1.15
    const lip = leafy ? 0.105 : 0.28,
      canopy = leafy ? 0.14 : 0.27
    m.box('#9ba8a1', [0, y, 0], [w - 0.07, lip, d - 0.13], 'steel')
    m.box(leafy ? '#6b8378' : '#635648', [0, y + lip / 2, 0], [w - 0.24, 0.035, d - 0.28], 'epoxy')
    for (const side of [-1, 1]) {
      m.box(steel, [side * 0.53, y + (leafy ? 0.455 : 1.01), 0], [0.128, 0.043, d - 0.3], 'steel')
      m.box(plumWhite, [side * 0.53, y + (leafy ? 0.426 : 0.98), 0], [0.097, 0.018, d - 0.34], 'lamp')
    }
    // A leaf rosette has a tight heart and broad outer leaves. Tuber rows carry taller, branching crowns.
    const spacing = leafy ? 0.55 : 0.76
    for (let z = front + 0.32; z < back - 0.3; z += spacing)
      for (const x of [-0.41, 0.42]) {
        const cx = x + (rng() - 0.5) * 0.08,
          cz = z + (rng() - 0.5) * 0.09,
          cy = y + lip / 2 + 0.03
        const tint = leafy ? (level % 3 === 2 ? '#985b66' : '#7ea155') : '#658748'
        if (!leafy) m.box('#697e4b', [cx, cy + 0.145, cz], [0.038, 0.29, 0.04], 'steel')
        for (let k = 0; k < (leafy ? 7 : 6); k++) {
          const a = (k * 6.283) / (leafy ? 7 : 6) + rng() * 0.42
          const r = leafy ? 0.088 : 0.105
          m.part(
            'leaf',
            'foliage',
            k % 3 === 1 ? '#9dae64' : tint,
            [cx + Math.sin(a) * r, cy + canopy * (0.4 + rng() * 0.25), cz + Math.cos(a) * r],
            [leafy ? 0.246 : 0.3, leafy ? 0.2 : 0.32, leafy ? 0.35 : 0.44],
            [leafy ? -0.19 : 0.13, a, 0],
          )
        }
        m.part(
          'bud',
          'foliage',
          leafy ? '#a8b975' : '#708c50',
          [cx, cy + canopy * 0.94, cz],
          [leafy ? 0.126 : 0.175, leafy ? 0.13 : 0.14, leafy ? 0.12 : 0.17],
        )
      }
    label(m, -0.44, y, back + 0.085)
  }
  m.box('#d2cbb5', [0, 2.25, front - 0.005], [0.63, 0.17, 0.048], 'epoxy')
  for (let k = 0; k < (leafy ? 5 : 2); k++)
    m.box(leafy ? '#79946d' : amber, [-0.21 + k * 0.085, 2.25, front - 0.036], [0.044, 0.08, 0.019], 'steel')
}

function weighingBench(m: ModelBuilder) {
  rack(m, 2.06, 0.9, 1.1)
  m.box(pale, [0, 0.91, 0], [2.13, 0.06, 1.11], 'steel')
  m.box(dark, [-0.45, 1.0, -0.04], [0.61, 0.12, 0.48], 'epoxy')
  m.box(steel, [-0.45, 1.07, -0.04], [0.51, 0.036, 0.425], 'steel')
  m.box(dark, [-0.45, 1.26, 0.22], [0.065, 0.35, 0.07], 'steel')
  m.box('#809ca0', [-0.45, 1.39, 0.22], [0.26, 0.11, 0.1], 'glass')
  // A sealed writing board occupies the dry outer corner. The pans and sample side stay stainless.
  m.box('#ba946a', [0.65, 0.957, 0.26], [0.76, 0.034, 0.52], 'oak_int')
  logbook(m, 0.61, 0.974, 0.22)
  for (const [x, z] of [
    [0.16, -0.21],
    [0.25, -0.4],
    [0.47, -0.28],
  ])
    m.part('bud', 'epoxy', '#aa8760', [x, 1.0, z], [0.155, 0.115, 0.12])
}

function fishTank(m: ModelBuilder, e: EquipmentUnit) {
  const rng = randomSource(e.position[2] * 830)
  drum(m, 0, 0.105, 0, 3.89, 0.21, dark)
  drum(m, 0, 0.56, 0, 3.99, 0.74, '#668a8d')
  // The wall terminates at the exposed water surface. A recessed liner, fish and a lightly
  // tinted physical glass layer produce a readable pool from both the aisle and overhead.
  drum(m, 0, 0.941, 0, 3.82, 0.02, '#467e84', undefined, 'epoxy')
  for (let i = 0; i < 12; i++) {
    const a = rng() * 6.283,
      r = Math.sqrt(rng()) * 1.37,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r
    m.part('bud', 'epoxy', i % 3 ? '#739a94' : '#b5af87', [x, 0.989, z], [0.11, 0.049, 0.34], [0, a, 0])
    m.part(
      'leaf',
      'foliage',
      '#73978e',
      [x - 0.18 * Math.sin(a), 0.99, z - 0.18 * Math.cos(a)],
      [0.147, 0.035, 0.115],
      [0, a, 0],
    )
  }
  // Broken, interlocking arcs suggest reflected light at the waterline without a new shader.
  for (let k = 0; k < 14; k++) {
    const x = (rng() - 0.5) * 2.04,
      z = (rng() - 0.5) * 2.09,
      r = 0.16 + rng() * 0.24,
      a = rng() * 6.28
    for (let i = 0; i < 6; i++) {
      const u = a + i * 0.31,
        v = u + 0.31
      m.beam(
        [x + r * Math.cos(u), 1.025, z + r * 0.76 * Math.sin(u)],
        [x + r * Math.cos(v), 1.025, z + r * 0.76 * Math.sin(v)],
        0.012,
        0.009,
        '#9bc4bf',
      )
    }
  }
  drum(m, 0, 1.054, 0, 3.83, 0.026, '#88b7b6', undefined, 'glass')
  ring(m, 0, 1.12, 0, 1.975, 0.11, steel)
  for (const a of [0, 1.57, 3.14, 4.71])
    m.box(dark, [1.93 * Math.cos(a), 0.58, 1.93 * Math.sin(a)], [0.095, 0.9, 0.095], 'steel')
  m.box(enamel, [-0.31, 1.22, -1.91], [0.58, 0.18, 0.18], 'steel')
  drum(m, -0.31, 1.09, -1.68, 0.13, 0.3, steel)
}

function mushroomCabin(m: ModelBuilder) {
  rack(m, 3.12, 2.53, 3.5)
  for (const side of [-1, 1]) {
    m.box('#b3c6bc', [side * 1.49, 1.37, 0], [0.045, 2.21, 3.31], 'glass')
    m.box(pale, [side * 1.42, 0.22, 0], [0.16, 0.24, 3.29], 'steel')
  }
  for (let j = 0; j < 3; j++) {
    const y = 0.36 + j * 0.67
    m.box(dark, [0, y, 0], [2.71, 0.085, 3.14], 'steel')
    for (const x of [-0.86, 0, 0.86])
      for (let k = 0; k < 4; k++) {
        const z = -1.1 + k * 0.73
        m.part('bud', 'epoxy', '#ac9575', [x, y + 0.132, z], [0.56, 0.255, 0.49])
        for (const dx of [-0.12, 0.08]) {
          drum(m, x + dx, y + 0.245, z, 0.066, 0.18, pale)
          m.part('bud', 'epoxy', dx > 0 ? '#d5c2a0' : '#bda687', [x + dx, y + 0.343, z], [0.23, 0.105, 0.21])
        }
      }
  }
  m.box('#a6b6ae', [0, 2.56, 0], [3.1, 0.09, 3.34], 'steel')
  drum(m, -0.88, 2.44, 1.44, 0.21, 0.31, enamel, forward)
}

function algaeReactor(m: ModelBuilder) {
  plinth(m, 2.52, 4.28)
  rack(m, 2.4, 2.11, 4.18)
  for (const x of [-0.87, 0.87])
    for (let level = 0; level < 6; level++) {
      const y = 0.53 + level * 0.282,
        z = level % 2 ? 1.79 : -1.79
      drum(m, x, y, 0, 0.19, 3.74, '#8ca65d', forward, 'glass')
      drum(m, x, y, 0, 0.136, 3.72, level % 2 ? '#547855' : '#688e51', forward)
      if (level < 5) drum(m, x, y + 0.14, z, 0.134, 0.32, steel)
    }
  for (const x of [-0.42, 0.42]) m.box(plumWhite, [x, 2.15, 0], [0.06, 0.04, 3.68], 'lamp')
}

function liftPump(m: ModelBuilder) {
  m.box('#818a85', [0, 0.09, 0], [2.95, 0.18, 1.94], 'stone')
  m.box(dark, [-0.54, 0.203, 0], [1.58, 0.045, 1.49], 'grate')
  for (const x of [-0.91, -0.19]) {
    drum(m, x, 0.74, -0.55, 0.061, 1.16, steel)
    m.box(steel, [x, 0.26, -0.55], [0.12, 0.09, 0.13], 'steel')
  }
  drum(m, -0.55, 0.53, -0.18, 0.43, 0.59, enamel)
  drum(m, 0.49, 0.72, -0.16, 0.24, 1.12, steel, across)
  drum(m, 0.96, 1.0, -0.16, 0.23, 0.61, steel)
  drum(m, 0.96, 1.32, -0.16, 0.36, 0.108, amber)
  m.box(dark, [-0.55, 1.36, -0.53], [0.92, 0.105, 0.13], 'steel')
  // A folded absorbent mat rests on the closed half of the cover.
  m.box('#b4b3a5', [0.82, 0.2, 0.49], [0.62, 0.054, 0.39], 'epoxy', [0, 0.09, 0])
  m.box('#ccc8b7', [0.88, 0.24, 0.49], [0.43, 0.04, 0.35], 'epoxy', [0, 0.06, 0])
}

function compactor(m: ModelBuilder) {
  plinth(m, 2.1, 3.57)
  m.box('#748c86', [0, 0.84, 0.51], [1.81, 1.11, 2.13], 'steel')
  for (const x of [-0.83, 0.83]) m.box(dark, [x, 1.42, -0.72], [0.16, 2.24, 0.18], 'steel')
  m.box(dark, [0, 2.4, -0.72], [1.84, 0.16, 0.26], 'steel')
  drum(m, 0, 1.89, -0.72, 0.44, 0.84, steel)
  m.box(amber, [0, 1.41, -0.66], [1.52, 0.18, 1.17], 'steel')
  m.box(pale, [0, 0.94, 1.59], [1.46, 0.73, 0.06], 'steel')
  for (const x of [-0.59, 0.59]) m.box(dark, [x, 0.94, 1.645], [0.055, 0.28, 0.07], 'steel')
  label(m, 0.29, 0.98, 1.635)
}

function manifold(m: ModelBuilder) {
  for (const x of [-2.33, 0, 2.33]) {
    m.box(dark, [x, 1.05, -0.5], [0.13, 2.1, 0.14], 'steel')
    m.box(dark, [x, 0.07, -0.25], [0.33, 0.14, 0.63], 'steel')
  }
  for (const [y, z, tint] of [
    [1.76, -0.14, '#a39c82'],
    [1.28, 0.27, blue],
  ] as const) {
    drum(m, 0, y, z, 0.26, 5.08, tint, across)
    for (let i = 0; i < 7; i++) {
      const x = -2.17 + i * 0.72
      drum(m, x, (y + 0.19) / 2, z, 0.111, y - 0.19, steel)
      drum(m, x, y - 0.24, z + 0.1, 0.16, 0.18, dark, forward)
      drum(m, x, y - 0.24, z + 0.23, 0.24, 0.034, i % 2 ? dark : amber, forward)
    }
    for (const x of [-2.5, 2.5]) drum(m, x, y, z, 0.35, 0.07, steel, across)
  }
  dial(m, -1.75, 1.97, -0.09, 0.23)
  dial(m, 1.72, 1.47, 0.37, 0.22)
  m.box('#d5c8a7', [-0.57, 0.92, 0.43], [0.1, 0.19, 0.015], 'epoxy', [0, 0, -0.16])
}

function heatPump(m: ModelBuilder) {
  plinth(m, 3.22, 2.8)
  for (const x of [-0.69, 0.69]) {
    drum(m, x, 0.79, 0, 0.84, 2.22, steel, forward)
    for (const z of [-0.91, 0.86]) drum(m, x, 0.79, z, 0.9, 0.085, dark, forward)
    drum(m, x, 1.41, -0.34, 0.42, 0.67, enamel)
    dial(m, x, 0.82, 1.13, 0.2)
  }
  for (const y of [1.56, 1.77]) drum(m, 0, y, 0.4, 0.16, 2.36, steel, across)
}

function batteryCabinets(m: ModelBuilder) {
  plinth(m, 2.05, 5.77)
  for (let row = 0; row < 5; row++) {
    const z = -2.22 + row * 1.11
    m.box(pale, [0, 1.26, z], [1.74, 1.95, 1.05], 'steel')
    for (const side of [-1, 1]) {
      for (let module = 0; module < 6; module++) {
        const y = 0.54 + module * 0.25
        m.box('#64777a', [side * 0.885, y, z], [0.038, 0.195, 0.83], 'steel')
        m.box(amber, [side * 0.913, y, z + 0.27], [0.024, 0.048, 0.09], 'steel')
      }
    }
    label(m, 0, 2.04, z + 0.535)
    m.box(dark, [0, 2.32, z], [0.49, 0.2, 0.46], 'steel')
  }
  // The dedicated extraction trunk picks up each cabinet; its wall interface is separate from HVAC.
  m.box('#809299', [0, 2.55, 0], [0.68, 0.41, 5.79], 'steel')
  for (let i = 0; i < 5; i++) m.box(steel, [0, 2.55, -2.22 + i * 1.11], [0.71, 0.44, 0.045], 'steel')
}

function switchboardModel(m: ModelBuilder, e: EquipmentUnit) {
  const [w, h, d] = e.moduleSizeM,
    n = e.tagCode.startsWith('ATS') ? 2 : 4,
    section = (w * 0.94) / n
  plinth(m, w * 0.96, d * 0.95)
  for (let i = 0; i < n; i++) {
    const x = section * (i - (n - 1) / 2),
      front = -d * 0.42
    m.box(i % 2 ? '#c6ccbe' : '#b4c3bc', [x, h * 0.52, 0], [section - 0.022, h * 0.83, d * 0.82], 'steel')
    m.box(dark, [x, h * 0.7, front], [section * 0.65, 0.28, 0.038], 'steel')
    m.box('#839d99', [x, h * 0.7, front - 0.025], [section * 0.47, 0.14, 0.025], 'glass')
    m.box(dark, [x + section * 0.24, h * 0.44, front - 0.035], [0.056, 0.2, 0.063], 'steel')
    for (let j = 0; j < 4; j++)
      m.box('#7b8a85', [x, h * 0.27 + j * 0.058, front - 0.012], [section * 0.5, 0.016, 0.035], 'steel')
    if (i === 1)
      m.box(
        '#c5a46d',
        [x + section * 0.22, h * 0.37, front - 0.07],
        [0.085, 0.14, 0.018],
        'epoxy',
        [0, 0, 0.16],
      )
  }
  m.box(steel, [0, h * 0.95, 0], [w * 0.96, 0.055, d * 0.92], 'steel')
}

function shieldCell(m: ModelBuilder, e: EquipmentUnit) {
  const [w, h, d] = e.moduleSizeM,
    tint = e.tagCode.endsWith('A') ? '#adae9f' : '#a1aaa5'
  m.box('#747c78', [0, 0.14, 0], [w - 0.08, 0.28, d - 0.07], 'stone')
  // Independent enclosure, overlapping removable exterior panels, service hatch and lifting eyes.
  m.box(tint, [0, h * 0.48, 0], [w - 0.48, h * 0.82, d - 0.46], 'stone')
  const front = -d / 2 + 0.205
  for (let i = 0; i < 4; i++) {
    const z = -d * 0.345 + i * d * 0.23
    for (const sign of [-1, 1]) {
      m.box(tint, [sign * (w * 0.5 - 0.171), h * 0.48, z], [0.15, h * 0.75, d * 0.215], 'stone')
      m.box(dark, [sign * (w * 0.5 - 0.082), 0.57, z], [0.048, 0.085, d * 0.17], 'steel')
    }
  }
  m.box(dark, [0, 1.3, front], [2.28, 2.18, 0.22], 'steel')
  m.box('#9ba698', [0, 1.32, front - 0.079], [2.03, 1.97, 0.13], 'steel')
  for (const x of [-0.82, 0.82])
    for (const y of [0.58, 1.9]) m.box(steel, [x, y, front - 0.15], [0.16, 0.1, 0.065], 'steel')
  m.box('#516661', [0.66, 1.2, front - 0.16], [0.08, 0.35, 0.074], 'steel')
  m.box('#e2c692', [-0.46, 1.56, front - 0.158], [0.41, 0.24, 0.022], 'epoxy')
  m.box('#98bcac', [0, 2.49, front + 0.15], [0.29, 0.073, 0.065], 'lamp')
  for (const x of [-w * 0.27, w * 0.27]) {
    m.box(tint, [x, h - 0.185, 0], [w * 0.46, 0.22, d - 0.3], 'stone')
    for (const z of [-1.78, 1.78]) m.box(dark, [x, h - 0.053, z], [0.25, 0.083, 0.065], 'steel')
  }
}

function chp(m: ModelBuilder) {
  plinth(m, 3.3, 5.43)
  m.box('#718987', [0, 1.13, 0], [2.85, 1.7, 4.9], 'steel')
  for (const x of [-1, 1])
    for (let i = 0; i < 13; i++)
      m.box(dark, [x * 1.438, 1.27, -1.42 + i * 0.217], [0.041, 0.64, 0.088], 'steel')
  for (const [z, tint] of [
    [-1.42, steel],
    [1.34, '#977e69'],
  ] as const) {
    drum(m, 0, 2.17, z, 0.44, 0.4, tint)
    drum(m, 0.38, 2.49, z, 0.41, 1.12, tint, across)
    drum(m, 0.92, 2.49, z, 0.48, 0.08, dark, across)
  }
  m.box(pale, [0, 1.14, -2.47], [1.07, 1.08, 0.064], 'steel')
  dial(m, 0, 1.4, -2.5, 0.18)
  // The wrench tray at the service end belongs to this skid.
  m.box('#736d5c', [-0.98, 0.31, 2.44], [0.52, 0.075, 0.33], 'steel')
  for (const x of [-1.09, -0.91]) m.box(steel, [x, 0.361, 2.43], [0.03, 0.022, 0.24], 'steel')
}

function airHandler(m: ModelBuilder, e: EquipmentUnit) {
  plinth(m, 3.12, 3.7)
  const sign = e.tagCode.endsWith('A') ? 1 : -1
  m.box('#a3b4ad', [0, 1.23, 0], [2.82, 1.85, 3.47], 'steel')
  for (let i = 0; i < 3; i++) {
    const z = -1.03 + i * 1.03
    m.box(dark, [sign * 1.423, 1.29, z], [0.082, 1.48, 0.92], 'steel')
    m.box('#bdc7b7', [sign * 1.475, 1.29, z], [0.075, 1.34, 0.8], 'steel')
    for (const y of [0.77, 1.76]) {
      m.box(amber, [sign * 1.534, y, z], [0.1, 0.095, 0.3], 'steel')
      m.box(dark, [sign * 1.568, y, z], [0.06, 0.05, 0.12], 'steel')
    }
  }
  m.box(dark, [0, 1.23, -1.75], [2.35, 1.27, 0.1], 'steel')
  for (let row = 0; row < 10; row++)
    m.box(steel, [0, 0.72 + row * 0.111, -1.815], [2.26, 0.047, 0.07], 'steel', [-0.24, 0, 0])
  // Flat service case on the return side.
  if (sign === 1) {
    m.box('#8d7960', [-0.63, 2.25, 0.26], [0.61, 0.17, 0.39], 'epoxy')
    m.box(dark, [-0.63, 2.35, 0.26], [0.22, 0.024, 0.06], 'steel')
  }
}

function oxygenSkid(m: ModelBuilder) {
  plinth(m, 2.37, 3.59)
  rack(m, 2.23, 2.19, 3.46)
  m.box(pale, [-0.49, 1.19, -0.56], [0.81, 1.78, 1.29], 'steel')
  for (let i = 0; i < 11; i++)
    m.box(i % 2 ? dark : steel, [0.54, 0.96, -1.12 + i * 0.105], [0.72, 0.84, 0.059], 'steel')
  for (const x of [-0.5, 0.5]) {
    drum(m, x, 1.07, 0.9, 0.58, 1.52, steel)
    drum(m, x, 1.91, 0.9, 0.155, 0.23, dark)
  }
  m.box('#73969a', [-0.49, 1.65, -1.217], [0.48, 0.22, 0.036], 'glass')
  drum(m, 0, 2.02, 0.91, 0.115, 1.24, steel, across)
}

function carbonColumns(m: ModelBuilder) {
  plinth(m, 2.39, 2.21)
  for (const x of [-0.6, 0.6]) {
    drum(m, x, 1.23, 0, 0.87, 1.87, enamel)
    for (const y of [0.47, 2.05]) drum(m, x, y, 0, 0.92, 0.062, steel)
    drum(m, x, 2.26, 0, 0.23, 0.22, dark)
    dial(m, x, 1.59, 0.45)
  }
  drum(m, 0, 2.41, 0, 0.15, 1.6, steel, across)
}

function oxygenBottles(m: ModelBuilder) {
  plinth(m, 2.38, 1.51)
  for (const x of [-0.75, -0.25, 0.25, 0.75])
    for (const z of [-0.34, 0.34]) {
      drum(m, x, 0.96, z, 0.38, 1.32, '#8bacc0')
      m.part('bud', 'steel', '#a4bdcc', [x, 1.62, z], [0.38, 0.29, 0.38])
      drum(m, x, 1.8, z, 0.083, 0.18, amber)
    }
  for (const z of [-0.63, 0.63]) m.box(dark, [0, 1.19, z], [2.24, 0.1, 0.055], 'steel')
  drum(m, 0, 1.94, -0.36, 0.095, 2.13, steel, across)
}

export const plantVisuals: Record<string, (m: ModelBuilder, e: EquipmentUnit) => void> = {
  'TK-301': tank,
  'WT-302': waterPlant,
  'FD-311': grainStation,
  'FD-312': packer,
  'FV-313': (m) => fermenter(m, 1.5, 2.25),
  'CS-321': (m, e) => grainRack(m, ...e.moduleSizeM),
  'CS-322': seedDrawers,
  'RF-323': cooler,
  'GR-331': (m, e) => growRack(m, e, true),
  'GR-332': (m, e) => growRack(m, e, false),
  'AG-333': weighingBench,
  'AQ-341': fishTank,
  'MC-342': mushroomCabin,
  'PB-343': algaeReactor,
  'DG-344': (m) => fermenter(m, 2.14, 2.51),
  'P-411': liftPump,
  'WP-412': compactor,
  'MH-421': manifold,
  'HP-422': heatPump,
  'BAT-431': batteryCabinets,
  'SW-432': switchboardModel,
  'ATS-433': switchboardModel,
  'GEN-441': shieldCell,
  'CHP-442': chp,
  'AHU-451': airHandler,
  'OX-452': oxygenSkid,
  'CB-453': carbonColumns,
  'OX-454': oxygenBottles,
}
