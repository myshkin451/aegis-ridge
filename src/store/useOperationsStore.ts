import { create } from 'zustand'
import { evaluateOperations } from '../engine/operations'
import { useShelterStore } from './useShelterStore'

export const scenarioNames = {
  normal: '日常',
  cryo: '极寒 −60℃',
  bio: '生化孢子',
  fallout: '核尘埃封锁',
}
export type Scenario = keyof typeof scenarioNames
export type OperationsReport = ReturnType<typeof evaluateOperations>
export type Diagnostic = OperationsReport['rows'][number]
export type Panel = 'health' | 'maintenance'
export type Location = Pick<Diagnostic, 'roomId' | 'equipmentTag' | 'edgeId'>

interface OperationsState {
  scenario: Scenario
  people: number
  isolatedId: string | null
  location: Location | null
  panel: Panel | null
  lockdownStartedAt: number | null
  lockdownSeconds: number
  report: OperationsReport
  setScenario: (scenario: Scenario, keepPhoto?: boolean) => void
  setPeople: (people: number) => void
  isolate: (id: string | null) => void
  open: (panel: Panel | null) => void
  locate: (location: Location | null) => void
  refresh: () => void
  advance: (now: number) => void
  skip: () => void
}

export function requiresLockdown(scenario: Scenario) {
  return scenario === 'bio' || scenario === 'fallout'
}
type Clock = Pick<OperationsState, 'lockdownStartedAt' | 'lockdownSeconds'>
export function lockdownElapsed(state: Clock, now = performance.now()) {
  return state.lockdownStartedAt === null
    ? state.lockdownSeconds
    : Math.min(30, Math.max(0, (now - state.lockdownStartedAt) / 1000))
}
function calculate(s: Pick<OperationsState, 'scenario' | 'people' | 'isolatedId' | 'lockdownSeconds'>) {
  const { time, mepNetwork } = useShelterStore.getState()
  const [hour, minute] = time.split(':').map(Number)
  return evaluateOperations(
    {
      scenario: s.scenario,
      people: s.people,
      hour: hour + minute / 60,
      sealed: requiresLockdown(s.scenario) && s.lockdownSeconds === 30,
      isolatedId: s.isolatedId,
    },
    mepNetwork,
  )
}
const initial = { scenario: 'normal' as const, people: 10, isolatedId: null, lockdownSeconds: 0 }
export const useOperationsStore = create<OperationsState>((set) => ({
  ...initial,
  location: null,
  panel: null,
  lockdownStartedAt: null,
  lockdownSeconds: 0,
  report: calculate(initial),
  setScenario: (scenario, keepPhoto = false) => {
    useShelterStore.setState({ cold: scenario === 'cryo', ...(keepPhoto ? {} : { shot: null }) })
    set((s) => ({
      scenario,
      lockdownStartedAt: requiresLockdown(scenario) ? performance.now() : null,
      lockdownSeconds: 0,
      report: calculate({ ...s, scenario, lockdownSeconds: 0 }),
    }))
  },
  setPeople: (value) =>
    set((s) => {
      const people = Math.min(14, Math.max(5, Math.round(value)))
      return Number.isFinite(people) && people !== s.people
        ? { people, report: calculate({ ...s, people }) }
        : s
    }),
  isolate: (isolatedId) => {
    if (!isolatedId) leaveRouteOverview()
    set((s) => ({
      isolatedId,
      location: null,
      report: calculate({ ...s, isolatedId }),
    }))
  },
  locate: (location) => set({ location }),
  refresh: () => set((s) => ({ report: calculate(s) })),
  open: (panel) => {
    leaveRouteOverview()
    set({ panel, location: null })
  },
  advance: (now) =>
    set((s) => {
      if (s.lockdownStartedAt === null) return s
      const seconds = Math.floor(lockdownElapsed(s, now))
      if (seconds === 30)
        return {
          lockdownSeconds: seconds,
          lockdownStartedAt: null,
          report: calculate({ ...s, lockdownSeconds: seconds }),
        }
      return seconds === s.lockdownSeconds ? s : { lockdownSeconds: seconds }
    }),
  skip: () =>
    set((s) =>
      requiresLockdown(s.scenario)
        ? { lockdownSeconds: 30, lockdownStartedAt: null, report: calculate({ ...s, lockdownSeconds: 30 }) }
        : s,
    ),
}))

// The MEP graph belongs to the surveyed terrain; the physics uses the very same installed network.
useShelterStore.subscribe((s, previous) => {
  const operations = useOperationsStore.getState()
  if (s.shot && s.shot !== previous.shot) {
    const scenario = s.cold ? 'cryo' : 'normal'
    if (scenario !== operations.scenario) {
      operations.setScenario(scenario, true)
      return
    }
  }
  if (s.time !== previous.time || s.mepNetwork !== previous.mepNetwork) operations.refresh()
})

export function inspectLocation(location: Location) {
  const view = useShelterStore.getState()
  useOperationsStore.getState().locate(location)
  view.inspect(location.roomId, location.equipmentTag, location.edgeId)
}

export function leaveRouteOverview() {
  const view = useShelterStore.getState()
  if (!view.routeOverview) return
  const target = useOperationsStore.getState().report.maintenance
  if (!target) {
    view.setView('floorOrbit')
    return
  }
  const isEdge = view.mepNetwork?.edges.some((e) => e.id === target.id)
  view.inspect(target.roomId, isEdge ? undefined : target.id, isEdge ? target.id : undefined)
}

export function isolateTarget(id: string) {
  const state = useOperationsStore.getState()
  state.isolate(id)
  const result = useOperationsStore.getState().report.maintenance
  if (!result) return
  const edge = useShelterStore.getState().mepNetwork?.edges.find((e) => e.id === id)
  inspectLocation({ roomId: result.roomId, equipmentTag: edge ? undefined : id, edgeId: edge?.id })
}
