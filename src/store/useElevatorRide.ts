import { create } from 'zustand'
import { ElevatorBank, type ElevatorId, type ElevatorPhase } from '../geometry/elevators'
import type { FloorId } from '../types/shelter'

export const elevatorBank = new ElevatorBank()
interface Ride {
  id: ElevatorId
  stop: FloorId
  target: FloorId
  phase: ElevatorPhase
}
export const useElevatorRide = create<{ ride: Ride | null }>(() => ({ ride: null }))

// The running car's transform is frame-local. Only stop and door transitions enter the HUD store.
export function setElevatorRider(id: ElevatorId | null) {
  const old = useElevatorRide.getState().ride
  if (!id) {
    if (old) useElevatorRide.setState({ ride: null })
    return
  }
  const { stop, target, phase } = elevatorBank.cars[id]
  if (old?.id !== id || old.stop !== stop || old.target !== target || old.phase !== phase)
    useElevatorRide.setState({ ride: { id, stop, target, phase } })
}

export function selectElevatorFloor(floor: FloorId) {
  const ride = useElevatorRide.getState().ride
  if (!ride || !elevatorBank.cars[ride.id].request(floor)) return false
  setElevatorRider(ride.id)
  return true
}
