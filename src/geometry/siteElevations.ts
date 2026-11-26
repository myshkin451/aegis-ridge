import type { Point3 } from '../types/shelter'

export interface TileInfo {
  id: string
  cx: number
  cz: number
  parent?: string
  span: number
  step: number
  n: number
  file: string
  sha256: string
}
export interface AtlasInfo {
  version: number
  seed: number
  tiles: TileInfo[]
  insets: TileInfo[]
  road: Point3[]
}
export interface TerrainTile extends TileInfo {
  bytes: Uint8Array
}
export interface TerrainAtlas {
  tiles: TerrainTile[]
  insets: TerrainTile[]
  road: Point3[]
}
export interface GroundSample {
  height: number
  slope: number
  curvature: number
  flow: number
  aspect: number
}

export function decodeTile(info: TileInfo, bytes: Uint8Array): TerrainTile {
  if (info.n !== 1 + info.span / info.step || bytes.length !== info.n ** 2 * 6) {
    throw new Error('地形尺寸不符 ' + info.id)
  }
  return { ...info, bytes }
}
export function vertex(tile: TerrainTile, i: number): GroundSample {
  const b = tile.bytes,
    k = i * 6
  return {
    height: (b[k] + b[k + 1] * 256) / 32 - 512,
    slope: (b[k + 2] * 90) / 255,
    curvature: b[k + 3] / 127.5 - 1,
    flow: b[k + 4] / 255,
    aspect: (b[k + 5] * 2 * Math.PI) / 255 - Math.PI,
  }
}
export function tileAt(atlas: TerrainAtlas, x: number, z: number) {
  for (const t of atlas.insets) if (Math.max(Math.abs(x - t.cx), Math.abs(z - t.cz)) <= t.span / 2) return t
  const radius = Math.max(Math.abs(x), Math.abs(z))
  for (let i = atlas.tiles.length - 1; i >= 0; i--)
    if (radius <= atlas.tiles[i].span / 2) return atlas.tiles[i]
  throw new RangeError('超出地形测区')
}
export function sampleTile(tile: TerrainTile, x: number, z: number): GroundSample {
  const fx = Math.max(0, Math.min(tile.n - 1, (x - tile.cx + tile.span / 2) / tile.step))
  const fz = Math.max(0, Math.min(tile.n - 1, (z - tile.cz + tile.span / 2) / tile.step))
  const ix = Math.min(tile.n - 2, Math.floor(fx)),
    iz = Math.min(tile.n - 2, Math.floor(fz))
  const u = fx - ix,
    v = fz - iz,
    k = iz * tile.n + ix
  const a = vertex(tile, k),
    b = vertex(tile, k + (u >= v ? 1 : tile.n)),
    c = vertex(tile, k + tile.n + 1)
  const wa = 1 - Math.max(u, v),
    wb = Math.abs(u - v),
    wc = Math.min(u, v)
  const blend = (key: keyof GroundSample) => wa * a[key] + wb * b[key] + wc * c[key]
  return {
    height: blend('height'),
    slope: blend('slope'),
    curvature: blend('curvature'),
    flow: blend('flow'),
    aspect: Math.atan2(
      wa * Math.sin(a.aspect) + wb * Math.sin(b.aspect) + wc * Math.sin(c.aspect),
      wa * Math.cos(a.aspect) + wb * Math.cos(b.aspect) + wc * Math.cos(c.aspect),
    ),
  }
}
export function groundAt(atlas: TerrainAtlas, x: number, z: number) {
  return sampleTile(tileAt(atlas, x, z), x, z)
}
export function pathLength(points: Point3[]) {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[2] - points[i][2]), 0)
}
export function pointAlong(points: Point3[], distance: number): Point3 {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b[0] - a[0], b[2] - a[2])
    if (distance <= length) {
      const t = Math.max(0, distance) / length
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    }
    distance -= length
  }
  return [...points[points.length - 1]]
}
