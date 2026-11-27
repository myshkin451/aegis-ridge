import type { EquipmentUnit, Point3, RoomCameraAnchor } from '../../types/shelter'

import { legacyVisualKind } from '../equipmentVisuals'

export type { EquipmentUnit, Point3, RoomCameraAnchor }
export interface RoomLayout {
  equipment: EquipmentUnit[]
  cameraAnchors: RoomCameraAnchor[]
}

const maintainers: Record<EquipmentUnit['category'], [string, string]> = {
  power: ['electrical', 'mechanical'],
  thermal: ['mechanical', 'electrical'],
  water: ['water', 'mechanical'],
  hvac: ['mechanical', 'water'],
  agriculture: ['agronomy', 'water'],
  manufacturing: ['mechanical', 'electrical'],
  medical: ['medical', 'water'],
  comms: ['instrumentation', 'electrical'],
  storage: ['logistics', 'mechanical'],
}

/** Rated input at design load. Passive fittings default to zero. Gross generator output is separate. */
export function unit(
  tagCode: string,
  name: string,
  category: EquipmentUnit['category'],
  position: Point3,
  moduleSizeM: Point3,
  weightKg: number,
  inputPowerKw: number,
  extra: Partial<EquipmentUnit> = {},
): EquipmentUnit {
  const [primaryRoleId, backupRoleId] = maintainers[category]
  return {
    id: tagCode,
    tagCode,
    visualKind: legacyVisualKind(tagCode),
    name,
    category,
    position,
    moduleSizeM,
    weightKg,
    inputPowerKw,
    powerKw: inputPowerKw - (extra.generatedPowerKw ?? 0),
    thermalEfficiency: null,
    heatRejectionKw: 0,
    generatedPowerKw: 0,
    o2RateKgPerDay: 0,
    primaryRoleId,
    backupRoleId,
    requiredSpareType: 'consumable',
    serviceIntervalDays: 180,
    notes: '',
    heatKw: inputPowerKw,
    ...extra,
  }
}
