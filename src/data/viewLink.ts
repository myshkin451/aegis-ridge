import { FLOORS, FLOOR_ORDER } from './floors'
import { photographs, type ShotId } from './photographs'
import { boxLimits, type SectionBounds } from '../geometry/viewGeometry'
import type { CameraPreset, CameraStateId, FloorId, FloorSelection, Point3, ViewMode } from '../types/shelter'
import type { Scenario } from '../store/useOperationsStore'

const sizeLimit = 64 * 1024
export const viewParameter = 'ars'
export interface Setting {
  scenario: Scenario
  people: number
  time: string
  lockdownSeconds: number
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
  box: SectionBounds
  pose: CameraPose
}
export interface ViewLink { settings: Setting; view: SavedView }

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
  if (typeof text !== 'string' || text.length > sizeLimit ||
      new TextEncoder().encode(text).length > sizeLimit) fail('文档大小', '上限为 64 KiB')
  try { return JSON.parse(text) as unknown }
  catch { return fail('JSON 语法错误', '请检查引号、逗号与括号') }
}

function settings(value: unknown, legacy: boolean): Setting {
  const expected = ['scenario', 'time', 'people', 'lockdownSeconds']
  if (legacy) expected.push('version', 'roomChanges', 'isolatedId')
  const b = fields(value, expected, '堡垒状态')
  if (legacy && b.version !== '2.0') fail('version', '未知的视角版本')
  if (typeof b.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) fail('time', '须为 24 小时时刻 HH:mm')
  const scenario = choice(b.scenario, ['normal', 'cryo', 'bio', 'fallout'] as const, 'scenario')
  const people = numberIn(b.people, legacy ? 5 : 6, legacy ? 14 : 8, 'people', true)
  const lockdownSeconds = numberIn(b.lockdownSeconds, 0, 30, 'lockdownSeconds', true)
  if (lockdownSeconds && scenario === 'normal') fail('lockdownSeconds', '当前情景没有封锁进度')
  return { scenario: scenario === 'bio' ? 'fallout' : scenario, people: Math.min(8, Math.max(6, people)), time: b.time, lockdownSeconds }
}
export function readLocalSettings(source: string, legacy: boolean) {
  return settings(readJson(source), legacy)
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
const viewFields = [
  'cameraState', 'mode', 'preset', 'floor', 'lastFloor', 'shot', 'roomId', 'facilityId', 'sectionZ', 'cutHeight',
  'sectionPerspective', 'orbitCut', 'plenum', 'walkCeiling', 'box', 'pose',
]
function validateView(value: unknown, legacy = false): SavedView {
  const expected = legacy ? [...viewFields, 'routeOverview', 'layers'] : viewFields
  const v = fields(value, expected, '视角')
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
  const sectionPerspective = flag(v.sectionPerspective, 'sectionPerspective')
  const shot = v.shot === null ? null : choice(v.shot, Object.keys(photographs) as ShotId[], 'shot')
  if (shot && photographs[shot].camera !== cameraState) fail('shot', '机位与相机类型不符')
  const mode = choice(v.mode, ['cutaway', 'exterior', 'xray'] as const, 'mode')
  if ((mode === 'exterior' && cameraState !== 'site') || (mode === 'cutaway' && cameraState === 'site'))
    fail('mode', '显示方式与相机类型不符')
  return {
    cameraState, mode,
    preset: choice(v.preset, ['section', 'panorama', 'surface'] as const, 'preset'),
    floor, lastFloor, shot, facilityId: v.facilityId === null ? null : numberIn(v.facilityId, 1, 19, 'facilityId', true),
    roomId: nullableId(v.roomId, 'roomId'), sectionZ: numberIn(v.sectionZ, -9, 8, 'sectionZ'),
    cutHeight: numberIn(v.cutHeight, 0.05, FLOORS[lastFloor].pitch - 0.02, 'cutHeight'), sectionPerspective,
    orbitCut: flag(v.orbitCut, 'orbitCut'), plenum: flag(v.plenum, 'plenum'), walkCeiling: flag(v.walkCeiling, 'walkCeiling'),
    box,
    pose: cameraPose(v.pose, cameraState === 'plan' || (cameraState === 'section' && !sectionPerspective)),
  }
}
export function encodeViewLink(href: string, snapshot: ViewLink) {
  const url = new URL(href)
  url.searchParams.set(viewParameter, JSON.stringify({
    settings: settings(snapshot.settings, false), view: validateView(snapshot.view),
  }))
  return url.href
}
export function decodeViewLink(href: string): ViewLink | null {
  const entries = new URL(href).searchParams.getAll(viewParameter)
  if (!entries.length) return null
  if (entries.length !== 1) fail(viewParameter, '链接含重复的视角参数')
  const value = readJson(entries[0])
  const legacy = value !== null && typeof value === 'object' && Object.hasOwn(value, 'blueprint')
  const configKey = legacy ? 'blueprint' : 'settings'
  const doc = fields(value, [configKey, 'view'], '视角链接')
  return { settings: settings(doc[configKey], legacy), view: validateView(doc.view, legacy) }
}
