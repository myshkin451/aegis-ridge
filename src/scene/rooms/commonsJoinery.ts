import { kitchenBayScale, tableLamps } from '../../data/roomLayouts/commons'
import type { Point3 } from '../../types/shelter'
import { ModelBuilder } from '../utils/modelBuilder'
import type { Finish } from '../materials/pbrLibrary'

const black = '#282b29',
  walnut = '#996540',
  brass = '#af895f',
  nickel = '#aeb3ae'
function edge(m: ModelBuilder, tint: string, p: Point3, dimensions: Point3, finish: Finish = 'oak_int') {
  m.part('joinery-edge', finish, tint, p, dimensions)
}
function cup(m: ModelBuilder, x: number, y: number, z: number, tint: string, angle = 0) {
  m.part('stoneware-cup', 'ceramic', tint, [x, y + 0.055, z], [0.108, 0.11, 0.108])
  m.part(
    'rolled-grip',
    'ceramic',
    tint,
    [x + 0.054 * Math.sin(angle), y + 0.056, z + 0.054 * Math.cos(angle)],
    [0.014, 0.072, 0.057],
    [0, angle, 0],
  )
  m.part('round', 'epoxy', '#37251b', [x, y + 0.089, z], [0.083, 0.003, 0.083])
}
function bottle(m: ModelBuilder, x: number, y: number, z: number, tint: string, h: number) {
  m.part('turned-bottle', 'ceramic', tint, [x, y + h / 2, z], [h * 0.37, h, h * 0.37])
  m.part('round', 'oak_int', '#80634c', [x, y + h + 0.008, z], [h * 0.11, 0.019, h * 0.11])
}
function pendant(m: ModelBuilder, x: number, z: number, diameter: number, y = 2.27) {
  m.part('round', 'steel', black, [x, 3.5, z], [0.115, 0.045, 0.115])
  m.part('round', 'steel', black, [x, (3.48 + y + 0.27) / 2, z], [0.015, 3.48 - y - 0.27, 0.015])
  m.part('pendant-dome', 'steel', '#3a3d37', [x, y + 0.147, z], [diameter, 0.3, diameter])
  m.part('round', 'lamp', '#ffe3b3', [x, y + 0.016, z], [diameter * 0.88, 0.012, diameter * 0.88])
  m.part('round', 'steel', brass, [x, y + 0.259, z], [0.085, 0.07, 0.085])
}

export function commonsDining(m: ModelBuilder) {
  // Eight-seater with through-tenoned trestles and a thick, bookmatched walnut top.
  for (const z of [-1.14, 1.14]) {
    edge(m, walnut, [0, 0.095, z], [0.88, 0.11, 0.14])
    for (const side of [-1, 1])
      m.beam([side * 0.31, 0.14, z], [side * 0.18, 0.7, z], 0.11, 0.14, '#895837', 'oak_int')
    edge(m, walnut, [0, 0.697, z], [0.82, 0.09, 0.15])
  }
  edge(m, '#825537', [0, 0.31, 0], [0.105, 0.145, 2.58])
  for (let i = 0; i < 3; i++)
    edge(m, ['#835439', '#754933', '#8c5a3a'][i], [(i - 1) * 0.374, 0.766, 0], [0.375, 0.08, 3.26])
  m.part('fruit-bowl', 'ceramic', '#514437', [0.03, 0.879, -0.12], [0.4, 0.14, 0.4])
  for (let i = 0; i < 6; i++) {
    const a = i * 2.4,
      r = 0.035 * Math.sqrt(i)
    m.part(
      'bud',
      'epoxy',
      ['#a95b31', '#b7a044', '#b2733b'][i % 3],
      [0.03 + r * Math.cos(a), 0.892 + 0.02 * (i % 2), -0.12 + r * Math.sin(a)],
      [0.08, 0.074, 0.078],
    )
  }
  cup(m, -0.35, 0.811, 0.96, '#cebd9d', 2)
}

export function commonsIsland(m: ModelBuilder) {
  m.framed(Math.PI / 2, [1, 1, 1], () => islandFront(m))
}
function islandFront(m: ModelBuilder) {
  edge(m, '#303731', [0.07, 0.49, 0], [0.95, 0.91, 2.96], 'honed_granite')
  edge(m, '#40483e', [0, 0.943, 0], [1.15, 0.117, 3.16], 'honed_granite')
  for (const z of [-1.51, 1.51]) edge(m, '#343d35', [0, 0.48, z], [1.15, 0.87, 0.105], 'honed_granite')
  edge(m, '#a07448', [-0.48, 0.842, 0], [0.62, 0.066, 3.03])
  edge(m, '#413a2e', [-0.39, 0.772, 0], [0.22, 0.07, 2.96])
  edge(m, '#ac8258', [0.05, 1.018, -0.78], [0.42, 0.026, 0.55])
  bottle(m, 0.1, 1.002, 0.67, '#686c45', 0.27)
  bottle(m, 0.18, 1.002, 0.49, '#986d4d', 0.18)
  // Hanging rack sits behind the three shades when seen across the breakfast bar.
  for (const z of [-0.82, 0.82]) m.part('round', 'steel', black, [0.47, 3.1, z], [0.017, 0.75, 0.017])
  edge(m, black, [0.47, 2.71, 0], [0.13, 0.064, 2.03], 'steel')
  for (const z of [-0.77, -0.38, 0.05, 0.47, 0.87])
    m.part('rolled-grip', 'steel', brass, [0.47, 2.61, z], [0.018, 0.17, 0.073])
  for (const z of [-1.16, 0, 1.16]) pendant(m, -0.13, z, 0.33, 2.33)
}

export function commonsKitchen(m: ModelBuilder) {
  m.framed(Math.PI / 2, [1, 1, kitchenBayScale], () => kitchenFront(m))
}
function kitchenFront(m: ModelBuilder) {
  // North-to-south elevation, viewed from the west. Retain a narrow toe recess and
  // line up each upper door reveal with a lower cabinet seam.
  const bays = 6,
    first = -2.7,
    pitch = 0.77,
    midpoint = first + ((bays - 1) * pitch) / 2
  m.box('#38312c', [0.1, 0.09, midpoint], [0.57, 0.14, pitch * bays], 'epoxy')
  m.box('#534332', [0.07, 0.5, midpoint], [0.68, 0.76, pitch * bays], 'oak_int')
  edge(m, '#535349', [0.015, 0.922, midpoint], [0.84, 0.077, pitch * bays + 0.03], 'honed_granite')
  m.box('#b6a080', [0.44, 1.31, midpoint], [0.065, 0.68, pitch * bays], 'formed_concrete')
  for (let i = 0; i < bays; i++) {
    const z = first + i * pitch
    for (const [height, y] of [
      [0.26, 0.28],
      [0.23, 0.54],
      [0.18, 0.76],
    ]) {
      edge(m, i % 3 === 0 ? '#805d3c' : '#8b6444', [-0.295, y, z], [0.042, height, pitch - 0.016])
      m.box('#5d4c39', [-0.325, y + height * 0.34, z], [0.031, 0.018, pitch * 0.61], 'steel')
    }
    if (i > 0) edge(m, i === 3 ? '#373a33' : '#30362f', [0.23, 2.03, z], [0.44, 0.8, pitch - 0.014], 'epoxy')
  }
  m.box('#deb785', [0.15, 1.619, midpoint + 0.385], [0.11, 0.035, pitch * 5 - 0.03], 'lamp')
  for (const y of [1.67, 2.1]) {
    edge(m, '#a17c55', [0.18, y, first], [0.45, 0.05, 0.74])
    for (let i = 0; i < 3; i++)
      cup(m, 0.16, y + 0.026, first - 0.22 + i * 0.2, ['#a18d70', '#c8c0a2', '#626659'][i], i)
  }
  // Flush induction glass, burner markings and an undermount sink rim.
  edge(m, '#272a29', [0.01, 0.971, 0.62], [0.59, 0.018, 0.73], 'epoxy')
  for (const z of [0.47, 0.78]) m.part('round', 'steel', '#52554c', [0.01, 0.984, z], [0.239, 0.005, 0.239])
  edge(m, '#91948b', [0.03, 0.97, -0.78], [0.57, 0.022, 0.64], 'steel')
  edge(m, '#48524e', [0.03, 0.985, -0.78], [0.48, 0.01, 0.53], 'steel')
  m.part('gooseneck', 'steel', nickel, [0.18, 1.158, -0.78], [0.029, 0.38, 0.26], [0, -Math.PI / 2, 0])
  for (let i = 0; i < 4; i++)
    bottle(
      m,
      0.17,
      0.962,
      -1.62 + i * 0.12,
      ['#7e8056', '#5b6040', '#ab7954', '#5b6458'][i],
      0.19 + 0.026 * (i % 3),
    )
  // Full-height pantry carcass, inset twin stainless doors, tubular pulls and a vent grille.
  const fridge = 2.2
  edge(m, '#886440', [0.05, 1.385, fridge], [0.86, 2.71, 1.41])
  for (const side of [-1, 1]) {
    const z = fridge + side * 0.314
    edge(m, side > 0 ? '#d8dbd5' : '#e1e5df', [-0.343, 1.19, z], [0.2, 2.1, 0.617], 'brushed_inox')
    const handleZ = fridge + side * 0.075
    for (const h of [0.82, 1.7]) m.beam([-0.441, h, handleZ], [-0.49, h, handleZ], 0.029, 0.031, nickel)
    m.part('round', 'steel', '#a3a7a0', [-0.491, 1.26, handleZ], [0.032, 0.92, 0.032])
  }
  edge(m, black, [-0.368, 2.37, fridge], [0.14, 0.21, 1.26], 'steel')
  for (let i = 0; i < 6; i++) m.box('#8e938d', [-0.447, 2.291 + i * 0.029, fridge], [0.018, 0.01, 1.2], 'steel')
}

export function commonsReturn(m: ModelBuilder) {
  const stone = '#696756'
  m.box('#494138', [0, 0.085, -0.23], [0.68, 0.15, 0.65], 'oak_int')
  m.box('#6b492b', [0, 0.5, -0.15], [0.78, 0.73, 0.81], 'oak_int')
  for (const z of [-0.28, 0.16]) edge(m, '#83572f', [0.387, 0.52, z], [0.035, 0.69, 0.416])
  edge(m, '#69665a', [0, 0.91, 0], [0.89, 0.09, 1.13], 'honed_granite')
  edge(m, stone, [-0.409, 1.84, 0], [0.071, 1.75, 1.13], 'formed_concrete')
  for (const y of [1.45, 1.9]) {
    edge(m, '#a67b52', [-0.2, y, -0.011], [0.35, 0.047, 1.09])
    for (const [i, z] of [-0.38, -0.15, 0.1, 0.36].entries())
      cup(m, -0.21, y + 0.024, z, ['#9c886b', '#d1c7ac', '#a99b82', '#61594d'][i], Math.PI / 2)
  }
  m.box('#eed6a1', [-0.2, 1.413, 0], [0.25, 0.023, 0.99], 'lamp')
}
export function commonsHearth(m: ModelBuilder) {
  // Actual recess: the concrete above, below and either side stops at the firebox.
  const concrete = '#807e75'
  m.box(concrete, [0, 0.19, 0], [2.5, 0.38, 0.49], 'formed_concrete')
  m.box(concrete, [0, 2.25, 0], [2.5, 2.49, 0.49], 'formed_concrete')
  for (const side of [-1, 1]) m.box(concrete, [side * 1.117, 0.691, 0], [0.266, 0.624, 0.49], 'formed_concrete')
  m.box('#332c25', [0, 0.694, -0.215], [1.97, 0.65, 0.044], 'honed_granite')
  for (const dy of [0.407, 0.98]) m.box(black, [0, dy, 0.15], [1.96, 0.051, 0.18], 'steel')
  for (const side of [-1, 1]) m.box(black, [side * 0.952, 0.69, 0.15], [0.048, 0.55, 0.18], 'steel')
  for (let i = 0; i < 12; i++) {
    const x = -0.83 + i * 0.15
    m.part(
      'rock',
      'honed_granite',
      i % 3 === 0 ? '#9c5633' : '#40352d',
      [x, 0.462, 0.067 + 0.045 * Math.sin(i * 2.4)],
      [0.2, 0.08 + 0.033 * (i % 3), 0.14],
      [0, i, 0.14],
    )
  }
}
export function commonsGarden(m: ModelBuilder) {
  // Glass is open above the planted bed. Thin bronze glazing beads are set back
  // from the lower steel frame, keeping the adjoining walk-on panels legible.
  edge(m, '#323a30', [0, 0.105, 0], [1.95, 0.21, 2.7], 'honed_granite')
  m.box('#393b2f', [0, 0.225, 0], [1.81, 0.032, 2.53], 'honed_granite')
  for (let i = 0; i < 25; i++) {
    const x = -0.7 + (i % 5) * 0.35 + 0.04 * Math.sin(i * 3.1)
    const z = -0.98 + Math.floor(i / 5) * 0.49 + 0.09 * Math.sin(i * 2.1)
    const height = 0.11 + 0.063 * (i % 3)
    m.part(
      'rock',
      'lichen',
      ['#474e35', '#5d5e43', '#65674a', '#696958'][i % 4],
      [x, 0.23 + height * 0.28, z],
      [0.26 + 0.09 * (i % 3), height, 0.3 + 0.08 * ((i + 1) % 3)],
      [0, i * 0.81, 0],
    )
  }
  for (const x of [-0.955, 0.955]) {
    for (const z of [-1.31, 1.31]) m.box('#4a4840', [x, 1.7, z], [0.033, 3.39, 0.033], 'steel')
    m.box('#8ba196', [x, 1.65, 0], [0.014, 2.74, 2.53], 'atrium-glass')
    m.box('#bc8c4c', [x * 0.957, 0.295, 0], [0.012, 0.012, 2.59], 'lamp')
    m.box('#514b3d', [x, 3.405, 0], [0.054, 0.09, 2.67], 'steel')
  }
  for (const z of [-1.31, 1.31]) {
    m.box('#90a79a', [0, 1.65, z], [1.86, 2.74, 0.014], 'atrium-glass')
    m.box('#b3854b', [0, 0.295, z * 0.965], [1.85, 0.012, 0.01], 'lamp')
    m.box('#534e42', [0, 3.405, z], [1.94, 0.09, 0.052], 'steel')
  }
}
export function commonsSofaDetails(m: ModelBuilder) {
  m.part('sofa-wrap', 'fabric', '#c7b69e', [0.7, 0.04, 0.39], [0.8, 0.91, 1.06], [0, Math.PI, 0])
  // An independent pair of loose down cushions sits on the upholstered seats.
  m.part('pillow', 'fabric', '#ac8e6f', [-1.86, 0.61, -0.21], [0.5, 0.16, 0.47], [1.25, 0.15, -1.36])
  m.part('pillow', 'fabric', '#b6a18a', [1.78, 0.65, 0.69], [0.47, 0.16, 0.43], [-1.17, 0.1, -0.15])
}
export function commonsCoffeeDetails(m: ModelBuilder) {
  cup(m, 0.43, 0.438, 0.07, '#ab9278', 1.2)
  for (let i = 0; i < 2; i++) {
    const x = -0.4 + i * 0.009,
      z = -0.04 + i * 0.007,
      y = 0.445 + i * 0.045,
      rot: Point3 = [0, 0.075 - i * 0.1, 0]
    m.box(i ? '#647273' : '#a07b59', [x, y, z], [0.33, 0.041, 0.23], 'fabric', rot)
    m.box('#c4b79e', [x, y + 0.003, z + 0.007], [0.321, 0.029, 0.227], 'plaster', rot)
  }
}

export function commonsSurfaces() {
  const m = new ModelBuilder()
  // The fixed root trough hangs into the surveyed atrium below the walkable glazing.
  // The removable bed above it begins at the gallery floor.
  edge(m, '#323a30', [-12.04, -0.335, 6.65], [1.94, 0.79, 2.69], 'honed_granite')
  // Cut stone slabs around the surveyed 4 × 6 m floor opening, with a 4 mm dry joint.
  const zones = [
    [-15.78, -14, 0.14, 11.78],
    [-10, -6.14, 0.14, 11.78],
    [-14, -10, 0.14, 2],
    [-14, -10, 8, 11.78],
  ]
  for (const [x0, x1, z0, z1] of zones) {
    const cols = Math.ceil((x1 - x0) / 1.25),
      rows = Math.ceil((z1 - z0) / 1.0)
    const w = (x1 - x0) / cols,
      d = (z1 - z0) / rows
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++)
        m.box(
          ['#3c413d', '#373d38', '#42453e', '#3d413a'][(i * 3 + j) % 4],
          [x0 + (i + 0.5) * w, 0.014, z0 + (j + 0.5) * d],
          [w - 0.004, 0.019, d - 0.004],
          'honed_granite',
        )
  }
  // Full-height walnut/oak lining on the quiet sides; the kitchen elevation remains concrete.
  for (const side of ['west', 'south', 'east'] as const) {
    const count = side === 'west' ? 19 : side === 'south' ? 16 : 7
    for (let i = 0; i < count; i++) {
      const w = side === 'south' ? 0.592 : side === 'west' ? 0.605 : 0.61
      const along =
        side === 'south'
          ? -15.76 + (i + 0.5) * w
          : side === 'west'
            ? 0.18 + (i + 0.5) * w
            : 7.22 + (i + 0.5) * w
      const p: Point3 =
        side === 'west' ? [-15.75, 1.66, along] : side === 'south' ? [along, 1.66, 11.75] : [-6.16, 1.66, along]
      const size: Point3 = side === 'south' ? [w - 0.007, 3.22, 0.049] : [0.049, 3.22, w - 0.007]
      m.box(['#855f40', '#8b6549', '#775337', '#846044'][i % 4], p, size, 'oak_int')
    }
  }
  // Opaque kitchen splash wall stops at the fire-door jamb. A deep reveal frames
  // the range, preserving the corridor window beyond the entrance on the other side.
  m.box('#4a4c47', [-8.55, 1.78, 0.183], [4.78, 3.52, 0.081], 'formed_concrete')
  m.box('#65635b', [-8.54, 3.14, 3.67], [4.86, 0.36, 0.3], 'formed_concrete')
  for (const x of [-10.91, -6.25]) m.box('#53534b', [x, 1.59, 0.47], [0.19, 3.18, 0.3], 'formed_concrete')
  // Exposed formwork returns along the appliance side, lit by the shallow timber reveals.
  for (const z of [2.01, 5.32]) m.box('#605e55', [-6.167, 1.77, z], [0.07, 3.48, 3.29], 'formed_concrete')
  for (const z of [1.03, 3.77, 7.02]) m.box('#5d5141', [-6.224, 1.75, z], [0.09, 3.45, 0.095], 'oak_int')
  // Formwork seams in the concrete soffit and deep beams across the gable bays.
  for (const z of [1.05, 5.44, 8.16, 11.5])
    m.box('#7d7b72', [-10.98, 3.42, z], [9.57, 0.34, 0.34], 'formed_concrete')
  m.box('#848174', [-13.03, 1.79, 7.21], [0.265, 3.56, 0.47], 'formed_concrete')
  for (const z of [0.52, 7.08]) m.box('#727169', [-6.24, 1.77, z], [0.2, 3.52, 0.22], 'formed_concrete')
  for (const [x, , z] of tableLamps) pendant(m, x, z, 0.53)
  return m
}
