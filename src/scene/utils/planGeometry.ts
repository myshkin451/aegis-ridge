import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon, Ring } from 'polygon-clipping'
import { ShapeUtils, Vector2 } from 'three'
import type { ModelBuilder, Tint } from './modelBuilder'

export type { MultiPolygon, Polygon, Ring }
export const { difference, intersection, union } = polygonClipping
export function rectangle(x0: number, x1: number, z0: number, z1: number): Polygon {
  return [
    [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
      [x0, z0],
    ],
  ]
}

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
  lid(m, plan, top, face)
  lid(m, plan, bottom, edge, true)
  walls(m, plan, bottom, top, edge)
}

export function contains(ring: Ring, x: number, z: number) {
  let inside = false
  for (let i = 1; i < ring.length; i++) {
    const [ax, az] = ring[i - 1],
      [bx, bz] = ring[i]
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside
  }
  return inside
}
