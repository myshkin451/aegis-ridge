import { defaultBlueprint } from './defaultBlueprint'
import { coldRack, warehouseRack } from './stockRacks'
import type { RoomInstance } from '../types/shelter'

/** A full-store planning snapshot. Demand is coincident household use, not the sum
 * of every installed nameplate. Farm lighting is staggered across the beds. */
export function fortressSupply(scenario: string, residents: number, hour: number, sealed: boolean,
  rooms: RoomInstance[] = defaultBlueprint.rooms) {
  const installed = rooms.flatMap(room => room.equipment)
  const people = Math.min(8, Math.max(6, Math.round(residents)))
  const geothermalInput = scenario === 'cryo' ? 5.5 : 3.5
  const farmLighting = hour < 12 || hour >= 20 ? 3.5 : 1
  const demandKw = 10.8 + people * 0.55 + geothermalInput + farmLighting
  const generators = installed.filter(e => e.redundantGroup === 'primary-source')
  const duty = generators[0]
  const batteryKwh = installed.reduce((sum, e) => sum + (e.storageKwh ?? 0), 0)
  const batteryKw = installed.reduce((sum, e) => sum + (e.inverterKw ?? 0), 0)
  const waterLitres = installed.reduce((sum, e) => sum + (e.waterLitres ?? 0), 0)
  const fuelLitres = installed.reduce((sum, e) => sum + (e.fuelLitres ?? 0), 0)
  const batteryHours = batteryKwh * 0.8 * 0.95 / demandKw // 20% reserve and inverter losses
  const netGensetKw = duty ? duty.generatedPowerKw - duty.inputPowerKw : 0
  const dieselInputKwhL = 9.8
  const hourlyLitres = (demandKw + (duty?.inputPowerKw ?? 0)) / ((duty?.thermalEfficiency ?? 1) * dieselInputKwhL)
  const stored = rooms.reduce((total, room) => {
    const rack = room.id === 'b1_warehouse' ? warehouseRack : room.id === 'b3_coldvault' ? coldRack : null
    if (!rack) return total
    const bins = rack.tiers * rack.columns * rack.depth
    for (const item of room.equipment) total += bins * (item.grainKgPerBin ?? 0)
    return total
  }, 0)
  const batteryMode = sealed && (scenario === 'fallout' || scenario === 'bio')
  return { people, demandKw, geothermalInput, batteryMode, availableKw: batteryMode ? batteryKw : netGensetKw,
    batteryKwh, batteryHours, fuelLitres, waterLitres, fuelDays: fuelLitres / hourlyLitres / 24,
    grainKg: stored, grainYears: stored / (0.6 * people * 365.25) }
}
