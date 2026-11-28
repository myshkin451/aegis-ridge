import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeViewLink, encodeViewLink, type CameraPose, type SavedView } from '../src/data/viewLink'
import { FLOORS } from '../src/data/floors'
import { WALK_EYE_HEIGHT } from '../src/geometry/coords'
import { elevatorBank, setElevatorRider } from '../src/store/useElevatorRide'
import { defaultBox } from '../src/geometry/viewGeometry'
import { createViewLink, initializeViewSession, useShareNotice } from '../src/store/viewSession'
import { bindCameraReader, takeRestoredPose } from '../src/store/sharedCamera'
import { useOperationsStore as operations } from '../src/store/useOperationsStore'
import { useShelterStore as shelter } from '../src/store/useShelterStore'

const origin = 'https://example.test/ars/?quality=4'
const settings = { scenario: 'fallout' as const, people: 7, time: '23:17', lockdownSeconds: 30 }
const pose: CameraPose = { projection: 'orthographic', eye: [0.31, 140.55, 0.8001],
  target: [0.31, -10.14, 0.80], height: 36, zoom: 1.8325 }
const plan: SavedView = {
  cameraState: 'plan', lastFloor: 'B1', floor: 'B1', mode: 'cutaway', preset: 'surface', shot: null,
  sectionZ: -3.75, cutHeight: 1.3, orbitCut: false, sectionPerspective: false, box: defaultBox,
  roomId: 'b1_gym', facilityId: null, plenum: true, walkCeiling: true,
  pose,
}

describe('shared camera documents', () => {
  it('retains exact coordinates, orthographic zoom, cut bounds, plant state and existing URL options', () => {
    const snapshot = { settings, view: plan }, href = encodeViewLink(origin, snapshot)
    expect(new URL(href).searchParams.get('quality')).toBe('4')
    expect(decodeViewLink(href)).toEqual(snapshot)
    expect(decodeViewLink(origin)).toBeNull()
    expect(() => decodeViewLink(href + '&ars={}')).toThrow(/重复/)
  })
  it('round-trips a walkthrough eye and a non-preset bearing and field of view', () => {
    const view: SavedView = { ...plan, cameraState: 'walkthrough', pose: { eye: [-8, -8.55, 2],
      target: [-7.302, -8.352, 2.687], zoom: 1, projection: 'perspective', fov: 68 } }
    expect(decodeViewLink(encodeViewLink(origin, { settings, view }))?.view).toEqual(view)
  })
  it.each([
    { pose: { ...pose, eye: [0, 0] } }, { pose: { ...pose, zoom: -1 } },
    { pose: { ...pose, target: pose.eye } }, { pose: { ...pose, projection: 'perspective' } },
    { cutHeight: 9 }, { floor: 'ALL' }, { box: { ...defaultBox, east: -25 } }, { cameraState: 'unknown' },
  ])('rejects a malformed view without partially restoring it', invalid => {
    const url = new URL(origin)
    url.searchParams.set('ars', JSON.stringify({ settings, view: { ...plan, ...invalid } }))
    expect(() => decodeViewLink(url.href)).toThrow()
  })
})

describe('view session persistence', () => {
  let cleanup: (() => void) | undefined
  function browser(href = origin) {
    const values = new Map<string, string>()
    vi.stubGlobal('location', new URL(href))
    vi.stubGlobal('history', { replaceState: (_: unknown, __: string, next: URL) => vi.stubGlobal('location', next) })
    vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) })
    return values
  }
  afterEach(() => {
    cleanup?.()
    shelter.setState(shelter.getInitialState(), true)
    operations.setState(operations.getInitialState(), true)
    vi.unstubAllGlobals()
  })
  it('gives the URL first priority, stages the actual camera pose and keeps local edits through reload', async () => {
    const values = browser(encodeViewLink(origin, { settings, view: plan }))
    cleanup = initializeViewSession()
    expect(operations.getState()).toMatchObject({ scenario: settings.scenario, people: settings.people, lockdownSeconds: settings.lockdownSeconds })
    expect(takeRestoredPose(shelter.getState().cameraRevision)).toEqual(pose)
    const release = bindCameraReader(() => pose)
    try { expect(decodeViewLink(createViewLink())).toEqual({ settings, view: plan }) }
    finally { release() }
    operations.getState().setPeople(6)
    await Promise.resolve()
    expect(new URL(location.href).searchParams.has('ars')).toBe(false)
    cleanup()
    operations.setState(operations.getInitialState(), true)
    cleanup = initializeViewSession()
    expect(operations.getState().people).toBe(6)
    expect(JSON.parse(values.get('ars-fortress-settings-v3')!)).toMatchObject({ ...settings, people: 6 })
  })
  it.each([false, true])('reopens a shared passenger cabin on a supported deck (in transit: %s)', moving => {
    browser()
    const car = elevatorBank.cars.passenger
    car.restoreParked('L2')
    shelter.setState({ cameraState: 'walkthrough', mode: 'cutaway', floor: 'L2', lastFloor: 'L2', shot: null })
    if (moving) {
      car.request('B4')
      for (let i = 0; i < 150; i++) car.tick(1 / 60)
      expect(car.phase).toBe('moving')
    }
    setElevatorRider('passenger')
    const { x, z } = car.spec, y = car.elevation + WALK_EYE_HEIGHT
    const release = bindCameraReader(() => ({ eye: [x, y, z], target: [x + 0.4, y + 0.2, z - 0.8],
      zoom: 1, projection: 'perspective', fov: 68 }))
    try {
      const receipt = vi.fn(), url = createViewLink(receipt), floor = moving ? 'B4' : 'L2'
      expect(receipt.mock.calls).toEqual(moving ? [['B4']] : [])
      car.restoreParked('B2')
      setElevatorRider(null)
      browser(url)
      cleanup = initializeViewSession()
      const saved = takeRestoredPose(shelter.getState().cameraRevision)!
      const [sx, sy, sz] = saved.eye
      expect(shelter.getState().lastFloor).toBe(floor)
      expect(car.stop).toBe(floor)
      expect(car.phase).toBe('open')
      expect(elevatorBank.supportAt(sx, sy - WALK_EYE_HEIGHT, sz, 0.01)).toBe(FLOORS[floor].elevation)
      expect(saved.target[1] - sy).toBeCloseTo(0.2)
      expect(saved.target[0] - sx).toBeCloseTo(0.4)
      expect(saved.target[2] - sz).toBeCloseTo(-0.8)
    } finally { release(); car.restoreParked(car.spec.initial); setElevatorRider(null) }
  })
  it('reads the camera and operating state from a saved v2 link', () => {
    const url = new URL(origin)
    url.searchParams.set('ars', JSON.stringify({
      blueprint: { ...settings, version: '2.0', people: 14, roomChanges: { b1_gym: 'listening-room' }, isolatedId: 'archive' },
      view: { ...plan, routeOverview: false, layers: { power: true, data: true, water: true, air: true, freight: true, structure: true } },
    }))
    browser(url.href)
    cleanup = initializeViewSession()
    expect(operations.getState().people).toBe(8)
    expect(shelter.getState().time).toBe(settings.time)
    expect(takeRestoredPose(shelter.getState().cameraRevision)).toEqual(pose)
  })
  it('uses the local settings after an invalid URL and reports the damaged document', () => {
    const values = browser(origin + '&ars=oops')
    values.set('ars-fortress-settings-v3', JSON.stringify(settings))
    cleanup = initializeViewSession()
    expect(operations.getState()).toMatchObject({ scenario: settings.scenario, people: settings.people, lockdownSeconds: settings.lockdownSeconds })
    expect(useShareNotice.getState().message).toContain('JSON 语法错误')
  })
})
