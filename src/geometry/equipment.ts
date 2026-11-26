import type { EquipmentUnit, Point3 } from '../types/shelter'

/** Translate the fitted solids from the equipment datum into the floor survey frame. */
export function equipmentSolids(unit: EquipmentUnit) {
  const boxes = unit.collisionBoxes ?? [{ center: [0, unit.moduleSizeM[1] / 2, 0], size: unit.moduleSizeM }]
  return boxes.map(({ center, size }) => ({
    center: center.map((v, i) => v + unit.position[i]) as Point3,
    size,
  }))
}
