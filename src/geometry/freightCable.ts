import survey from '../data/siteSurvey.json'
import type { Point3 } from '../types/shelter'
import { groundAt } from './siteElevations'
import type { TerrainAtlas } from './siteElevations'

function sagPoint(a: Point3, b: Point3, t: number): Point3 {
  const span = Math.hypot(b[0] - a[0], b[2] - a[2])
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t - 4 * t * (1 - t) * span * 0.018,
    a[2] + (b[2] - a[2]) * t,
  ]
}
export function freightCable(atlas: TerrainAtlas) {
  const [a, b] = [survey.cableTop, survey.cableValley]
  const support = (x: number, z: number): Point3 => [x, groundAt(atlas, x, z).height + 11, z]
  const tops = Array.from({ length: 10 }, (_, i) =>
    support(a[0] + ((b[0] - a[0]) * i) / 9, a[1] + ((b[1] - a[1]) * i) / 9),
  )
  const spans: Point3[][] = []
  for (let i = 0; i < tops.length - 1; ) {
    const left = tops[i],
      right = tops[i + 1],
      metres = Math.ceil(Math.hypot(right[0] - left[0], right[2] - left[2]))
    const points = Array.from({ length: metres + 1 }, (_, j) => sagPoint(left, right, j / metres))
    let clearance = Infinity,
      crest = points[0]
    for (const p of points) {
      const gap = p[1] - groundAt(atlas, p[0], p[2]).height
      if (gap < clearance) {
        clearance = gap
        crest = p
      }
    }
    if (clearance < 4 && metres > 2) tops.splice(i + 1, 0, support(crest[0], crest[2]))
    else {
      spans.push(points)
      i++
    }
  }
  return { tops, spans }
}
