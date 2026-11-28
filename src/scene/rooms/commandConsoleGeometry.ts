import type { Point3 } from '../../types/shelter'

export const commandPanels = Array.from({ length: 7 }, (_, i) => {
  const angle = (i - 3) * 0.139
  return {
    angle,
    position(x: number, y: number, z: number): Point3 {
      const radius = 6.4 - z
      return [
        radius * Math.sin(angle) + x * Math.cos(angle),
        y,
        5.75 - radius * Math.cos(angle) + x * Math.sin(angle),
      ]
    },
  }
})
