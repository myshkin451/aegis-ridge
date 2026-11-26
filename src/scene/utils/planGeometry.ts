import type { MultiPolygon, Pair } from 'polygon-clipping'
import { ShapeUtils, Vector2 } from 'three'
import type { ModelBuilder, Tint } from './modelBuilder'

export function lid(m: ModelBuilder, polygons: MultiPolygon, y: number, color: Tint, underside = false) {
  for (const polygon of polygons) {
    const rings = polygon.map((ring) => ring.slice(0, -1).map(([x, z]) => new Vector2(x, z)))
    const flat = rings.flat()
    for (const [a, b, c] of ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
      const pts = (underside ? [a, b, c] : [a, c, b]).map((i) => flat[i])
      m.tri([pts[0].x, y, pts[0].y], [pts[1].x, y, pts[1].y], [pts[2].x, y, pts[2].y], color)
    }
  }
}
export function walls(m: ModelBuilder, polygons: MultiPolygon, bottom: number, top: number, color: Tint) {
  for (const polygon of polygons)
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const [ax, az] = ring[i - 1],
          [bx, bz] = ring[i]
        m.quad([ax, bottom, az], [ax, top, az], [bx, top, bz], [bx, bottom, bz], color)
      }
    }
}

export function outline(m: ModelBuilder, polygons: MultiPolygon, y: number, color: Tint) {
  for (const polygon of polygons)
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const [x, z] = ring[i - 1],
          [u, v] = ring[i]
        m.line([x, y, z], [u, y, v], color)
      }
    }
}

export function plate(
  m: ModelBuilder,
  plan: MultiPolygon,
  bottom: number,
  top: number,
  face: Tint,
  edge: Tint,
) {
  const bevel = Math.min(0.012, (top - bottom) / 4)
  // Polygon-clipping orients each ring with solid material to its left, including shaft holes.
  const inset: MultiPolygon = plan.map((polygon) =>
    polygon.map((ring) => {
      const vertices = ring.slice(0, -1)
      const left = (a: Pair, b: Pair) => new Vector2(a[1] - b[1], b[0] - a[0]).normalize()
      const inner = vertices.map(([x, z], i): Pair => {
        const n = left(vertices[(i + vertices.length - 1) % vertices.length], vertices[i])
        const next = left(vertices[i], vertices[(i + 1) % vertices.length])
        n.addScaledVector(next, 1).multiplyScalar((2 * bevel) / Math.max(0.1, n.lengthSq()))
        return [x + n.x, z + n.y]
      })
      return [...inner, inner[0]]
    }),
  )
  m.closedFaces(() => {
    lid(m, inset, top, face)
    lid(m, inset, bottom, edge, true)
    walls(m, plan, bottom + bevel, top - bevel, edge)
    plan.forEach((polygon, k) =>
      polygon.forEach((ring, j) => {
        const inner = inset[k][j]
        for (let i = 1; i < ring.length; i++) {
          const [ax, az] = ring[i - 1],
            [bx, bz] = ring[i],
            [cx, cz] = inner[i - 1],
            [dx, dz] = inner[i]
          m.quad([ax, top - bevel, az], [cx, top, cz], [dx, top, dz], [bx, top - bevel, bz], face)
          m.quad([cx, bottom, cz], [ax, bottom + bevel, az], [bx, bottom + bevel, bz], [dx, bottom, dz], edge)
        }
      }),
    )
  })
}
