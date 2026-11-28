import { defaultBlueprint } from '../data/defaultBlueprint'
import type { MepNetwork } from '../data/mepNetwork'
import { evaluateCompliance } from './compliance'
import { evaluateFeasibility } from './feasibility'
import { hasChpDucts } from './geometryChecks'
import { simulateMaintenance } from './maintenance'
import { design, type OperatingPoint } from './model'

export type { Diagnostic, MaintenanceResult, OperatingPoint, Scenario, Status } from './model'
export function evaluateOperations(point: OperatingPoint, network: MepNetwork | null) {
  const rooms = defaultBlueprint.rooms
  const maintenance =
    point.isolatedId && network ? simulateMaintenance(point.isolatedId, network, rooms) : null
  const offline = [...(maintenance?.offlineTags ?? [])]
  for (const unit of rooms.flatMap((r) => r.equipment).filter((e) => e.requiresExternalExhaust))
    if (!network || !hasChpDucts(network, unit)) offline.push(unit.tagCode)
  const feasibility = evaluateFeasibility(point, rooms, design, offline)
  if (
    maintenance?.backupEquipmentTag &&
    feasibility.batteryDraw > 0 &&
    rooms
      .flatMap((r) => r.equipment)
      .some((e) => e.tagCode === maintenance.id && e.redundantGroup === 'primary-source')
  ) {
    if (maintenance.status === 'PASS') maintenance.status = feasibility.unmet > 0 ? 'FAIL' : 'WARN'
    maintenance.summary +=
      ' 剩余机组不足，电池需补 ' +
      feasibility.batteryDraw.toFixed(1) +
      ' kW，当前负荷约可维持 ' +
      feasibility.deficitHours.toFixed(1) +
      ' h。'
  }
  return {
    rows: [...feasibility.rows, ...evaluateCompliance(rooms, network, feasibility, point.isolatedId)],
    maintenance,
    feasibility,
  }
}
