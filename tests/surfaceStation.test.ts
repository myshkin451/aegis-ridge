import { describe, expect, it } from 'vitest'
import { DoubleSide, Ray } from 'three'
import { FLOORS } from '../src/data/floors'
import { footprint } from '../src/geometry/coords'
import { doors, type WallAxis } from '../src/geometry/doors'
import { surfaceEnvelopeModels } from '../src/scene/SurfaceStation'
import { closedDoors } from '../src/scene/utils/shellGeometry'
import { appendSolids, positionGeometry } from '../src/scene/utils/solidGeometry'
import { WalkCollision } from '../src/scene/camera/walkCollision'

function buildFloorWorld(floor: 'L1' | 'L2', includeLeaves: boolean) {
  const models = surfaceEnvelopeModels()[floor === 'L1' ? 'l1' : 'l2']
  if (includeLeaves) models.push(closedDoors(floor))
  const vertices: number[] = []
  for (const builder of models) {
    const built = builder.build()
    appendSolids(built.object, vertices, () => true)
    built.dispose()
  }
  return new WalkCollision(positionGeometry(vertices))
}

function hitsWall(world: WalkCollision, axis: WallAxis, fixed: number, along: number, y: number) {
  const ray = new Ray()
  if (axis === 'x') {
    ray.origin.set(along, y, fixed - 0.55)
    ray.direction.set(0, 0, 1)
  } else {
    ray.origin.set(fixed - 0.55, y, along)
    ray.direction.set(1, 0, 0)
  }
  return !!world.tree.raycastFirst(ray, DoubleSide, 0, 1.1)
}

describe('地表站房外立面封闭性', () => {
  it('seals the entire L1 perimeter from floor to slab underside (including the 3.6–4.1 m plenum band)', () => {
    const r = footprint(FLOORS.L1.bounds)
    const closed = buildFloorWorld('L1', true)
    const open = buildFloorWorld('L1', false)
    try {
      const checkEdge = (axis: WallAxis, fixed: number, start: number, end: number) => {
        for (let p = start + 0.15; p < end - 0.15; p += 0.15) {
          for (const y of [0.3, 1.8, 2.8, 3.35, 3.85, 4.05]) {
            expect(
              hitsWall(closed, axis, fixed, p, y),
              `L1 ${axis}=${fixed} along=${p.toFixed(2)} y=${y}`,
            ).toBe(true)
          }
        }
      }
      checkEdge('x', r.z0, r.x0, r.x1)
      checkEdge('x', r.z1, r.x0, r.x1)
      checkEdge('z', r.x0, r.z0, r.z1)
      checkEdge('z', r.x1, r.z0, r.z1)

      // Surveyed exterior doors remain unobstructed when leaves are open.
      for (const id of ['garage-west', 'garage-east', 'entry']) {
        const d = doors.find((door) => door.id === id)!
        expect(hitsWall(open, 'x', d.base[2], d.base[0], 1.4), id + ' clear opening').toBe(false)
      }
    } finally {
      closed.dispose()
      open.dispose()
    }
  })

  it('seals the entire L2 perimeter, plenum eave band, and twin greenhouse gable ends', () => {
    const r = footprint(FLOORS.L2.bounds)
    const world = buildFloorWorld('L2', true)
    try {
      const checkEdge = (axis: WallAxis, fixed: number, start: number, end: number, heights: number[]) => {
        for (let p = start + 0.15; p < end - 0.15; p += 0.15) {
          for (const y of heights) {
            expect(
              hitsWall(world, axis, fixed, p, y),
              `L2 ${axis}=${fixed} along=${p.toFixed(2)} y=${y}`,
            ).toBe(true)
          }
        }
      }
      // Observatory perimeter sealed continuously up into the roof deck (y = 0.4..4.05).
      checkEdge('x', r.z0, r.x0, 2, [0.4, 2.1, 3.3, 3.85, 4.05])
      checkEdge('x', r.z1, r.x0, 2, [0.4, 2.1, 3.3, 3.85, 4.05])
      checkEdge('z', r.x0, r.z0, r.z1, [0.4, 2.1, 3.3, 3.85, 4.05])
      // Greenhouse perimeter sealed from knee wall up to the eave header (y = 0.4..3.58).
      checkEdge('x', r.z0, 2, r.x1, [0.4, 2.1, 3.3, 3.55])
      checkEdge('x', r.z1, 2, r.x1, [0.4, 2.1, 3.3, 3.55])
      checkEdge('z', r.x1, r.z0, r.z1, [0.4, 2.1, 3.3, 3.55])
      // Both twin greenhouse gable ends (north and south) are sealed up to their ridges.
      for (const z of [r.z0, r.z1]) {
        for (const ridgeX of [4.5, 9.5]) {
          for (const [dx, y] of [
            [0, 4.15],
            [-1.1, 3.9],
            [1.1, 3.9],
          ]) {
            expect(hitsWall(world, 'x', z, ridgeX + dx, y), `L2 gable z=${z} x=${ridgeX + dx} y=${y}`).toBe(
              true,
            )
          }
        }
      }
    } finally {
      world.dispose()
    }
  })
})
