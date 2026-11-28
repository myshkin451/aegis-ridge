import { create } from 'zustand'
import { useShelterStore } from './useShelterStore'

export const useShiftClock = create(() => ({
  playing: false,
  motion: true,
  sound: true,
}))

export function minutesAt(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function setMinute(value: number) {
  const minute = ((Math.floor(value) % 1440) + 1440) % 1440
  const time = [Math.floor(minute / 60), minute % 60].map(n => String(n).padStart(2, '0')).join(':')
  if (time !== useShelterStore.getState().time) useShelterStore.setState({ time })
}
