import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { constrainOrbitPose, constrainSite, flightSpeed, focusAlongRay } from '../src/scene/camera/siteNavigation'
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
  it('keeps the orbit target anchored when grazing terrain or walls during orbit', () => {
    const atlas = terrain(0.3),
      eyeOut = new Vector3(),
      targetOut = new Vector3()
    const pivot = new Vector3(0, 9, 0)
    const clamped = constrainOrbitPose(
      atlas,
      new Vector3(10, 12, 20),
      new Vector3(30, 2, 20),
      pivot,
      false,
      eyeOut,
      targetOut,
    )
    expect(clamped).toBe(true)
    expect(eyeOut.y - groundAt(atlas, eyeOut.x, eyeOut.z).height).toBeGreaterThanOrEqual(0.8)
    expect(targetOut).toEqual(pivot)
  })
  it('re-anchors the orbit pivot strictly along the camera optical axis without moving the camera', () => {
    const eye = new Vector3(-20, 12, 30)
    const forward = new Vector3(0.6, -0.2, -0.8).normalize()
    const target = focusAlongRay(eye, forward, 24, 120, 0)
    expect(target.distanceTo(eye)).toBeCloseTo(24, 5)
    expect(target.clone().sub(eye).normalize().dot(forward)).toBeCloseTo(1, 6)
    const skyFallback = focusAlongRay(eye, new Vector3(0, 0.4, -1).normalize(), null, 500, 0)
    expect(skyFallback.distanceTo(eye)).toBeLessThanOrEqual(80)
    expect(skyFallback.clone().sub(eye).normalize().dot(new Vector3(0, 0.4, -1).normalize())).toBeCloseTo(1, 6)
  })
  it('keeps B2 sliding leaves on the room side of the jamb throughout their travel', () => {
    const panels = doors.filter((d) => d.floor === 'B2' && d.trackOffset !== undefined)
    expect(panels.length).toBeGreaterThan(0)
    for (const door of panels) {
      expect(Math.abs(door.trackOffset!) - 0.075 / 2 - 0.21 / 2).toBeGreaterThan(0.01)
    }
  })
})
