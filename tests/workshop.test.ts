import { describe, expect, it } from 'vitest'
import { defaultBlueprint } from '../src/data/defaultBlueprint'
import { footprint } from '../src/geometry/coords'
import { doors } from '../src/geometry/doors'
import { bedrooms, type PlanRect } from '../src/geometry/residentialPlan'

const shop = defaultBlueprint.rooms.find((r) => r.id === 'b1_workshop')!
const bay = footprint(shop.bounds)
const units = shop.equipment.map(({ tagCode, position: [x, y, z], moduleSizeM: [w, , d] }) => ({
  tagCode,
  x,
  y,
  z,
  x0: x - w / 2,
  x1: x + w / 2,
  z0: z - d / 2,
  z1: z + d / 2,
}))
const cnc = units.find((u) => u.tagCode === 'CNC-142')!
const rec = units.find((u) => u.tagCode === 'REC-141')!
const rail = units.find((u) => u.tagCode === 'RAI-145')!
const machines = units.filter((u) => u.y === 0)
const overlaps = (a: PlanRect, b: PlanRect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0

describe('B1 workshop as installed', () => {
  it.each([cnc, rec])('$tagCode clears every sleeping room by at least the specified west setback', (u) => {
    expect(u.x1).toBeLessThanOrEqual(-2.5)
    for (const bedroom of bedrooms) expect(overlaps(u, bedroom), bedroom.id).toBe(false)
  })

  it('keeps installation envelopes separate and leaves working clearance to finished walls and other machines', () => {
    for (const [i, u] of units.entries()) {
      for (const other of units.slice(i + 1))
        expect(overlaps(u, other), u.tagCode + '/' + other.tagCode).toBe(false)
    }
    for (const u of machines) {
      const workspace = { x0: u.x0 - 0.6, x1: u.x1 + 0.6, z0: u.z0 - (u === cnc ? 1 : 0.6), z1: u.z1 + 0.6 }
      const halfWall = 0.075
      expect(workspace.x0).toBeGreaterThanOrEqual(bay.x0 + halfWall)
      expect(workspace.x1).toBeLessThanOrEqual(bay.x1 - halfWall)
      expect(workspace.z0).toBeGreaterThanOrEqual(bay.z0 + halfWall)
      expect(workspace.z1).toBeLessThanOrEqual(bay.z1 - halfWall)
      expect(
        machines.some((other) => other !== u && overlaps(workspace, other)),
        u.tagCode,
      ).toBe(false)
    }
  })

  it('admits a continuous 0.90 m wide cart from the corridor door to every work face and the hoist handoff', () => {
    const door = doors.find((d) => d.id === shop.id)!
    const radius = 0.45
    const laneX = door.base[0] + 0.35
    expect(Math.abs(laneX - door.base[0]) + radius + 0.04).toBeLessThan(door.width / 2)
    type Point = [number, number]
    function swept(a: Point, b: Point) {
      expect(a[0] === b[0] || a[1] === b[1]).toBe(true)
      const strip = {
        x0: Math.min(a[0], b[0]) - radius,
        x1: Math.max(a[0], b[0]) + radius,
        z0: Math.min(a[1], b[1]) - radius,
        z1: Math.max(a[1], b[1]) + radius,
      }
      expect(
        machines.some((u) => overlaps(strip, u)),
        JSON.stringify(strip),
      ).toBe(false)
      expect(strip.x0).toBeGreaterThan(bay.x0 + 0.075)
      expect(strip.x1).toBeLessThan(bay.x1 - 0.075)
      expect(strip.z1).toBeLessThan(bay.z1 - 0.075)
    }
    const receiving: Point = [laneX, rail.z]
    swept([laneX, door.base[2]], receiving)
    expect(rail.y).toBeGreaterThan(2)
    for (const u of [cnc, rec]) {
      const handoff: Point = [u.x, rail.z]
      expect(Math.min(laneX, u.x) - radius).toBeGreaterThan(rail.x0)
      expect(Math.max(laneX, u.x) + radius).toBeLessThan(rail.x1)
      swept(receiving, handoff)
      swept(handoff, [u.x, u === cnc ? u.z0 - radius - 0.01 : u.z1 + radius + 0.01])
    }
    // Reach the two rear benches down the open east side, then turn across their shared front aisle.
    const eastX = -2.7
    swept(receiving, [eastX, rail.z])
    const rear = machines.filter((u) => u !== cnc && u !== rec)
    const aisleZ = Math.min(...rear.map((u) => u.z0)) - radius - 0.01
    swept([eastX, rail.z], [eastX, aisleZ])
    for (const u of rear) {
      swept([eastX, aisleZ], [u.x, aisleZ])
      swept([u.x, aisleZ], [u.x, u.z0 - radius - 0.01])
    }
  })
})
