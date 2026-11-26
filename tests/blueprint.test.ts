import { describe, expect, it } from 'vitest'
import { defaultBlueprint, roomsOn } from '../src/data/defaultBlueprint'
import { ADIT, CORRIDOR, FLOORS, FLOOR_ORDER, GRID, SHAFTS, UNDERGROUND } from '../src/data/floors'
import type { GridBounds } from '../src/types/shelter'
import {
  aditCentreZ,
  buffer,
  floorSection,
  footprint,
  gridToWorld,
  shaftPlans,
  worldToGrid,
} from '../src/scene/utils/coords'
import { contains } from '../src/scene/utils/planGeometry'
import { slabPlan } from '../src/scene/utils/shellGeometry'

function cells(b: GridBounds) {
  const keys: string[] = []
  for (let x = b.gx0; x <= b.gx1; x++) for (let z = b.gz0; z <= b.gz1; z++) keys.push(x + ',' + z)
  return keys
}

const specifiedRooms = [
  ['l2_observatory', 1, 5, 1, 7],
  ['l2_greenhouse', 6, 11, 1, 7],
  ['l1_lobby', 7, 12, 1, 8],
  ['l1_garage', 0, 4, 1, 8],
  ['l1_vestibule', 5, 6, 1, 8],
  ['b1_decon', 0, 4, 0, 3],
  ['b1_logistics', 5, 8, 0, 2],
  ['b1_tactical', 9, 13, 0, 3],
  ['b1_warehouse', 0, 6, 5, 9],
  ['b1_workshop', 7, 13, 5, 9],
  ['b2_command', 0, 4, 0, 3],
  ['b2_library', 5, 8, 0, 2],
  ['b2_medical', 9, 13, 0, 3],
  ['b2_quarters', 0, 5, 5, 9],
  ['b2_commons', 6, 9, 5, 9],
  ['b2_gym', 10, 13, 5, 9],
  ['b3_coldvault', 0, 4, 0, 3],
  ['b3_foodproc', 5, 8, 0, 2],
  ['b3_water', 9, 13, 0, 3],
  ['b3_hydroponics', 0, 7, 5, 9],
  ['b3_aquaponics', 8, 13, 5, 9],
  ['b4_cbrn_hvac', 0, 4, 0, 3],
  ['b4_geothermal', 5, 8, 0, 2],
  ['b4_drainage', 9, 13, 0, 3],
  ['b4_reactor', 0, 6, 5, 9],
  ['b4_switchgear', 7, 13, 5, 9],
] as const

describe('baseline floor plans', () => {
  it('preserves every room ID, storey and inclusive engineering footprint', () => {
    expect(defaultBlueprint.rooms).toHaveLength(specifiedRooms.length)
    for (const [id, gx0, gx1, gz0, gz1] of specifiedRooms) {
      expect(
        defaultBlueprint.rooms.find((r) => r.id === id),
        id,
      ).toMatchObject({
        floorId: id.slice(0, 2).toUpperCase(),
        bounds: { gx0, gx1, gz0, gz1 },
      })
    }
  })
  it('fixes the corridor and all five vertical cores independently of the room map', () => {
    expect(CORRIDOR).toEqual({ gx0: 0, gx1: 12, gz0: 4, gz1: 4 })
    expect(SHAFTS.map((s) => [s.id, s.gx, s.gz])).toEqual([
      ['freight', 5, 3],
      ['personnel', 6, 3],
      ['wet', 7, 3],
      ['electrical', 8, 3],
      ['escape', 13, 4],
    ])
    expect(footprint(CORRIDOR)).toMatchObject({ w: 26, d: 2 })
  })
  it.each(UNDERGROUND)('%s tiles all 140 cells exactly once including the reserved backbone', (id) => {
    const owners = new Map<string, string>()
    const claim = (key: string, owner: string) => {
      expect(owners.get(key), id + ' ' + key + ' overlaps ' + owner).toBeUndefined()
      owners.set(key, owner)
    }
    SHAFTS.forEach((s) => claim(s.gx + ',' + s.gz, s.id))
    cells(CORRIDOR).forEach((key) => claim(key, 'corridor'))
    expect(owners.size).toBe(18)
    for (const room of roomsOn(id)) {
      const b = room.bounds
      expect(Object.values(b).every(Number.isInteger)).toBe(true)
      expect(b.gx0).toBeLessThanOrEqual(b.gx1)
      expect(b.gz0).toBeLessThanOrEqual(b.gz1)
      cells(b).forEach((key) => claim(key, room.id))
    }
    expect([...owners.keys()].sort()).toEqual(cells({ gx0: 0, gx1: 13, gz0: 0, gz1: 9 }).sort())
    expect(roomsOn(id).reduce((n, r) => n + footprint(r.bounds).area, 0)).toBe(488)
  })
  it.each(['L2', 'L1'] as const)('%s is fully covered without overlap', (id) => {
    const used = roomsOn(id).flatMap((r) => cells(r.bounds))
    expect(used.sort()).toEqual(cells(FLOORS[id].bounds).sort())
  })
  it('preserves the declared dry, adjustable and exchangeable rooms and the JSON representation', () => {
    const rooms = defaultBlueprint.rooms
    expect(rooms.filter((r) => r.isDryElectricalZone).map((r) => r.id)).toEqual([
      'b2_command',
      'b4_switchgear',
    ])
    expect(rooms.filter((r) => r.adjustable).map((r) => r.id)).toEqual(['b1_tactical', 'b2_commons'])
    expect(rooms.filter((r) => r.replaceable).map((r) => r.id)).toEqual([
      'b2_library',
      'b2_gym',
      'b3_foodproc',
      'b3_aquaponics',
    ])
    expect(JSON.parse(JSON.stringify(defaultBlueprint))).toEqual(defaultBlueprint)
  })
})

describe('metres, sections and constructed openings', () => {
  it('centres a right-handed 2 m grid and round-trips every cell', () => {
    expect(gridToWorld(0, 0, 'L1')).toEqual([-13, 0, -9])
    expect(gridToWorld(13, 9, 'B4')).toEqual([13, -22.8, 9])
    expect(footprint(FLOORS.B1.bounds)).toMatchObject({ x0: -14, x1: 14, z0: -10, z1: 10, area: 560 })
    for (let gx = 0; gx < GRID.columns; gx++)
      for (let gz = 0; gz < GRID.rows; gz++) {
        const [x, , z] = gridToWorld(gx, gz, 'L1')
        expect(worldToGrid(x, z)).toEqual({ gx, gz })
      }
    expect(worldToGrid(-14, -10)).toEqual({ gx: 0, gz: 0 })
    expect(worldToGrid(14, 10)).toEqual({ gx: 14, gz: 10 })
  })
  it('places floor tops at their specified elevations and preserves total gross area', () => {
    expect(FLOOR_ORDER.map((id) => gridToWorld(0, 0, id)[1])).toEqual([4.2, 0, -10.2, -14.4, -18.6, -22.8])
    expect(FLOOR_ORDER.map((id) => footprint(FLOORS[id].bounds).area)).toEqual([308, 416, 560, 560, 560, 560])
    expect(buffer).toEqual({ bottom: -6, top: 0 })
    expect(floorSection('B1').cap).toBeCloseTo(buffer.bottom)
  })
  it.each(UNDERGROUND)('%s separates the slab, clear height and service void', (id) => {
    const s = floorSection(id)
    expect(s.floor - s.slabBottom).toBeCloseTo(0.3)
    expect(s.ceiling - s.floor).toBeCloseTo(3)
    expect(s.plenumTop - s.ceiling).toBeCloseTo(0.9)
    expect(s.cap - s.plenumTop).toBeCloseTo(0.3)
    const above = UNDERGROUND.indexOf(id) - 1
    if (above >= 0) expect(s.plenumTop).toBeCloseTo(floorSection(UNDERGROUND[above]).slabBottom)
  })
  it.each(UNDERGROUND)('%s cuts through the slab at the five shafts, retaining all other cells', (id) => {
    const plan = slabPlan(FLOORS[id].bounds)
    for (let gx = 0; gx < GRID.columns; gx++)
      for (let gz = 0; gz < GRID.rows; gz++) {
        const [x, , z] = gridToWorld(gx, gz, id)
        const concrete = plan.some(
          (poly) => contains(poly[0], x, z) && !poly.slice(1).some((h) => contains(h, x, z)),
        )
        expect(concrete).toBe(!shaftPlans.some((s) => s.gx === gx && s.gz === gz))
      }
  })
  it('aligns the B1 western adit with the decontamination room', () => {
    const decon = defaultBlueprint.rooms.find((r) => r.id === ADIT.roomId)!
    const room = footprint(decon.bounds)
    expect(decon.floorId).toBe('B1')
    expect(room.x0).toBe(footprint(FLOORS.B1.bounds).x0)
    expect(aditCentreZ - ADIT.width / 2).toBeGreaterThan(room.z0)
    expect(aditCentreZ + ADIT.width / 2).toBeLessThan(room.z1)
    expect(ADIT.height).toBeLessThan(FLOORS.B1.clearHeight)
  })
})
