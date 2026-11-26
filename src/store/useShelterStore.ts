import { create } from 'zustand'
import type { CameraPreset, FloorSelection, ViewMode } from '../types/shelter'

interface ShelterView {
  mode: ViewMode
  floor: FloorSelection
  plenum: boolean
  preset: CameraPreset
  cameraRevision: number
  setMode: (mode: ViewMode) => void
  selectFloor: (floor: FloorSelection) => void
  frame: (preset: CameraPreset) => void
  togglePlenum: () => void
}

export const useShelterStore = create<ShelterView>((set) => ({
  mode: 'cutaway',
  floor: 'ALL',
  plenum: true,
  preset: 'panorama',
  cameraRevision: 0,
  setMode: (mode) =>
    set((s) => {
      if (mode === 'exterior' && (s.floor !== 'ALL' || s.preset === 'section')) {
        return { mode, floor: 'ALL', preset: 'panorama', cameraRevision: s.cameraRevision + 1 }
      }
      return { mode }
    }),
  selectFloor: (floor) =>
    set((s) => ({
      floor,
      mode: floor.startsWith('B') && s.mode === 'exterior' ? 'cutaway' : s.mode,
      preset: floor === 'ALL' ? 'panorama' : s.preset,
      cameraRevision: s.cameraRevision + 1,
    })),
  frame: (preset) =>
    set((s) => ({
      preset,
      floor: 'ALL',
      mode: preset === 'section' && s.mode === 'exterior' ? 'cutaway' : s.mode,
      cameraRevision: s.cameraRevision + 1,
    })),
  togglePlenum: () => set((s) => ({ plenum: !s.plenum })),
}))
