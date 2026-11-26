import { describe, expect, it } from 'vitest'
import { roomsOn, defaultBlueprint } from '../src/data/defaultBlueprint'
import {
  BRANCH_CORRIDOR,
  CORRIDOR,
  SERVICE_NICHE,
  FLOORS,
  FLOOR_ORDER,
  GRID,
  UNDERGROUND,
} from '../src/data/floors'
import {
  buffer,
  floorSection,
  footprint,
  gridToWorld,
  shaftPlans,
  shaftsAt,
  worldToGrid,
} from '../src/geometry/coords'
import { atriumBounds } from '../src/geometry/atrium'
import { contains, slabPlan } from '../src/geometry/planGeometry'
import type { GridBounds } from '../src/types/shelter'

function cells(b: GridBounds) {
  const keys: string[] = []
  for (let x = b.gx0; x <= b.gx1; x++) for (let z = b.gz0; z <= b.gz1; z++) keys.push(x + ',' + z)
  return keys
}
const room = (id: string) => defaultBlueprint.rooms.find((r) => r.id === id)!
const intersections = (a: GridBounds, b: GridBounds) =>
  a.gx0 <= b.gx1 && a.gx1 >= b.gx0 && a.gz0 <= b.gz1 && a.gz1 >= b.gz0

describe('v2 survey and room register', () => {
  it('round trips all cells and puts the edges on the surveyed boundaries', () => {
    expect(gridToWorld(0, 0, 'L1')).toEqual([-15, 0, -11])
    expect(gridToWorld(15, 11, 'B4')).toEqual([15, -22.8, 11])
    expect(footprint(FLOORS.B1.bounds)).toMatchObject({ x0: -16, x1: 16, z0: -12, z1: 12 })
    expect(worldToGrid(-16, -12)).toEqual({ gx: 0, gz: 0 })
    expect(worldToGrid(16, 12)).toEqual({ gx: 16, gz: 12 })
    for (let gx = 0; gx < GRID.columns; gx++)
      for (let gz = 0; gz < GRID.rows; gz++) {
        const [x, , z] = gridToWorld(gx, gz, 'L1')
        expect(worldToGrid(x, z)).toEqual({ gx, gz })
      }
  })
  it('keeps all six gross floor areas and both protective materials at the specified levels', () => {
    expect(FLOOR_ORDER.map((id) => FLOORS[id].elevation)).toEqual([4.4, 0, -10.2, -14.4, -18.6, -22.8])
    expect(FLOOR_ORDER.map((id) => footprint(FLOORS[id].bounds).area)).toEqual([384, 540, 768, 768, 768, 768])
    expect(buffer).toEqual({ bottom: -6, interfaceY: -1.8, top: -0.3 })
    expect(buffer.interfaceY - buffer.bottom).toBeCloseTo(4.2)
    expect(buffer.top - buffer.interfaceY).toBeCloseTo(1.5)
    expect(floorSection('L2').cap).toBeCloseTo(8.8)
    expect(floorSection('B1').cap).toBeCloseTo(buffer.bottom)
  })
  it.each(FLOOR_ORDER)('%s keeps the clear space, service zone and slab within its pitch', (id) => {
    const s = floorSection(id),
      surface = id.startsWith('L')
    expect(s.floor - s.slabBottom).toBeCloseTo(0.3)
    expect(s.ceiling - s.floor).toBeCloseTo(surface ? 3.6 : 3)
    expect(s.plenumTop - s.ceiling).toBeCloseTo(surface ? 0.5 : 0.9)
    expect(s.cap - s.plenumTop).toBeCloseTo(0.3)
  })
  it('reserves the surveyed shafts, the branch and service niche beside the main corridor', () => {
    expect(BRANCH_CORRIDOR).toEqual({ gx0: 10, gx1: 10, gz0: 2, gz1: 4 })
    expect(SERVICE_NICHE).toEqual({ gx0: 10, gx1: 10, gz0: 0, gz1: 1 })
    expect(CORRIDOR).toEqual({ gx0: 0, gx1: 13, gz0: 5, gz1: 5 })
    expect(
      shaftPlans.map((s) => [
        s.id,
        s.bounds.gx0,
        s.bounds.gx1,
        s.bounds.gz0,
        s.bounds.gz1,
        s.w,
        s.d,
        s.topFloor,
      ]),
    ).toEqual([
      ['wet', 4, 4, 3, 4, 2, 4, 'L1'],
      ['freight', 5, 6, 3, 4, 4, 4, 'L1'],
      ['personnel', 7, 8, 3, 4, 4, 4, 'L2'],
      ['electrical', 9, 9, 3, 4, 2, 4, 'L2'],
      ['escape', 14, 15, 5, 5, 4, 2, 'B1'],
    ])
    expect(shaftsAt(-23.1)).toEqual([])
    expect(shaftsAt(4.7)).toEqual([])
    expect(shaftPlans[3].x0 - shaftPlans[0].x1).toBe(8)
    expect(footprint(CORRIDOR)).toMatchObject({ w: 28, d: 2 })
  })
  it.each(UNDERGROUND)('%s assigns all 192 cells to exactly one owner', (id) => {
    const core = [
      ...cells(CORRIDOR),
      ...cells(BRANCH_CORRIDOR),
      ...cells(SERVICE_NICHE),
      ...shaftPlans.flatMap((s) => cells(s.bounds)),
    ]
    expect(core).toHaveLength(33)
    const owned = roomsOn(id).flatMap((r) => cells(r.bounds))
    expect(owned).toHaveLength(159)
    expect([...core, ...owned].sort()).toEqual(cells(FLOORS[id].bounds).sort())
  })
  it.each(['L1', 'L2'] as const)('%s is fully covered by gross room bounds', (id) => {
    expect(
      roomsOn(id)
        .flatMap((r) => cells(r.bounds))
        .sort(),
    ).toEqual(cells(FLOORS[id].bounds).sort())
  })
  it('aligns the four wet and four dry rooms and checks every wet footprint above electrical rooms', () => {
    const nw = { gx0: 0, gx1: 3, gz0: 0, gz1: 4 },
      ne = { gx0: 11, gx1: 15, gz0: 0, gz1: 4 }
    for (const id of ['b1_decon', 'b2_medical', 'b3_water', 'b4_drainage'])
      expect(room(id)).toMatchObject({ bounds: nw, wetDryZone: 'wet' })
    for (const id of ['b1_tactical', 'b2_command', 'b3_coldvault', 'b4_switchgear'])
      expect(room(id)).toMatchObject({ bounds: ne, wetDryZone: 'strict_dry_electrical' })
    for (const dry of defaultBlueprint.rooms.filter((r) => r.isDryElectricalZone))
      for (const other of defaultBlueprint.rooms.filter(
        (r) =>
          FLOORS[r.floorId].elevation > FLOORS[dry.floorId].elevation &&
          ['wet', 'semi_wet'].includes(r.wetDryZone),
      ))
        expect(intersections(other.wetBounds ?? other.bounds, dry.bounds), other.id + ' over ' + dry.id).toBe(
          false,
        )
  })
  it('locates the B2 raised ceilings, reserved atrium and quarters by the east stair', () => {
    expect(defaultBlueprint.rooms.filter((r) => r.clearHeightOverride === 3.6).map((r) => r.id)).toEqual([
      'b2_library',
      'b2_commons',
    ])
    const opening = room('b2_commons').atriumVoidToBelow!
    expect(footprint(opening)).toMatchObject({ w: 4, d: 6 })
    for (const id of ['b2_commons', 'b3_hydroponics'])
      expect(cells(opening).every((k) => cells(room(id).bounds).includes(k))).toBe(true)
    expect(room('b2_quarters').bounds.gz0).toBe(shaftPlans[4].bounds.gz1 + 1)
    expect(room('b2_quarters').bounds.gx1).toBe(15)
  })
  it('preserves the 27-room JSON model and module permissions', () => {
    expect(defaultBlueprint.rooms).toHaveLength(27)
    expect(new Set(defaultBlueprint.rooms.map((r) => r.id)).size).toBe(27)
    expect(defaultBlueprint.rooms.filter((r) => r.replaceable).map((r) => r.id)).toEqual([
      'b1_gym',
      'b2_library',
      'b3_foodproc',
      'b3_aquaponics',
    ])
    expect(defaultBlueprint.rooms.filter((r) => r.adjustable).map((r) => r.id)).toEqual([
      'b1_tactical',
      'b2_commons',
    ])
    expect(JSON.parse(JSON.stringify(defaultBlueprint))).toEqual(defaultBlueprint)
  })
  it('fits the six southern rooms on B1/B2, the bath buffer and the 10 + 4 beds', () => {
    const southern = UNDERGROUND.slice(0, 2).map((id) => roomsOn(id).filter((r) => r.bounds.gz0 === 6))
    expect(
      southern.map((f) => f.map((r) => [r.id, r.bounds.gx0, r.bounds.gx1, footprint(r.bounds).area])),
    ).toEqual([
      [
        ['b1_gym', 0, 3, 96],
        ['b1_workshop', 4, 7, 96],
        ['b1_warehouse', 8, 15, 192],
      ],
      [
        ['b2_commons', 0, 4, 120],
        ['b2_bath_laundry', 5, 6, 48],
        ['b2_quarters', 7, 15, 216],
      ],
    ])
    expect(room('b2_bath_laundry').wetDryZone).toBe('wet')
    const sleeping = room('b2_quarters').sleepingRooms!
    const capacity = (onCall: boolean) =>
      sleeping.filter((s) => s.onCall === onCall).reduce((sum, s) => sum + s.beds, 0)
    expect(capacity(false)).toBe(10)
    expect(capacity(true)).toBe(4)
    expect(sleeping.map((b) => [b.beds, Math.round((b.x1 - b.x0) * (b.z1 - b.z0))])).toEqual([
      ...Array(6).fill([1, 15]),
      [2, 17],
      [2, 17],
      [4, 19],
    ])
    for (const [i, a] of sleeping.entries()) {
      for (const b of sleeping.slice(i + 1))
        expect(a.x1 <= b.x0 || a.x0 >= b.x1 || a.z1 <= b.z0 || a.z0 >= b.z1, a.id + '/' + b.id).toBe(true)
    }
  })
  it('only specifies corridor glazing in the dining and ecological rooms', () => {
    expect(defaultBlueprint.rooms.filter((r) => r.corridorGlazing).map((r) => r.id)).toEqual([
      'b2_commons',
      'b3_hydroponics',
      'b3_aquaponics',
    ])
  })
  it.each([...FLOOR_ORDER, 'buffer'] as const)(
    'cuts only the shafts served and the B2 atrium at %s',
    (level) => {
      const id = level === 'buffer' ? 'B1' : level,
        y = level === 'buffer' ? -3 : FLOORS[id].elevation
      const plan = slabPlan(FLOORS[id].bounds, y)
      const active =
        level === 'L2'
          ? ['personnel', 'electrical']
          : level === 'L1' || level === 'buffer'
            ? ['personnel', 'electrical', 'wet', 'freight']
            : shaftPlans.map((s) => s.id)
      for (const key of cells(FLOORS[id].bounds)) {
        const [gx, gz] = key.split(',').map(Number),
          [x, , z] = gridToWorld(gx, gz, id)
        const concrete = plan.some(
          (poly) => contains(poly[0], x, z) && !poly.slice(1).some((r) => contains(r, x, z)),
        )
        expect(concrete, key).toBe(
          !shaftPlans.some((s) => active.includes(s.id) && cells(s.bounds).includes(key)) &&
            !(level === 'B2' && cells(atriumBounds).includes(key)),
        )
      }
    },
  )
})
