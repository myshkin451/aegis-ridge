import { expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from 'three'
import { FLOORS } from '../src/data/floors'
import { adits } from '../src/data/siteFacilities'
import { doors } from '../src/geometry/doors'
import { defaultBox, moveFace, rulerFraction } from '../src/geometry/viewGeometry'
import { stairRun } from '../src/geometry/stairs'
import { appendSolids, positionGeometry } from '../src/scene/utils/solidGeometry'
import { morphProjection } from '../src/scene/camera/projection'
import { WALK, WalkCollision } from '../src/scene/camera/walkCollision'
import type { Point3 } from '../src/types/shelter'
import { useShelterStore as store } from '../src/store/useShelterStore'

function world(boxes: { centre: Point3; size: Point3 }[]) {
  const group = new Group(),
    coords: number[] = []
  for (const box of boxes) {
    const m = new Mesh(new BoxGeometry(...box.size))
    m.position.set(...box.centre)
    group.add(m)
  }
  appendSolids(group, coords, () => true)
  group.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose()
      o.material.dispose()
    }
  })
  return new WalkCollision(positionGeometry(coords))
}
it('measures the 6 m buffer and 4.2 m storeys on one ruler and snaps all six box faces without inversions', () => {
  expect((rulerFraction(-6) - rulerFraction(0)) / (rulerFraction(-14.4) - rulerFraction(-10.2))).toBeCloseTo(
    6 / 4.2,
  )
  for (const [a, b] of [
    ['east', 'west'],
    ['north', 'south'],
    ['west', 'east'],
    ['south', 'north'],
    ['top', 'bottom'],
    ['bottom', 'top'],
  ] as const) {
    expect(Math.abs(moveFace(defaultBox, a, defaultBox[b])[a] - defaultBox[b])).toBeCloseTo(0.3)
  }
  expect(moveFace(defaultBox, 'top', -14.29).top).toBeCloseTo(-14.4)
  expect(moveFace(defaultBox, 'east', 8.18).east).toBe(8)
})
it('restores the study camera, floor and local section independently of previous studies', () => {
  store.setState(store.getInitialState())
  store.getState().photograph('shot-05')
  expect(store.getState()).toMatchObject({ floor: 'B3', cameraState: 'walkthrough', time: '21:30' })
  store.getState().setView('plan')
  store.getState().setCutHeight(140)
  expect(store.getState().cutHeight).toBeLessThan(FLOORS.B3.pitch)
  store.getState().toggleLayer('water')
  store.getState().photograph('shot-03')
  store.getState().photograph('shot-01')
  expect(store.getState()).toMatchObject({
    floor: 'ALL',
    cold: false,
    sectionPerspective: false,
    sectionZ: -3.75,
    cutHeight: 1.2,
    lastFloor: 'B2',
    layers: { water: true },
  })
})
it('slides beside a wall, stops at the edge of a slab and respects a pressure door until it opens', () => {
  const room = world([
    { centre: [0, -0.1, 0], size: [10, 0.2, 10] },
    { centre: [1, 1, 0], size: [0.1, 2, 8] },
  ])
  const p = new Vector3(0, 0, 0)
  room.move(p, 2, 1)
  expect(p.x).toBeLessThan(0.71)
  expect(p.z).toBeGreaterThan(0.9)
  room.move(p, 0, 8)
  expect(p.z).toBeLessThanOrEqual(5.001)
  const door = { ...doors[0], base: [0, 0, 0] as Point3, yaw: 0 },
    open = new Map([[door.id, 1]])
  p.set(0, 0, -1)
  room.move(p, 0, 2, [door])
  expect(p.z).toBeLessThan(-WALK.radius)
  room.move(p, 0, 2, [door], open)
  expect(p.z).toBeGreaterThan(1)
  room.dispose()
})
it.each(['personnel', 'escape'] as const)(
  'walks up and down the rendered %s tread sequence without jumping between flights',
  (kind) => {
    const run = stairRun(kind, 'B4')!,
      w = world(run.plates)
    const points = run.plates.map((p) => new Vector3(p.centre[0], p.centre[1] + p.size[1] / 2, p.centre[2]))
    const feet = points[0].clone()
    for (const waypoints of [points, points.slice().reverse()]) {
      for (const point of waypoints) {
        w.move(feet, point.x - feet.x, point.z - feet.z)
        expect(feet.distanceTo(point)).toBeLessThan(0.03)
      }
    }
    w.dispose()
  },
)
it('places both portal locks at the floor and bearing of the actual bore discharge', () => {
  for (const b of Object.values(adits)) {
    const d = doors.find((d) => d.id === b.id + '-portal')!,
      p = b.points.at(-1)!,
      a = b.points.at(-2)!
    expect(d.base).toEqual(p)
    expect(d.floor).toBe(b.floor)
    expect(d.yaw).toBeCloseTo(Math.atan2(p[0] - a[0], p[2] - a[2]))
  }
})

it('keeps metre scale on the focal plane and maps the near and far clip planes throughout the projection change', () => {
  const camera = new PerspectiveCamera(45, 1.6, 0.07, 16000),
    height = 38,
    aspect = 1.6,
    focus = 110
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    morphProjection(camera, height, aspect, focus, fraction)
    const p = new Vector3(4, 6, -focus).applyMatrix4(camera.projectionMatrix)
    expect(p.x).toBeCloseTo(8 / (height * aspect))
    expect(p.y).toBeCloseTo(12 / height)
    expect(new Vector3(0, 0, -camera.near).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(-1)
    expect(new Vector3(0, 0, -camera.far).applyMatrix4(camera.projectionMatrix).z).toBeCloseTo(1)
  }
})
