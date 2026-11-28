import { create } from 'zustand'
import { crew, crewById, responsibilityEdges } from '../data/crew'
import { defaultBlueprint } from '../data/defaultBlueprint'
import { lockdownElapsed, useOperationsStore, type Scenario } from './useOperationsStore'
import { useShelterStore } from './useShelterStore'
import { useShiftClock } from './useShiftClock'
import { useLockdownTour } from './useLockdownTour'

type Tour = 'idle' | 'opening' | 'inspection'
interface CrewState {
  panel: boolean
  selected: string | null
  tour: Tour
  run: number
  cue: number
  caption: string
}
export const useCrewTour = create<CrewState>(() => ({
  panel: false, selected: null, tour: 'idle', run: 0, cue: -1, caption: '',
}))
export function closeCrew() {
  useCrewTour.setState({ panel: false, selected: null })
}
export function selectMember(id: string) {
  const member = crewById.get(id)
  if (!member) return
  useOperationsStore.getState().open(null)
  useCrewTour.setState({ selected: id, panel: true })
  const view = useShelterStore.getState()
  const firstRoom = defaultBlueprint.rooms.find(r => r.id === member.route[0].roomId)!
  // Start with the complete floor plan so all room boundaries and service terminals are legible.
  const layers = { ...view.layers }
  if (view.mepNetwork) {
    const edges = new Set(responsibilityEdges(member, view.mepNetwork))
    for (const edge of view.mepNetwork.edges) if (edges.has(edge.id)) layers[edge.system] = true
  }
  view.setView('plan')
  view.selectFloor(firstRoom.floorId)
  useShelterStore.setState({ plenum: true, layers })
}
export function toggleCrew() {
  const s = useCrewTour.getState()
  if (s.panel) closeCrew()
  else selectMember(s.selected ?? crew[0].id)
}
let prior: {
  time: string; cold: boolean; scenario: Scenario; playing: boolean
  lockdownSeconds: number; lockdownStartedAt: number | null
} | undefined
export function startTour(tour: Exclude<Tour, 'idle'>) {
  const { time, cold } = useShelterStore.getState()
  const { scenario, lockdownSeconds, lockdownStartedAt } = useOperationsStore.getState()
  prior = { time, cold, scenario, lockdownSeconds, lockdownStartedAt, playing: useShiftClock.getState().playing }
  useShiftClock.setState({ playing: false })
  useLockdownTour.getState().stop()
  useOperationsStore.getState().open(null)
  useCrewTour.setState(s => ({
    tour, run: s.run + 1, panel: false, cue: -1, caption: '',
    selected: tour === 'inspection' ? s.selected ?? crew[0].id : null,
  }))
}
export function stopTour(cancelled = false) {
  // Let an interrupted preview release the operator's simulation at the same camera pose.
  if (cancelled && prior) {
    const { time, cold, scenario, playing } = prior
    useShelterStore.setState({ time, cold, shot: null })
    const ops = useOperationsStore.getState()
    if (ops.scenario !== scenario || ops.lockdownStartedAt !== prior.lockdownStartedAt ||
        ops.lockdownSeconds !== prior.lockdownSeconds) {
      const seconds = Math.floor(lockdownElapsed(prior))
      useOperationsStore.setState({
        scenario, lockdownSeconds: seconds, lockdownStartedAt: seconds >= 30 ? null : prior.lockdownStartedAt,
      })
      ops.refresh()
    }
    useShiftClock.setState({ playing })
  }
  prior = undefined
  useCrewTour.setState({ tour: 'idle', cue: -1, caption: '', selected: null })
}
