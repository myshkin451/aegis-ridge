import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { constrainSite, flightSpeed } from '../src/scene/camera/siteNavigation'
import { groundAt, type TerrainAtlas } from '../src/geometry/siteElevations'
import { doors } from '../src/geometry/doors'

// A one-metre survey lattice with a rising west-to-east grade, decoded exactly like a deployed tile.
function terrain(grade = 0): TerrainAtlas {
  const n = 101,
    bytes = new Uint8Array(n * n * 6)
  const view = new DataView(bytes.buffer)
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) view.setUint16((z * n + x) * 6, 16384 + Math.round(grade * x * 32), true)
  return {
    tiles: [{ id: 'survey', cx: 0, cz: 0, span: 100, n, step: 1, file: '', sha256: '', bytes }],
    insets: [],
    road: [],
  }
}
describe('现场相机', () => {
  it('sweeps through a large dolly step and retains sliding motion at the station facade', () => {
    const atlas = terrain(),
      eye = new Vector3()
    constrainSite(atlas, new Vector3(-34, 2, 0), new Vector3(35, 2, 5), eye)
    expect(eye.x).toBeCloseTo(-16.95)
    expect(eye.z).toBeCloseTo(5)
    constrainSite(atlas, new Vector3(0, 29, 0), new Vector3(0, -19, 0), eye)
    expect(eye.y).toBeCloseTo(9.6)
  })
  it('keeps the lens above a sloping triangle when translating and descending together', () => {
    const atlas = terrain(0.25),
      eye = new Vector3()
    constrainSite(atlas, new Vector3(-45, 3, 30), new Vector3(39, -25, 30), eye)
    expect(eye.x).toBeCloseTo(39)
    expect(eye.y - groundAt(atlas, eye.x, eye.z).height).toBeGreaterThanOrEqual(0.8)
    expect(flightSpeed(1)).toBe(6)
    expect(flightSpeed(120)).toBeGreaterThan(40)
    expect(flightSpeed(1000)).toBeLessThanOrEqual(80)
  })
  it('keeps B2 sliding leaves on the room side of the jamb throughout their travel', () => {
    const panels = doors.filter((d) => d.floor === 'B2' && d.trackOffset !== undefined)
    expect(panels.length).toBeGreaterThan(0)
    for (const door of panels) {
      expect(Math.abs(door.trackOffset!) - 0.075 / 2 - 0.21 / 2).toBeGreaterThan(0.01)
    }
  })
})
