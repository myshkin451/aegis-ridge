import type { EquipmentUnit, Point3 } from '../types/shelter'

export type Scenario = 'normal' | 'cryo' | 'bio' | 'fallout'
export type Status = 'PASS' | 'WARN' | 'FAIL'
export interface OperatingPoint {
  scenario: Scenario
  people: number
  hour: number
  sealed?: boolean
  isolatedId?: string | null
}
export interface Diagnostic {
  id: string
  label: string
  status: Status
  value: string
  detail: string
  roomId: string
  equipmentTag?: string
  edgeId?: string
}
export interface MaintenanceResult {
  id: string
  label: string
  roomId: string
  status: Status
  summary: string
  affectedRoomIds: string[]
  isolatedEdgeIds: string[]
  backupEquipmentTag?: string
  backupEdgeIds: string[]
  route: Point3[]
  spare: string
  crew: string
  offlineTags: string[]
}

/** Concept operating assumptions, replaceable independently of installed nameplates.
 * Storage is initially full. No credited imports while sealed. No capacity credited
 * to a dry cooler or valley discharge until equipment has a heat rejection rating.
 */
export const design = {
  pvKwp: 48,
  windKw: 12,
  windCapacityFactor: 0.35,
  windFromWest: true,
  greyRecovery: 0.92,
  blackRecovery: 0,
  condensateRecovery: 0.95,
  householdOtherLitres: 8,
  cropWaterLitresM2Day: 2.5,
  springLitresDay: 2200,
  waterTankLitres: 25000,
  batteryKwh: 1000,
  batteryInverterKw: 100,
  batteryUsable: 0.85,
  inverterEfficiency: 0.95,
  oxygenBottleKg: 36,
  co2RemovalKgDay: 12.5,
  respiratoryQuotient: 0.85,
  leafLayers: 5,
  stapleLayers: 2,
  trayUseFraction: 0.8,
  leafKcalM2Day: 52,
  stapleKcalM2Day: 300,
  proteinKcalM2Day: 24,
  grainStockKg: 12000,
  grainKcalKg: 3500,
  // Net photosynthetic gas delivered after respiration and room exchange, concept estimate.
  netOxygenKgM2LightHour: 0.00045,
  algaeOxygenKgLightHour: 0.012,
  rockVolumeM3: 18000,
  rockDensityKgM3: 2650,
  rockHeatKjKgK: 0.79,
  rockDeltaK: 8,
  greenhouseUaKwK: 0.6,
  greenhouseSetpointC: 16,
  snowKgHour: 90,
  stormSnowKgHour: 780,
  snowFusionKjKg: 334,
  // Recirculated clean-air delivery measured over the occupied B2 floor.
  filterFlowM3Hour: 5200,
  minAch: 2,
  filterDustGramsM3: 0.00008,
  carbonLoadGramsM3: 0.000025,
  hepaHoldingGrams: 1800,
  carbonHoldingGrams: 500,
  hepaReplacements: 5,
  carbonReplacements: 3,
  workshopKits: 24,
  designDays: 30,
}
export type Design = typeof design
export const spareStock: Record<EquipmentUnit['requiredSpareType'], number> = {
  structural: 4,
  precision_filter: 5,
  electronic: 2,
  consumable: 24,
}
export function marginStatus(supply: number, demand: number): Status {
  if (supply + 1e-9 < demand) return 'FAIL'
  return supply + 1e-9 < demand * 1.1 ? 'WARN' : 'PASS'
}
export const duration = (stock: number, rate: number) => (rate > 0 ? stock / rate : Infinity)
export const display = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : '∞')
export const isSealed = (p: OperatingPoint) => p.sealed ?? (p.scenario === 'bio' || p.scenario === 'fallout')
