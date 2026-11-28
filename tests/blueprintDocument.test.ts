import { afterEach, describe, expect, it, vi } from 'vitest'
import schema from '../public/blueprint.schema.json'
import {
  baselineDocument, decodeViewLink, encodeViewLink, parseBlueprintJson, serializeBlueprint,
  type CameraPose, type SavedView,
} from '../src/data/blueprintDocument'
import { roomTemplates } from '../src/data/roomTemplates'
import { stationAtlas, stationNetwork } from '../src/engine/__tests__/networkFixture'
import { defaultBox } from '../src/geometry/viewGeometry'
import { blueprintStorageKey, createViewLink, exportBlueprintJson, importBlueprintJson,
  initializeBlueprintSession, resetBlueprint, useBlueprintNotice } from '../src/store/blueprintSession'
import { bindCameraReader, takeRestoredPose } from '../src/store/sharedCamera'
import { useOperationsStore as operations } from '../src/store/useOperationsStore'
import { useShelterStore as shelter } from '../src/store/useShelterStore'

const origin = 'https://example.test/ars/?quality=4'
const prototype = { ...baselineDocument, scenario: 'fallout' as const, people: 14,
  roomChanges: { b1_gym: 'listening-room' }, time: '23:17', lockdownSeconds: 30, isolatedId: 'AV-B1-GYM' }
const pose: CameraPose = { projection: 'orthographic', eye: [0.31, 140.55, 0.8001],
  target: [0.31, -10.14, 0.80], height: 36, zoom: 1.8325 }
const plan: SavedView = {
  cameraState: 'plan', lastFloor: 'B1', floor: 'B1', mode: 'cutaway', preset: 'surface', shot: null,
  sectionZ: -3.75, cutHeight: 1.3, orbitCut: false, sectionPerspective: false, box: defaultBox,
  roomId: 'b1_gym', facilityId: null, plenum: true, walkCeiling: true, routeOverview: false,
  layers: { power: true, data: true, water: false, air: false, freight: false, structure: true }, pose,
}

describe('v2.0 engineering document validation', () => {
  it('round-trips a modified occupied, sealed and isolated project', () => {
    expect(parseBlueprintJson(serializeBlueprint(prototype))).toEqual(prototype)
  })
  it('publishes the exact same room and template whitelist as the validator', () => {
    const matrix: Record<string, string[]> = {}
    for (const template of roomTemplates) {
      for (const id of [...template.roomIds, ...template.trialRoomIds])
        (matrix[id] ??= []).push(template.id)
    }
    const catalog = Object.fromEntries(Object.entries(schema.properties.roomChanges.properties)
      .map(([id, rule]) => [id, 'const' in rule ? [rule.const] : rule.enum]))
    expect(catalog).toEqual(matrix)
    expect([...schema.required].sort()).toEqual(Object.keys(baselineDocument).sort())
  })
  it.each([
    ['bad syntax', 'not JSON'], ['null root', 'null'], ['array root', '[]'], ['missing fields', '{}'],
    ['unsupported version', { ...baselineDocument, version: '2.1' }],
    ['fractional occupancy', { ...baselineDocument, people: 8.5 }], ['numeric string', { ...baselineDocument, people: '10' }],
    ['too few', { ...baselineDocument, people: 4 }], ['too many', { ...baselineDocument, people: 15 }],
    ['bad hour', { ...baselineDocument, time: '24:00' }], ['bad minutes', { ...baselineDocument, time: '00:60' }],
    ['unsupported scenario', { ...baselineDocument, scenario: 'snow' }],
    ['extra field', { ...baselineDocument, elevation: 3 }], ['protected surface', { ...baselineDocument, roomChanges: { l2_greenhouse: 'listening-room' } }],
    ['dry corridor', { ...baselineDocument, roomChanges: { 'north-branch': 'battery-bank' } }],
    ['unknown template', { ...baselineDocument, roomChanges: { b1_gym: 'storm' } }],
    ['wrong isolation type', { ...baselineDocument, isolatedId: 2 }],
    ['impossible lockdown', { ...baselineDocument, lockdownSeconds: 3 }],
    ['bad countdown', { ...prototype, lockdownSeconds: -1 }], ['oversized', ' '.repeat(65537)],
  ])('rejects %s', (_, value) => {
    expect(() => parseBlueprintJson(typeof value === 'string' ? value : JSON.stringify(value))).toThrow()
  })
})

describe('shared camera documents', () => {
  it('retains exact coordinates, orthographic zoom, cut bounds, plant state and existing URL options', () => {
    const snapshot = { blueprint: prototype, view: plan }, href = encodeViewLink(origin, snapshot)
    expect(new URL(href).searchParams.get('quality')).toBe('4')
    expect(decodeViewLink(href)).toEqual(snapshot)
    expect(decodeViewLink(origin)).toBeNull()
    expect(() => decodeViewLink(href + '&ars={}')).toThrow(/重复/)
  })
  it('round-trips a walkthrough eye and a non-preset bearing and field of view', () => {
    const view: SavedView = { ...plan, cameraState: 'walkthrough', pose: { eye: [-8, -8.55, 2],
      target: [-7.302, -8.352, 2.687], zoom: 1, projection: 'perspective', fov: 68 } }
    expect(decodeViewLink(encodeViewLink(origin, { blueprint: prototype, view }))?.view).toEqual(view)
  })
  it.each([
    { pose: { ...pose, eye: [0, 0] } }, { pose: { ...pose, zoom: -1 } },
    { pose: { ...pose, target: pose.eye } }, { pose: { ...pose, projection: 'perspective' } },
    { cutHeight: 9 }, { floor: 'ALL' }, { box: { ...defaultBox, east: -25 } }, { cameraState: 'unknown' },
  ])('rejects a malformed view without partially restoring it', invalid => {
    const url = new URL(origin)
    url.searchParams.set('ars', JSON.stringify({ blueprint: prototype, view: { ...plan, ...invalid } }))
    expect(() => decodeViewLink(url.href)).toThrow()
  })
})

describe('blueprint session persistence', () => {
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
  it('restores a module and its own isolated unit; rejects absent equipment and unknown branches atomically', () => {
    browser()
    cleanup = initializeBlueprintSession(stationAtlas)
    shelter.getState().setMepNetwork(stationNetwork)
    importBlueprintJson(JSON.stringify(prototype))
    expect(operations.getState().report.maintenance?.id).toBe(prototype.isolatedId)
    expect(parseBlueprintJson(exportBlueprintJson())).toEqual(prototype)
    for (const isolatedId of ['AV-B1-GYM', 'AC-B4-999']) {
      expect(() => importBlueprintJson(JSON.stringify({ ...baselineDocument, isolatedId }))).toThrow(/isolatedId/)
      expect(parseBlueprintJson(exportBlueprintJson())).toEqual(prototype)
    }
    const edge = stationNetwork.edges[0].id
    importBlueprintJson(JSON.stringify({ ...baselineDocument, isolatedId: edge }))
    expect(operations.getState().report.maintenance?.id).toBe(edge)
  })
  it('gives the URL first priority, stages the actual camera pose and keeps local edits through reload', async () => {
    const values = browser(encodeViewLink(origin, { blueprint: prototype, view: plan }))
    values.set(blueprintStorageKey, JSON.stringify(baselineDocument))
    cleanup = initializeBlueprintSession(stationAtlas)
    expect(parseBlueprintJson(exportBlueprintJson())).toEqual(prototype)
    expect(takeRestoredPose(shelter.getState().cameraRevision)).toEqual(pose)
    const release = bindCameraReader(() => pose)
    try { expect(decodeViewLink(createViewLink())).toEqual({ blueprint: prototype, view: plan }) }
    finally { release() }
    operations.getState().setPeople(12)
    await Promise.resolve()
    expect(new URL(location.href).searchParams.has('ars')).toBe(false)
    cleanup()
    operations.setState(operations.getInitialState(), true)
    cleanup = initializeBlueprintSession(stationAtlas)
    expect(parseBlueprintJson(exportBlueprintJson())).toEqual({ ...prototype, people: 12 })
    resetBlueprint()
    expect(parseBlueprintJson(values.get(blueprintStorageKey)!)).toEqual(baselineDocument)
    expect(shelter.getState()).toMatchObject({ floor: 'ALL', cameraState: 'site' })
  })
  it('uses the local design after an invalid URL and reports the damaged document', () => {
    const values = browser(origin + '&ars=oops')
    values.set(blueprintStorageKey, JSON.stringify(prototype))
    cleanup = initializeBlueprintSession(stationAtlas)
    expect(parseBlueprintJson(exportBlueprintJson())).toEqual(prototype)
    expect(useBlueprintNotice.getState().message).toContain('JSON 语法错误')
  })
})
