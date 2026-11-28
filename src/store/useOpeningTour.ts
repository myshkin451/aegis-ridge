import { create } from 'zustand'
import { lockdownElapsed, useOperationsStore, type Scenario } from './useOperationsStore'
import { useShelterStore } from './useShelterStore'
import { useShiftClock } from './useShiftClock'
import { useLockdownTour } from './useLockdownTour'

export const useOpeningTour = create<{ tour: 'idle' | 'opening'; run: number; cue: number }>(() => ({
  tour: 'idle', run: 0, cue: -1,
}))
let prior: {
  time: string; cold: boolean; scenario: Scenario; playing: boolean
  lockdownSeconds: number; lockdownStartedAt: number | null
} | undefined
export function startTour() {
  const { time, cold } = useShelterStore.getState()
  const { scenario, lockdownSeconds, lockdownStartedAt } = useOperationsStore.getState()
  prior = { time, cold, scenario, lockdownSeconds, lockdownStartedAt, playing: useShiftClock.getState().playing }
  useShiftClock.setState({ playing: false })
  useLockdownTour.getState().stop()
  useOpeningTour.setState(s => ({ tour: 'opening', run: s.run + 1, cue: -1 }))
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
    }
    useShiftClock.setState({ playing })
  }
  prior = undefined
  useOpeningTour.setState({ tour: 'idle', cue: -1 })
}
