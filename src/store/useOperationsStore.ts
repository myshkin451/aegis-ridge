import { create } from 'zustand'
import { useShelterStore } from './useShelterStore'

export type Scenario = 'normal' | 'cryo' | 'bio' | 'fallout'

interface OperationsState {
  scenario: Scenario
  people: number
  lockdownStartedAt: number | null
  lockdownSeconds: number
  setScenario: (scenario: Scenario, keepPhoto?: boolean) => void
  setPeople: (people: number) => void
  advance: (now: number) => void
  skip: () => void
}

export function requiresLockdown(scenario: Scenario) {
  return scenario !== 'normal'
}

export function lockdownElapsed(state: Pick<OperationsState, 'lockdownStartedAt' | 'lockdownSeconds'>, now = performance.now()) {
  return state.lockdownStartedAt === null
    ? state.lockdownSeconds
    : Math.min(30, Math.max(0, (now - state.lockdownStartedAt) / 1000))
}

export const useOperationsStore = create<OperationsState>((set) => ({
  scenario: 'normal',
  people: 8,
  lockdownStartedAt: null,
  lockdownSeconds: 0,
  setPeople: (people) => {
    if (Number.isFinite(people)) set({ people: Math.min(8, Math.max(6, Math.round(people))) })
  },
  setScenario: (scenario, keepPhoto = false) => {
    useShelterStore.setState({ cold: scenario === 'cryo', ...(keepPhoto ? {} : { shot: null }) })
    set({ scenario, lockdownStartedAt: requiresLockdown(scenario) ? performance.now() : null, lockdownSeconds: 0 })
  },
  advance: (now) => set(s => {
    if (s.lockdownStartedAt === null) return s
    const lockdownSeconds = Math.floor(lockdownElapsed(s, now))
    if (lockdownSeconds === 30) return { lockdownSeconds, lockdownStartedAt: null }
    return lockdownSeconds === s.lockdownSeconds ? s : { lockdownSeconds }
  }),
  skip: () => set(s => requiresLockdown(s.scenario) ? { lockdownStartedAt: null, lockdownSeconds: 30 } : s),
}))

useShelterStore.subscribe((s, previous) => {
  if (!s.shot || s.shot === previous.shot) return
  const operations = useOperationsStore.getState(), scenario = s.cold ? 'cryo' : 'normal'
  if (scenario !== operations.scenario) operations.setScenario(scenario, true)
  if (s.cold) operations.skip()
})
