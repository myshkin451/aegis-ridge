import type { FloorId } from '../../types/shelter'

/** B3 & B4 native-PBR furnishings (cold vault, wine cellar, diesel & battery plant) — owned exclusively by V3-4. */
export function PlantFurnishings({ id: _id }: { id: Extract<FloorId, 'B3' | 'B4'> }) {
  return null
}
