export type FloorId = 'L2' | 'L1' | 'B1' | 'B2' | 'B3' | 'B4'
export type UndergroundId = Extract<FloorId, 'B1' | 'B2' | 'B3' | 'B4'>
export type FloorSelection = FloorId | 'ALL'
export type ViewMode = 'exterior' | 'cutaway' | 'xray'
export type CameraPreset = 'panorama' | 'surface' | 'section'

/** Inclusive grid indices. X increases east, Z increases south. */
export interface GridBounds {
  gx0: number
  gx1: number
  gz0: number
  gz1: number
}

export interface FloorDefinition {
  id: FloorId
  name: string
  shortName: string
  elevation: number
  clearHeight: number
  pitch: number
  bounds: GridBounds
}

/** Surveyed interface coordinates use world X/Z and metres above the named floor. */
export interface ServicePort {
  id: string
  system:
    | 'vacuum-blackwater'
    | 'greywater'
    | 'duty-sanitary'
    | 'borefield-supply'
    | 'borefield-return'
    | 'surface-heating'
    | 'hydrogen-recovery'
    | 'return-air-co2'
    | 'battery-exhaust'
    | 'combustion-air'
    | 'combustion-exhaust'
    | 'acoustic-sleeve'
  floor: FloorId
  position: Point3
  /** Entry into the receiving floor plenum before the lateral run. */
  plenumEntry?: { floor: FloorId; position: Point3 }
  /** Endpoints reserved for M3; intermediate pipework is not installed in this milestone. */
  connectsTo?: { floor: FloorId; position: Point3; shaft?: ShaftId }
}

export interface FurniturePlacement {
  visualKind: 'dining-chair'
  /** Position relative to the parent installation base. Size is local, before rotation. */
  position: Point3
  rotationY: number
  moduleSizeM: Point3
}

export interface EquipmentUnit {
  visualKind?: string
  furniture?: FurniturePlacement[]
  id: string
  name: string
  category:
    | 'power'
    | 'thermal'
    | 'water'
    | 'hvac'
    | 'agriculture'
    | 'manufacturing'
    | 'medical'
    | 'comms'
    | 'storage'
  /** Installed concept-design module. X/Z are world plan coordinates, Y is its base above the floor. */
  tagCode: string
  position: Point3
  notes: string
  /** Null for equipment without a heat-to-electric conversion process. */
  thermalEfficiency: number | null
  heatRejectionKw: number
  requiresExternalExhaust?: boolean
  hasRunawayVent?: boolean
  inputPowerKw: number
  generatedPowerKw: number
  o2RateKgPerDay: number
  servicePorts?: ServicePort[]
  sleepingRoomId?: string
  flushLitres?: number
  vibrationIsolation?: string
  collisionBoxes?: { center: Point3; size: Point3 }[]
  redundantGroup?: string
  powerKw: number
  heatKw: number
  moduleSizeM: [number, number, number]
  weightKg: number
  serviceIntervalDays: number
  requiredSpareType: 'structural' | 'precision_filter' | 'electronic' | 'consumable'
  primaryRoleId: string
  backupRoleId: string
}

export interface RoomInstance {
  id: string
  templateId: string
  floorId: FloorId
  name: string
  bounds: GridBounds
  replaceable: boolean
  adjustable: boolean
  zonePressure: 'high_pos' | 'normal_pos' | 'neutral' | 'neg_isolation'
  wetDryZone: 'dry' | 'wet' | 'semi_wet' | 'strict_dry_electrical'
  /** Optional wetted subzone inside a mixed-use gross room. */
  wetBounds?: GridBounds
  corridorGlazing: boolean
  servicePorts?: ServicePort[]
  sleepingRooms?: {
    id: string
    x0: number
    x1: number
    z0: number
    z1: number
    beds: number
    onCall: boolean
  }[]
  dailyWaterBudget?: { people: number; greyLitres: number; blackLitres: number }
  clearHeightOverride?: number
  atriumVoidToBelow?: GridBounds
  isDryElectricalZone: boolean
  requiresHoistRail: boolean
  cameraAnchors: RoomCameraAnchor[]
  equipment: EquipmentUnit[]
}

export type Point3 = [number, number, number]
export interface RoomCameraAnchor {
  name: string
  position: Point3
  target: Point3
}
export type ShaftId = 'freight' | 'personnel' | 'wet' | 'electrical' | 'escape'
export interface Shaft {
  id: ShaftId
  name: string
  bounds: GridBounds
  topFloor: FloorId
}

export type CameraStateId = 'site' | 'section' | 'sectionBox' | 'plan' | 'floorOrbit' | 'walkthrough'
export type BoxFace = 'west' | 'east' | 'bottom' | 'top' | 'north' | 'south'
