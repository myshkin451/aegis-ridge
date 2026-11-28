import { create } from 'zustand'
import { requiresLockdown, useOperationsStore } from './useOperationsStore'

interface TourState {
  run: number | null
  toggle: () => void
  stop: () => void
}

export const useLockdownTour = create<TourState>((set, get) => ({
  run: null,
  toggle: () => {
    if (get().run !== null) return get().stop()
    const operations = useOperationsStore.getState()
    if (!requiresLockdown(operations.scenario)) return
    operations.setScenario(operations.scenario)
    set({ run: useOperationsStore.getState().lockdownStartedAt })
  },
  stop: () => set({ run: null }),
}))
