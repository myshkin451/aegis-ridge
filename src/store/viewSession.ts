import { create } from 'zustand'
import { decodeViewLink, encodeViewLink, readLocalSettings, viewParameter, type Setting, type SavedView } from '../data/viewLink'
import { defaultBlueprint } from '../data/defaultBlueprint'
import { FLOORS } from '../data/floors'
import { WALK_EYE_HEIGHT } from '../geometry/coords'
import { elevatorIds } from '../geometry/elevators'
import { elevatorBank, useElevatorRide } from './useElevatorRide'
import type { FloorId } from '../types/shelter'
import { currentPose, restorePose } from './sharedCamera'
import { useOpeningTour } from './useOpeningTour'
import { useLockdownTour } from './useLockdownTour'
import { lockdownElapsed, requiresLockdown, useOperationsStore } from './useOperationsStore'
import { useShelterStore } from './useShelterStore'
import { useShiftClock } from './useShiftClock'

const settingsKey = 'ars-fortress-settings-v3'
export const useShareNotice = create(() => ({ message: '' }))
function report(prefix: string, error: unknown) {
  useShareNotice.setState({ message: prefix + (error instanceof Error ? error.message : String(error)) })
}

function configuration(): Setting {
  const { people, scenario, lockdownSeconds } = useOperationsStore.getState()
  return { people, scenario, lockdownSeconds, time: useShelterStore.getState().time }
}
function apply(settings: Setting, view?: SavedView) {
  if (view?.roomId && !defaultBlueprint.rooms.some(r => r.id === view.roomId)) throw new Error('找不到房间 ' + view.roomId)
  useLockdownTour.getState().stop()
  useShiftClock.setState({ playing: false })
  useShelterStore.setState({ time: settings.time, cold: settings.scenario === 'cryo' })
  const { people, scenario, lockdownSeconds } = settings
  useOperationsStore.setState({ scenario, people, lockdownSeconds, lockdownStartedAt:
    requiresLockdown(scenario) && lockdownSeconds < 30 ? performance.now() - lockdownSeconds * 1000 : null })
  if (!view) return
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

export function createViewLink(onArrival?: (floor: FloorId) => void) {
  const s = useShelterStore.getState()
  const { cameraState, mode, floor, lastFloor, preset, shot, facilityId, roomId, sectionZ, sectionPerspective,
    orbitCut, plenum, walkCeiling, box } = s
  const cutHeight = Math.min(s.cutHeight, FLOORS[lastFloor].pitch - 0.02)
  const view = { cameraState, mode, floor, lastFloor, preset, shot, facilityId, roomId, sectionZ, cutHeight,
    sectionPerspective, orbitCut, plenum, walkCeiling, box, pose: currentPose() }
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
  const settings = configuration()
  settings.lockdownSeconds = Math.floor(lockdownElapsed(useOperationsStore.getState()))
  return encodeViewLink(location.href, { settings, view })
}

export function initializeViewSession() {
  useShareNotice.setState({ message: '' })
  let shared = false
  try {
    const link = decodeViewLink(location.href)
    if (link) { apply(link.settings, link.view); shared = true }
  } catch (error) { report('视角链接未载入。', error) }
  if (!shared) {
    try {
      const current = localStorage.getItem(settingsKey)
      const stored = current ?? localStorage.getItem('ars-blueprint-v2')
      if (stored !== null) apply(readLocalSettings(stored, current === null))
    } catch (error) { report('本机设置未载入。', error) }
  }
  let active = true, scheduled = false
  function save(userChange: boolean) {
    if (useOpeningTour.getState().tour !== 'idle') return
    if (userChange && shared) {
      const url = new URL(location.href)
      url.searchParams.delete(viewParameter)
      history.replaceState(history.state, '', url)
      shared = false
    }
    if (shared || scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (!active) return
      try { localStorage.setItem(settingsKey, JSON.stringify(configuration())) }
      catch (error) { report('本机设置未保存。', error) }
    })
  }
  const stopOps = useOperationsStore.subscribe((s, p) => {
    if (s.people !== p.people || s.scenario !== p.scenario) save(true)
    else if (s.lockdownSeconds !== p.lockdownSeconds) save(false)
  })
  const stopClock = useShelterStore.subscribe((s, p) => { if (s.time !== p.time) save(true) })
  return () => { active = false; stopClock(); stopOps() }
}
