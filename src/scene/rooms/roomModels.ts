import type { FloorId, EquipmentUnit } from '../../types/shelter'
import { roomsOn } from '../../data/defaultBlueprint'
import { ModelBuilder } from '../utils/modelBuilder'
import { drawUpper } from './upper'
import { drawResidential } from './residential'
import { drawPlant } from './plant'

export function drawEquipment(builder: ModelBuilder, floor: FloorId, unit: EquipmentUnit) {
  const draw = floor === 'B2' ? drawResidential : floor === 'B3' || floor === 'B4' ? drawPlant : drawUpper
  builder.equipment(unit.tagCode, unit.position, () => draw(builder, unit))
}

/** One batch per primitive and finish across the entire floor. */
export function roomModels(floor: FloorId) {
  const builder = new ModelBuilder()
  for (const room of roomsOn(floor)) for (const unit of room.equipment) drawEquipment(builder, floor, unit)
  return builder
}
