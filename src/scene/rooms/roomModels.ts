import type { FloorId, EquipmentUnit, FurniturePlacement } from '../../types/shelter'
import { diningChairs } from '../../data/roomLayouts/residential'
import { roomsOn } from '../../data/defaultBlueprint'
import { legacyVisualKind } from '../../data/equipmentVisuals'
import { ModelBuilder } from '../utils/modelBuilder'
import { upperVisuals } from './upper'
import { bedroomNumbers, residentialVisuals } from './residential'
import { plantVisuals } from './plant'

import { moduleVisuals } from './moduleVisuals'

type EquipmentDraw = (builder: ModelBuilder, equipment: EquipmentUnit) => void
type Visual = { type: 'procedural'; draw: EquipmentDraw } | { type: 'glb'; shape: 'dining-chair' }
const registry: Record<string, Visual> = Object.fromEntries(
  Object.entries({ ...upperVisuals, ...residentialVisuals, ...plantVisuals, ...moduleVisuals }).map(([kind, draw]) => [
    kind,
    { type: 'procedural', draw },
  ]),
)
registry['dining-chair'] = { type: 'glb', shape: 'dining-chair' }

function drawFurniture(builder: ModelBuilder, fitting: FurniturePlacement) {
  const visual = registry[fitting.visualKind]
  if (visual.type !== 'glb') throw Error('Unknown furniture ' + fitting.visualKind)
  const {
    position: [x, y, z],
    moduleSizeM,
    rotationY,
  } = fitting
  builder.part(visual.shape, 'oak_int', '#ae865f', [x, y + moduleSizeM[1] / 2, z], moduleSizeM, [
    0,
    rotationY,
    0,
  ])
}

export function drawEquipment(builder: ModelBuilder, _floor: FloorId, unit: EquipmentUnit) {
  const kind = unit.visualKind ?? legacyVisualKind(unit.tagCode)
  const visual = registry[kind]
  if (!visual) throw Error('Unknown visualKind ' + kind + ' for ' + unit.tagCode)
  builder.equipment(unit.tagCode, unit.position, () => {
    if (visual.type === 'procedural') visual.draw(builder, unit)
    else
      drawFurniture(builder, {
        visualKind: visual.shape,
        position: [0, 0, 0],
        moduleSizeM: unit.moduleSizeM,
        rotationY: 0,
      })
    const furniture = unit.furniture ?? (kind === 'dining-table' ? diningChairs : [])
    for (const fitting of furniture) drawFurniture(builder, fitting)
  })
}

/** One batch per primitive and finish across the entire floor, including all dining chairs. */
export function roomModels(floor: FloorId, rooms = roomsOn(floor)) {
  const builder = new ModelBuilder()
  for (const room of rooms) for (const unit of room.equipment) drawEquipment(builder, floor, unit)
  if (floor === 'B2') bedroomNumbers(builder)
  return builder
}
