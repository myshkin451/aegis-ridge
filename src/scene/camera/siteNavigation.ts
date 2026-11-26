import { Box3, MathUtils, Vector3 } from 'three'
import { FLOORS } from '../../data/floors'
import { footprint } from '../../geometry/coords'
import { groundAt, type TerrainAtlas } from '../../geometry/siteElevations'

const clearance = 0.8
const walls = (['L1', 'L2'] as const).map((id) => {
  const floor = FLOORS[id],
    r = footprint(floor.bounds)
  // Include the projecting roof edge, shutters and the camera's near-plane footprint.
  return new Box3(
    new Vector3(r.x0 - 0.95, floor.elevation - 0.65, r.z0 - 0.95),
    new Vector3(r.x1 + 0.95, floor.elevation + floor.pitch + 0.8, r.z1 + 0.95),
  )
})
export function siteGround(atlas: TerrainAtlas, x: number, z: number) {
  const limit = atlas.tiles[0].span / 2
  return groundAt(atlas, MathUtils.clamp(x, -limit, limit), MathUtils.clamp(z, -limit, limit)).height
}
export function obstacleTop(atlas: TerrainAtlas, x: number, z: number) {
  let top = siteGround(atlas, x, z) + clearance
  for (const { min, max } of walls)
    if (x >= min.x && x <= max.x && z >= min.z && z <= max.z) top = Math.max(top, max.y)
  return top
}
// Sweep through the survey triangles and the two storey envelopes. Keep tangential motion at walls.
export function constrainSite(atlas: TerrainAtlas, from: Vector3, to: Vector3, result: Vector3) {
  const limit = atlas.tiles[0].span / 2 - 0.01
  const x = MathUtils.clamp(to.x, -limit, limit),
    z = MathUtils.clamp(to.z, -limit, limit)
  const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, to.y - from.y, z - from.z) / 0.7))
  const dx = (x - from.x) / steps,
    dy = (to.y - from.y) / steps,
    dz = (z - from.z) / steps
  result.copy(from)
  for (let i = 0; i < steps; i++) {
    let nx = result.x + dx,
      ny = result.y + dy,
      nz = result.z + dz
    ny = Math.max(ny, siteGround(atlas, nx, nz) + clearance + 0.001)
    for (const { min, max } of walls) {
      if (nx <= min.x || nx >= max.x || nz <= min.z || nz >= max.z || ny <= min.y || ny >= max.y) continue
      if (result.x <= min.x) nx = min.x
      else if (result.x >= max.x) nx = max.x
      else if (result.z <= min.z) nz = min.z
      else if (result.z >= max.z) nz = max.z
      else ny = max.y
    }
    result.set(nx, Math.max(ny, siteGround(atlas, nx, nz) + clearance + 0.001), nz)
  }
}
export function flightSpeed(height: number) {
  return 6 + 64 * (1 - Math.exp(-Math.max(0, height - 2) / 88))
}
