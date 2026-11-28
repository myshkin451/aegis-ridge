import { create } from 'zustand'
import {
  baselineDocument, decodeViewLink, encodeViewLink, parseBlueprintJson, serializeBlueprint, viewParameter,
  type BlueprintDocument, type SavedView,
} from '../data/blueprintDocument'
import { buildMepNetwork } from '../data/mepNetwork'
import { FLOORS } from '../data/floors'
import { resolveRooms } from '../data/roomTemplates'
import type { TerrainAtlas } from '../geometry/siteElevations'
import { WALK_EYE_HEIGHT } from '../geometry/coords'
import { elevatorIds } from '../geometry/elevators'
import { elevatorBank, useElevatorRide } from './useElevatorRide'
import type { FloorId } from '../types/shelter'
import { defaultBox } from '../geometry/viewGeometry'
import { currentPose, restorePose } from './sharedCamera'
import { stopTour, useCrewTour } from './useCrewTour'
import { useLockdownTour } from './useLockdownTour'
import { lockdownElapsed, requiresLockdown, useOperationsStore } from './useOperationsStore'
import { useShelterStore } from './useShelterStore'
import { useShiftClock } from './useShiftClock'

export const blueprintStorageKey = 'ars-blueprint-v2'
export const useBlueprintNotice = create(() => ({ message: '' }))
let atlas: TerrainAtlas | null = null
let applying = false

function report(prefix: string, error: unknown) {
  useBlueprintNotice.setState({ message: prefix + (error instanceof Error ? error.message : String(error)) })
}
function configuration(): BlueprintDocument {
  const { roomChanges, people, isolatedId, scenario, lockdownSeconds } = useOperationsStore.getState()
  return { version: '2.0', roomChanges, people, scenario, isolatedId, lockdownSeconds, time: useShelterStore.getState().time }
}
function persist() {
  try { localStorage.setItem(blueprintStorageKey, serializeBlueprint(configuration())) }
  catch (error) { report('本机自动保存失败。', error) }
}
function detachLink() {
  const url = new URL(location.href)
  if (!url.searchParams.has(viewParameter)) return
  url.searchParams.delete(viewParameter)
  history.replaceState(history.state, '', url)
}
export function exportBlueprintJson() { return serializeBlueprint(configuration()) }

function applyBlueprint(doc: BlueprintDocument, view?: SavedView) {
  // Validate against the prospective room schedule, including removed equipment and rerouted branch IDs.
  // Derive the candidate graph only when an isolation is present; the terrain is already loaded at this point.
  const rooms = resolveRooms(doc.roomChanges)
  if (doc.isolatedId !== null && !rooms.some(r => r.equipment.some(e => e.tagCode === doc.isolatedId))) {
    if (!atlas || !buildMepNetwork(atlas, rooms).edges.some(e => e.id === doc.isolatedId))
      throw new Error('isolatedId：当前蓝图中没有设备或管段 ' + doc.isolatedId)
  }
  if (view?.roomId && !rooms.some(r => r.id === view.roomId)) throw new Error('roomId：蓝图中没有房间 ' + view.roomId)
  if (view?.routeOverview && !doc.isolatedId) throw new Error('routeOverview：检修搬运总览缺少隔离目标')
  applying = true
  try {
    if (useCrewTour.getState().tour !== 'idle') stopTour()
    useLockdownTour.getState().stop()
    useShiftClock.setState({ playing: false })
    useShelterStore.setState({ shot: null, cold: doc.scenario === 'cryo', time: doc.time, routeOverview: false,
      waterTrace: null, hoveredValve: null, equipmentTag: null, roomId: null, surveyFocus: null })
    const operations = useOperationsStore.getState()
    operations.setRoomChanges(doc.roomChanges)
    const running = requiresLockdown(doc.scenario) && doc.lockdownSeconds < 30
    useOperationsStore.setState({ scenario: doc.scenario, people: doc.people, isolatedId: doc.isolatedId,
      location: null, lockdownSeconds: doc.lockdownSeconds,
      lockdownStartedAt: running ? performance.now() - doc.lockdownSeconds * 1000 : null })
    if (view) {
      const { pose, ...state } = view
      const revision = useShelterStore.getState().cameraRevision + 1
      if (view.cameraState === 'walkthrough') {
        const [x, eyeY, z] = pose.eye
        if (Math.abs(eyeY - WALK_EYE_HEIGHT - FLOORS[view.lastFloor].elevation) < 0.03) {
          for (const id of elevatorIds) {
            const car = elevatorBank.cars[id]
            if (car.deckAt(x, z)) car.restoreParked(view.lastFloor)
          }
        }
      }
      restorePose(revision, pose)
      useShelterStore.setState({ ...state, cameraRevision: revision, landing: null, landingTarget: null, anchorIndex: 0 })
    }
    operations.refresh()
  } finally { applying = false }
}
export function importBlueprintJson(source: string) {
  applyBlueprint(parseBlueprintJson(source))
  useBlueprintNotice.setState({ message: '' })
  detachLink()
  persist()
}
export function resetBlueprint() {
  applyBlueprint(baselineDocument)
  const defaults = useShelterStore.getInitialState()
  useShelterStore.getState().setView('site')
  useShelterStore.setState({
    lastFloor: defaults.lastFloor, sectionZ: defaults.sectionZ, sectionPerspective: false,
    cutHeight: defaults.cutHeight, box: { ...defaultBox }, layers: { ...defaults.layers }, plenum: true, walkCeiling: true,
  })
  useBlueprintNotice.setState({ message: '' })
  detachLink()
  persist()
}
export function createViewLink(onArrival?: (floor: FloorId) => void) {
  const s = useShelterStore.getState()
  const { cameraState, mode, floor, lastFloor, preset, shot, facilityId, roomId, sectionZ, sectionPerspective,
    orbitCut, plenum, walkCeiling, routeOverview, layers, box } = s
  const cutHeight = Math.min(s.cutHeight, FLOORS[lastFloor].pitch - 0.02)
  const view = { cameraState, mode, floor, lastFloor, preset, shot, facilityId, roomId, sectionZ, cutHeight,
    sectionPerspective, orbitCut, plenum, walkCeiling, routeOverview, layers, box, pose: currentPose() }
  const ride = useElevatorRide.getState().ride
  if (view.cameraState === 'walkthrough' && ride && (ride.phase === 'moving' || ride.phase === 'closing')) {
    // A share link describes a fixed viewpoint. Preserve the rider's bearing and position
    // inside the car, and place its deck at the destination in the receiving session.
    const car = elevatorBank.cars[ride.id], destination = car.target
    const offset = FLOORS[destination].elevation + WALK_EYE_HEIGHT - view.pose.eye[1]
    view.pose = { ...view.pose,
      eye: [view.pose.eye[0], view.pose.eye[1] + offset, view.pose.eye[2]],
      target: [view.pose.target[0], view.pose.target[1] + offset, view.pose.target[2]] }
    view.floor = view.lastFloor = destination
    view.cutHeight = Math.min(view.cutHeight, FLOORS[destination].pitch - 0.02)
    view.roomId = null
    onArrival?.(destination)
  }
  const blueprint = configuration()
  blueprint.lockdownSeconds = Math.floor(lockdownElapsed(useOperationsStore.getState()))
  return encodeViewLink(location.href, { blueprint, view })
}

/** Called before mounting the camera and network: a shared view owns the first visible frame. */
export function initializeBlueprintSession(terrain: TerrainAtlas) {
  atlas = terrain
  useBlueprintNotice.setState({ message: '' })
  let shared = false
  try {
    const link = decodeViewLink(location.href)
    if (link) {
      applyBlueprint(link.blueprint, link.view)
      shared = true
    }
  } catch (error) { report('视角链接未载入。', error) }
  if (!shared) {
    try {
      const stored = localStorage.getItem(blueprintStorageKey)
      if (stored !== null) applyBlueprint(parseBlueprintJson(stored))
    } catch (error) { report('本机蓝图未载入。', error) }
  }
  // Store the final combined state after one user action has updated both stores.
  let scheduled = false, active = true
  function save(userChange: boolean) {
    if (applying || useCrewTour.getState().tour !== 'idle') return
    if (userChange) {
      shared = false
      detachLink()
    }
    // Simply opening a shared URL does not overwrite an existing local experiment.
    if ((shared && new URL(location.href).searchParams.has(viewParameter)) || scheduled) return
    scheduled = true
    queueMicrotask(() => { scheduled = false; if (active) persist() })
  }
  const stopOps = useOperationsStore.subscribe((s, p) => {
    if (s.roomChanges !== p.roomChanges || s.people !== p.people || s.scenario !== p.scenario || s.isolatedId !== p.isolatedId)
      save(true)
    else if (s.lockdownSeconds !== p.lockdownSeconds) save(false)
  })
  const stopClock = useShelterStore.subscribe((s, p) => { if (s.time !== p.time) save(true) })
  return () => { active = false; atlas = null; stopClock(); stopOps() }
}
