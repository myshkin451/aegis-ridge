import { describe, expect, it } from 'vitest'
import { circadianAt, emergencyLighting, lighting, lightingRoomAt, roomLightingAt } from '../src/data/lighting'
import { reflectionRooms, reflectionRoomAt } from '../src/scene/atmosphere/roomEnvironment'
import { FLOORS } from '../src/data/floors'

describe('24-hour occupied-room lighting', () => {
  it('reaches 2200–5000 K with a gradual dawn, daytime plateau and evening fade', () => {
    expect(circadianAt('05:30').kelvin).toBe(2200)
    expect(circadianAt('12:00').kelvin).toBe(5000)
    expect(circadianAt('21:00').kelvin).toBe(2200)
    expect(circadianAt('09:00').kelvin).toBeGreaterThan(circadianAt('07:00').kelvin)
    expect(circadianAt('18:00').kelvin).toBeLessThan(circadianAt('16:00').kelvin)
    expect(roomLightingAt('b2_commons', '12:00', false)?.points[1].kelvin).toBe(5000)
  })
  it('switches the command desk to red and low bedroom lamps to amber over midnight', () => {
    for (const [time, night] of [['22:59', false], ['23:00', true], ['00:00', true], ['06:29', true], ['06:30', false]] as const) {
      expect(circadianAt(time).darkAdapt).toBe(night)
      expect(Boolean(roomLightingAt('b2_command', time, false)?.spot.spectrum)).toBe(night)
      const room = roomLightingAt('b2-single-1', time, false)!
      if (night) {
        expect(room.points[0].position[1]).toBeLessThan(0.25)
        expect(room.points[0].kelvin).toBe(1800)
        expect(room.spot.intensity).toBe(0)
      }
    }
  })
  it('supplies the grow racks for exactly 16 hours, with independent emergency circuits', () => {
    for (const [time, on] of [['11:59', true], ['12:00', false], ['19:59', false], ['20:00', true], ['00:00', true]] as const)
      expect(roomLightingAt('b3_hydroponics', time, false)!.areas.length > 0).toBe(on)
    for (const id of Object.keys(lighting))
      for (const time of ['00:00', '10:30', '19:30'])
        expect(roomLightingAt(id, time, true)).toBe(emergencyLighting[id])
  })
  it('aims the three pilot pairs from separate installed positions', () => {
    for (const id of ['b2-single-1', 'b2_commons', 'b2_bath_laundry']) {
      const preset = roomLightingAt(id, '19:30', false)!
      expect(preset.secondSpot!.position).not.toEqual(preset.spot.position)
      expect(preset.secondSpot!.target).not.toEqual(preset.spot.target)
    }
  })
  it('matches every probe to its occupied space and releases outdoor views to the sky', () => {
    expect(new Set(reflectionRooms.map((p) => p.id)).size).toBe(reflectionRooms.length)
    for (const p of reflectionRooms) {
      expect(lightingRoomAt(p.floor, p.x, p.z)).toBe(p.id)
      expect(reflectionRoomAt(p.floor, p.x, FLOORS[p.floor].elevation + 1.55, p.z)).toBe(p.id)
    }
    expect(reflectionRoomAt('L2', 4, 105, 6)).toBeUndefined()
    expect(reflectionRoomAt('B2', 55, -13, 0)).toBeUndefined()
  })
})
