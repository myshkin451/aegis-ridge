import { create } from 'zustand'
import type { FloorId, Point3 } from '../types/shelter'

export interface MeasuredPoint {
  world: Point3
  feature: string
  floor?: FloorId
}
export interface Dimension {
  a: MeasuredPoint
  b: MeasuredPoint
}
export function millimetres(a: Point3, b: Point3) {
  return Math.round(1000 * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))
}
const digits = new Intl.NumberFormat('fr-FR')
export const dimensionText = ({ a, b }: Dimension) => digits.format(millimetres(a.world, b.world)) + ' mm'

interface Measurements {
  enabled: boolean
  reference: 'physical' | 'grid'
  start: MeasuredPoint | null
  dimensions: Dimension[]
  message: string
  toggle: () => void
  mark: (point: MeasuredPoint) => void
  clear: () => void
}
export const useMeasurements = create<Measurements>((set) => ({
  enabled: false,
  reference: 'physical',
  start: null,
  dimensions: [],
  message: '',
  toggle: () => set((s) => ({ enabled: !s.enabled, start: null, message: '' })),
  mark: (point) => set((s) => {
    if (!s.enabled) return s
    if (!s.start) return { start: point, message: '' }
    if (!millimetres(s.start.world, point.world)) return { message: '两点相距不足 0.5 mm，请重新选取终点。' }
    return { dimensions: [...s.dimensions, { a: s.start, b: point }], start: null, message: '' }
  }),
  clear: () => set({ dimensions: [], start: null, message: '' }),
}))
