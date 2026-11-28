import { BufferGeometry, Float32BufferAttribute } from 'three'
import { randomSource } from '../../geometry/random'
import type { ModelBuilder } from '../utils/modelBuilder'

export type CropLeaf = 'crop-serrated' | 'crop-broad' | 'crop-compound'
const atlasCells: Record<CropLeaf, number> = { 'crop-serrated': 0, 'crop-broad': 1, 'crop-compound': 2 }

// The petiole begins at the local origin. The cupped blade bends down beyond its midrib.
export function cropLeafGeometry(shape: CropLeaf) {
  const compound = shape === 'crop-compound'
  const position: number[] = [],
    uv: number[] = [],
    indices: number[] = []
  const rows = 5,
    cols = 4
  for (let row = 0; row <= rows; row++) {
    const t = row / rows
    for (let col = 0; col <= cols; col++) {
      const u = col / cols,
        edge = 2 * u - 1,
        blade = Math.sin(Math.PI * t)
      const roll = compound ? -0.14 : 0.24
      const wave = shape === 'crop-serrated' ? 0.11 * Math.sin(3 * Math.PI * t + edge) : 0
      position.push(
        edge * 0.5 + 0.027 * blade,
        t * 0.56 + 0.41 * Math.sin(0.94 * Math.PI * t) + (roll + wave) * edge ** 2 * blade,
        t,
      )
      uv.push((atlasCells[shape] + u) / 3, t)
      if (col < cols && row < rows) {
        const p = row * (cols + 1) + col
        indices.push(p, p + cols + 1, p + 1, p + 1, p + cols + 1, p + cols + 2)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

type Stage = 'seedling' | 'mature' | 'harvest'
type Crop = 'greens' | 'tuber'
const stages: readonly Stage[] = ['mature', 'seedling', 'harvest']
const cohorts = {
  greens: {
    seedling: { scale: 0.52, leaves: 4 },
    mature: { scale: 1, leaves: 11 },
    harvest: { scale: 0.78, leaves: 6 },
  },
  tuber: {
    seedling: { scale: 0.58, leaves: 5 },
    mature: { scale: 1, leaves: 5 },
    harvest: { scale: 0.91, leaves: 4 },
  },
}

interface Bed {
  width: number
  length: number
  surface: number
  /** Clear height from substrate to the underside of the lamp or module limit. */
  headroom: number
  columns: number
  rowPitch: number
  originZ?: number
}

/** Each plant stays in an inset planting cell, including the four transparent corners of every leaf. */
export function plantBed(m: ModelBuilder, bed: Bed, crop: Crop, batch: number, seed: number) {
  const random = randomSource(seed)
  const rows = Math.max(1, Math.floor(bed.length / bed.rowPitch))
  const dz = bed.length / rows,
    dx = bed.width / bed.columns
  for (let i = 0; i < rows; i++) {
    // Adjacent plugs form age cohorts. Forward and reverse faces of the aisle see all three.
    for (let j = 0; j < bed.columns; j++) {
      const stage = stages[(Math.floor((i + j * 2) / 3) + batch) % stages.length]
      const cohort = cohorts[crop][stage]
      const x = ((j + 0.5) / bed.columns - 0.5) * bed.width + (random() - 0.5) * 0.055 * dx
      const z = (bed.originZ ?? 0) + ((i + 0.5) / rows - 0.5) * bed.length + (random() - 0.5) * 0.055 * dz
      const radius = Math.min(dx, dz) * 0.45
      const seedling = stage === 'seedling',
        harvest = stage === 'harvest'
      const phase = random() * 2 * Math.PI
      const scale = cohort.scale * (0.94 + random() * 0.06)
      const footprint = radius * scale
      const h = Math.min(bed.headroom * 0.9, crop === 'tuber' ? 0.45 : 0.3) * scale
      if (crop === 'tuber') {
        // Potato shoots fan out from a common base. Each internode bears one
        // compound leaf whose paired leaflets and midrib come from the atlas.
        const shoots = seedling ? 1 : harvest ? 2 : 3
        for (let shoot = 0; shoot < shoots; shoot++) {
          const direction = phase + shoot * 2.39996
          const spread = seedling ? 0.04 : 0.2
          const sx = Math.sin(direction) * footprint * spread
          const sz = Math.cos(direction) * footprint * spread
          const length = h * (shoot === 0 ? 0.78 : 0.63)
          m.beam(
            [x, bed.surface, z],
            [x + sx, bed.surface + length, z + sz],
            0.012,
            0.012,
            '#9cab69',
            'foliage',
          )
          for (let k = 0; k < cohort.leaves; k++) {
            const node = (k + 1) / cohort.leaves
            const a = direction + k * 2.39996 + 0.17 * random()
            const low = harvest && k < 2
            const lengthScale = (0.96 - 0.42 * node) * (1 - spread * node)
            m.part(
              'crop-compound',
              'foliage',
              low ? '#ddc387' : k < 2 ? '#b0cc9c' : '#d1e4b0',
              [x + sx * node, bed.surface + node * length, z + sz * node],
              [
                footprint * 1.15 * lengthScale,
                h * (low ? 0.06 : 0.13 + 0.13 * node),
                footprint * 0.95 * lengthScale,
              ],
              [0, a, 0],
            )
          }
        }
        continue
      }
      for (let leaf = 0; leaf < cohort.leaves; leaf++) {
        const inner = leaf / cohort.leaves
        const theta = phase + leaf * 2.39996 + (random() - 0.5) * 0.25
        const shape: CropLeaf = (batch + j) % 3 === 1 ? 'crop-broad' : 'crop-serrated'
        const reach = footprint * (0.92 - 0.63 * inner),
          width = footprint * 0.83 * (1 - 0.52 * inner)
        const lift = h * (0.3 + 0.62 * inner)
        const color = seedling ? '#d3e5a1' : leaf < 4 ? '#a2bd85' : '#c2d899'
        m.part(shape, 'foliage', color, [x, bed.surface, z], [width, lift, reach], [0, theta, 0])
      }
      if (harvest) {
        // After selective harvest, the outer petioles remain around a small standing heart.
        for (let k = 0; k < 3; k++) {
          const theta = phase + k * 2.1
          m.beam(
            [x, bed.surface, z],
            [
              x + footprint * 0.56 * Math.sin(theta),
              bed.surface + h * 0.19,
              z + footprint * 0.56 * Math.cos(theta),
            ],
            0.013,
            0.009,
            '#c6d49d',
            'foliage',
          )
        }
      }
    }
  }
}
