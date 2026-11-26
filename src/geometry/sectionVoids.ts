import { adits } from '../data/siteFacilities'
import type { Adit } from '../data/siteFacilities'
import type { Point3 } from '../types/shelter'

// Both sides of a bend use the same mitred section, including its floor and lining.
export function boreSections(bore: Adit) {
  const normals = bore.points.slice(1).map((p, i) => {
    const a = bore.points[i],
      dx = p[0] - a[0],
      dz = p[2] - a[2],
      length = Math.hypot(dx, dz)
    return [dz / length, -dx / length]
  })
  return bore.points.map((p, i) => {
    const a = normals[Math.max(0, i - 1)],
      b = normals[Math.min(i, normals.length - 1)]
    const divisor = 1 + a[0] * b[0] + a[1] * b[1]
    return (u: number, dy = 0): Point3 => [
      p[0] + (u * (a[0] + b[0])) / divisor,
      p[1] + dy,
      p[2] + (u * (a[1] + b[1])) / divisor,
    ]
  })
}

// Intersect each oriented bore prism with the vertical drawing plane z = constant.
export function boreVoids(z: number) {
  const voids: { left: number; right: number; invert: (x: number) => number; height: number }[] = []
  for (const bore of Object.values(adits)) {
    const sections = boreSections(bore)
    for (let i = 1; i < bore.points.length; i++) {
      const a = bore.points[i - 1],
        b = bore.points[i]
      const length = Math.hypot(b[0] - a[0], b[2] - a[2]),
        ux = (b[0] - a[0]) / length,
        uz = (b[2] - a[2]) / length
      const w = bore.width / 2
      const corners = [sections[i - 1](w), sections[i](w), sections[i](-w), sections[i - 1](-w)]
      const cuts: number[] = []
      for (let j = 0; j < 4; j++) {
        const [x0, , z0] = corners[j],
          [x1, , z1] = corners[(j + 1) % 4]
        if (z0 === z1) {
          if (Math.abs(z - z0) < 1e-8) cuts.push(x0, x1)
          continue
        }
        const t = (z - z0) / (z1 - z0)
        if (t >= 0 && t <= 1) cuts.push(x0 + t * (x1 - x0))
      }
      if (cuts.length < 2) continue
      const invert = (x: number) => a[1] + (((x - a[0]) * ux + (z - a[2]) * uz) * (b[1] - a[1])) / length
      voids.push({ left: Math.min(...cuts), right: Math.max(...cuts), invert, height: bore.height })
    }
  }
  return voids
}
