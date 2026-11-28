import { create } from 'zustand'

export const photoAspects = { '16:9': 16 / 9, '4:5': 4 / 5, '2.39:1': 2.39 } as const
export type PhotoAspect = keyof typeof photoAspects

export const usePhotoMode = create<{
  active: boolean
  aspect: PhotoAspect
  shift: boolean
  exporting: boolean
  message: string
}>(() => ({ active: false, aspect: '16:9', shift: true, exporting: false, message: '' }))

export function framedSize(width: number, height: number, aspect: PhotoAspect) {
  const ratio = photoAspects[aspect]
  return {
    width: Math.max(1, Math.round(Math.min(width, height * ratio))),
    height: Math.max(1, Math.round(Math.min(height, width / ratio))),
  }
}
