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

export interface EquipmentUnit {
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
  isDryElectricalZone: boolean
  requiresHoistRail: boolean
  equipment: EquipmentUnit[]
}

export type Point3 = [number, number, number]
export type ShaftId = 'freight' | 'personnel' | 'wet' | 'electrical' | 'escape'
export interface Shaft {
  id: ShaftId
  name: string
  gx: number
  gz: number
}
