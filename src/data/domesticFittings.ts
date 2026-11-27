import type { Point3 } from '../types/shelter'

/** Real installation envelopes in the parent equipment datum, independent of imported geometry. */
export const domesticFittings = {
  toilet: { centre: [0, 0.48, -0.005], size: [0.62, 0.945, 0.887] },
  publicBasin: { centre: [0, 0.762, 0], size: [0.71, 0.23, 0.59] },
} satisfies Record<string, { centre: Point3; size: Point3 }>
