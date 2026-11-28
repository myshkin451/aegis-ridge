import { FLOORS, FLOOR_ORDER } from './floors'
import { photographs, type ShotId } from './photographs'
import { validateRoomChanges, type RoomChanges } from './roomTemplates'
import { boxLimits, type SectionBounds } from '../geometry/viewGeometry'
import type { CameraPreset, CameraStateId, FloorId, FloorSelection, Point3, ViewMode } from '../types/shelter'
import type { Scenario } from '../store/useOperationsStore'
import type { SystemId } from '../store/useShelterStore'

export const blueprintSizeLimit = 64 * 1024
export const viewParameter = 'ars'
export interface BlueprintDocument {
  version: '2.0'
  roomChanges: RoomChanges
  scenario: Scenario
  people: number
  time: string
  isolatedId: string | null
  lockdownSeconds: number
}
export const baselineDocument: BlueprintDocument = {
  version: '2.0', roomChanges: {}, scenario: 'normal', people: 10, time: '07:40', isolatedId: null, lockdownSeconds: 0,
}

export type CameraPose = { eye: Point3; target: Point3; zoom: number } & (
  { projection: 'perspective'; fov: number } | { projection: 'orthographic'; height: number }
)
export interface SavedView {
  cameraState: CameraStateId
  mode: ViewMode
  preset: CameraPreset
  floor: FloorSelection
  lastFloor: FloorId
  shot: ShotId | null
  facilityId: number | null
  roomId: string | null
  sectionZ: number
  cutHeight: number
  sectionPerspective: boolean
  orbitCut: boolean
  plenum: boolean
  walkCeiling: boolean
  routeOverview: boolean
  layers: Record<SystemId, boolean>
  box: SectionBounds
  pose: CameraPose
}
export interface ViewLink { blueprint: BlueprintDocument; view: SavedView }

function fail(path: string, expected: string): never {
  throw new Error(path + '：' + expected)
}
function fields(value: unknown, expected: string[], path: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '须为 JSON 对象')
  const record = value as Record<string, unknown>
  for (const key of expected) if (!Object.hasOwn(record, key)) fail(path, '缺少字段 ' + key)
  for (const key of Object.keys(record)) if (!expected.includes(key)) fail(path, '不支持字段 ' + key)
  return record
}
function choice<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail(path, '可选值为 ' + allowed.join('、'))
  return value as T
}
function numberIn(value: unknown, low: number, high: number, path: string, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high ||
      (integer && !Number.isInteger(value))) fail(path, '须为 ' + low + ' 至 ' + high + (integer ? ' 的整数' : ' 的有限数值'))
  return value
}
function flag(value: unknown, path: string) {
  if (typeof value !== 'boolean') fail(path, '须为 true 或 false')
  return value
}
function nullableId(value: unknown, path: string) {
  if (value === null) return null
  if (typeof value !== 'string' || !value.length || value.length > 128) fail(path, '须为有效位号或 null')
  return value
}
function readJson(text: string) {
  if (typeof text !== 'string' || text.length > blueprintSizeLimit ||
      new TextEncoder().encode(text).length > blueprintSizeLimit) fail('文档大小', '上限为 64 KiB')
  try { return JSON.parse(text) as unknown }
  catch { return fail('JSON 语法错误', '请检查引号、逗号与括号') }
}

function validateBlueprint(value: unknown): BlueprintDocument {
  const b = fields(value, Object.keys(baselineDocument), '工程蓝图')
  if (b.version !== '2.0') fail('version', '仅支持 v2.0 蓝图')
  if (typeof b.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) fail('time', '须为 24 小时时刻 HH:mm')
  const scenario = choice(b.scenario, ['normal', 'cryo', 'bio', 'fallout'] as const, 'scenario')
  const lockdownSeconds = numberIn(b.lockdownSeconds, 0, 30, 'lockdownSeconds', true)
  if (lockdownSeconds && (scenario === 'normal' || scenario === 'cryo')) fail('lockdownSeconds', '当前情景没有封锁进度')
  return {
    version: '2.0', roomChanges: validateRoomChanges(b.roomChanges), scenario,
    people: numberIn(b.people, 5, 14, 'people', true), time: b.time,
    isolatedId: nullableId(b.isolatedId, 'isolatedId'), lockdownSeconds,
  }
}
export function parseBlueprintJson(source: string) { return validateBlueprint(readJson(source)) }
export function serializeBlueprint(document: BlueprintDocument) {
  return JSON.stringify(validateBlueprint(document), null, 2)
}
function point(value: unknown, path: string): Point3 {
  if (!Array.isArray(value) || value.length !== 3) fail(path, '须为三个世界坐标（米）')
  return value.map(n => numberIn(n, -30000, 30000, path)) as Point3
}
function cameraPose(value: unknown, ortho: boolean): CameraPose {
  const v = fields(value, ['projection', 'eye', 'target', 'zoom', ortho ? 'height' : 'fov'], 'pose')
  const eye = point(v.eye, 'pose.eye'), target = point(v.target, 'pose.target')
  if (Math.hypot(...eye.map((n, i) => n - target[i])) < 0.001) fail('pose.target', '视点与目标重合')
  const zoom = numberIn(v.zoom, 0.1, 26, 'pose.zoom')
  if (v.projection !== (ortho ? 'orthographic' : 'perspective')) fail('pose.projection', '投影与当前相机不一致')
  return ortho
    ? { eye, target, zoom, projection: 'orthographic', height: numberIn(v.height, 0.01, 30000, 'pose.height') }
    : { eye, target, zoom, projection: 'perspective', fov: numberIn(v.fov, 1, 150, 'pose.fov') }
}
const systemIds = ['power', 'data', 'water', 'air', 'freight', 'structure'] as const
const viewFields = [
  'cameraState', 'mode', 'preset', 'floor', 'lastFloor', 'shot', 'roomId', 'facilityId', 'sectionZ', 'cutHeight',
  'sectionPerspective', 'orbitCut', 'plenum', 'walkCeiling', 'routeOverview', 'layers', 'box', 'pose',
]
function validateView(value: unknown): SavedView {
  const v = fields(value, viewFields, '视角')
  const cameraState = choice(v.cameraState, ['site', 'section', 'sectionBox', 'plan', 'floorOrbit', 'walkthrough'] as const, 'cameraState')
  const lastFloor = choice(v.lastFloor, FLOOR_ORDER, 'lastFloor')
  const floor = choice(v.floor, [...FLOOR_ORDER, 'ALL'] as const, 'floor')
  const whole = ['site', 'section', 'sectionBox'].includes(cameraState)
  if (floor !== (whole ? 'ALL' : lastFloor)) fail('floor', '所选楼层与相机类型不符')
  const box = {} as SectionBounds
  const limits = fields(v.box, Object.keys(boxLimits), 'box')
  for (const [low, high] of [['west', 'east'], ['bottom', 'top'], ['north', 'south']] as const) {
    box[low] = numberIn(limits[low], boxLimits[low], boxLimits[high], 'box.' + low)
    box[high] = numberIn(limits[high], boxLimits[low], boxLimits[high], 'box.' + high)
    if (box[high] - box[low] < 0.3 - 1e-8) fail('box.' + high, '相对剖切面净距须至少 0.3 m')
  }
  const layerData = fields(v.layers, [...systemIds], 'layers')
  const layers = Object.fromEntries(systemIds.map(id => [id, flag(layerData[id], 'layers.' + id)])) as SavedView['layers']
  const sectionPerspective = flag(v.sectionPerspective, 'sectionPerspective')
  const shot = v.shot === null ? null : choice(v.shot, Object.keys(photographs) as ShotId[], 'shot')
  if (shot && photographs[shot].camera !== cameraState) fail('shot', '机位与相机类型不符')
  const mode = choice(v.mode, ['cutaway', 'exterior', 'xray'] as const, 'mode')
  if ((mode === 'exterior' && cameraState !== 'site') || (mode === 'cutaway' && cameraState === 'site'))
    fail('mode', '显示方式与相机类型不符')
  const routeOverview = flag(v.routeOverview, 'routeOverview')
  if (routeOverview && (mode !== 'xray' || cameraState !== 'sectionBox')) fail('routeOverview', '检修搬运总览须使用透视剖切盒')
  return {
    cameraState, mode,
    preset: choice(v.preset, ['section', 'panorama', 'surface'] as const, 'preset'),
    floor, lastFloor, shot, facilityId: v.facilityId === null ? null : numberIn(v.facilityId, 1, 19, 'facilityId', true),
    roomId: nullableId(v.roomId, 'roomId'), sectionZ: numberIn(v.sectionZ, -9, 8, 'sectionZ'),
    cutHeight: numberIn(v.cutHeight, 0.05, FLOORS[lastFloor].pitch - 0.02, 'cutHeight'), sectionPerspective,
    orbitCut: flag(v.orbitCut, 'orbitCut'), plenum: flag(v.plenum, 'plenum'), walkCeiling: flag(v.walkCeiling, 'walkCeiling'),
    routeOverview, layers, box,
    pose: cameraPose(v.pose, cameraState === 'plan' || (cameraState === 'section' && !sectionPerspective)),
  }
}
export function encodeViewLink(href: string, snapshot: ViewLink) {
  const url = new URL(href)
  url.searchParams.set(viewParameter, JSON.stringify({
    blueprint: validateBlueprint(snapshot.blueprint), view: validateView(snapshot.view),
  }))
  return url.href
}
export function decodeViewLink(href: string): ViewLink | null {
  const entries = new URL(href).searchParams.getAll(viewParameter)
  if (!entries.length) return null
  if (entries.length !== 1) fail(viewParameter, '链接含重复的视角参数')
  const doc = fields(readJson(entries[0]), ['blueprint', 'view'], '视角链接')
  return { blueprint: validateBlueprint(doc.blueprint), view: validateView(doc.view) }
}
