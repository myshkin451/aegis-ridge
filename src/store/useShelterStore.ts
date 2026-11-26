import { create } from 'zustand'
import type { CameraPreset, FloorSelection, ViewMode } from '../types/shelter'

interface ShelterView {
  mode: ViewMode
  floor: FloorSelection
  sectionZ: number
  setSectionZ: (z: number) => void
  plenum: boolean
  preset: CameraPreset
  facilityId: number | null
  focusFacility: (id: number) => void
  cameraRevision: number
  setMode: (mode: ViewMode) => void
  selectFloor: (floor: FloorSelection) => void
  frame: (preset: CameraPreset) => void
  togglePlenum: () => void
}

export const useShelterStore = create<ShelterView>((set) => ({
  mode: 'exterior',
  sectionZ: -3.75,
  setSectionZ: (z) => set({ sectionZ: Math.max(-9, Math.min(8, z)) }),
  floor: 'ALL',
  plenum: true,
  preset: 'surface',
  facilityId: null,
  focusFacility: (id) =>
    set((s) => ({
      facilityId: id,
      floor: 'ALL',
      mode: id === 6 || id === 7 ? 'xray' : 'exterior',
      cameraRevision: s.cameraRevision + 1,
    })),
  cameraRevision: 0,
  setMode: (mode) =>
    set((s) => ({
      mode,
      facilityId: null,
      floor: mode === 'exterior' ? 'ALL' : s.floor,
      preset:
        mode === 'cutaway'
          ? 'section'
          : mode === 'xray'
            ? 'panorama'
            : s.floor !== 'ALL' || s.preset === 'section'
              ? 'panorama'
              : s.preset,
      cameraRevision: s.cameraRevision + 1,
    })),
  selectFloor: (floor) =>
    set((s) => ({
      floor,
      facilityId: null,
      mode: floor.startsWith('B') && s.mode === 'exterior' ? 'cutaway' : s.mode,
      preset: floor === 'ALL' ? 'panorama' : s.preset,
      cameraRevision: s.cameraRevision + 1,
    })),
  frame: (preset) =>
    set((s) => ({
      preset,
      facilityId: null,
      floor: 'ALL',
      mode: preset === 'section' ? 'cutaway' : preset === 'surface' ? 'exterior' : s.mode,
      cameraRevision: s.cameraRevision + 1,
    })),
  togglePlenum: () => set((s) => ({ plenum: !s.plenum })),
}))
