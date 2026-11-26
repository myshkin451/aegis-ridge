import { adits } from '../../data/siteFacilities'
import type { Point3 } from '../../types/shelter'

const mouths = Object.values(adits).map(({ points, width, height }) => {
  const a = points.at(-2)!,
    b = points.at(-1)!
  const length = Math.hypot(b[0] - a[0], b[2] - a[2])
  const ux = (b[0] - a[0]) / length,
    uz = (b[2] - a[2]) / length,
    grade = (b[1] - a[1]) / length
  const along = ([x, , z]: Point3) => (x - b[0]) * ux + (z - b[2]) * uz
  const across = ([x, , z]: Point3) => (x - b[0]) * uz - (z - b[2]) * ux
  const above = (p: Point3) => p[1] - b[1] - grade * along(p)
  return {
    b,
    planes: [
      (p: Point3) => along(p) + 32,
      (p: Point3) => 0.08 - along(p),
      (p: Point3) => width / 2 - across(p),
      (p: Point3) => width / 2 + across(p),
      (p: Point3) => above(p) + 0.06,
      (p: Point3) => height - above(p),
    ],
  }
})
export function nearMouth(x: number, z: number, step: number) {
  return mouths.find((m) => Math.hypot(x - m.b[0], z - m.b[2]) < 34 + step)
}
// Subtract the actual bore prism, including the sloping invert, from a surface triangle.
export function cutMouth(triangle: Point3[], mouth: (typeof mouths)[number]): Point3[][] | null {
  if (mouth.planes.some((d) => triangle.every((p) => d(p) < 0))) return null
  let inside = triangle
  const outside: Point3[][] = []
  for (const distance of mouth.planes) {
    const keep: Point3[] = [],
      rest: Point3[] = []
    for (let i = 0; i < inside.length; i++) {
      const a = inside[i],
        b = inside[(i + 1) % inside.length],
        da = distance(a),
        db = distance(b)
      ;(da >= 0 ? keep : rest).push(a)
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db),
          hit: Point3 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]
        keep.push(hit)
        rest.push(hit)
      }
    }
    if (rest.length >= 3) outside.push(rest)
    if (keep.length < 3) break
    inside = keep
  }
  return outside
}
