import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Group, Mesh, Raycaster, Vector3 } from 'three'
import { ADIT } from '../src/data/floors'
import { driveway, terrainBody } from '../src/scene/terrainGeometry'
import { aditCentreZ, floorSection, undergroundPlan } from '../src/scene/utils/coords'
import type { BuiltModel } from '../src/scene/utils/modelBuilder'

describe('excavated terrain meshes', () => {
  const full = new Group()
  let back: BuiltModel, front: BuiltModel
  beforeAll(() => {
    back = terrainBody('kept').build()
    front = terrainBody('removed').build()
    full.add(back.object, front.object)
    full.updateMatrixWorld()
  })
  afterAll(() => {
    back.dispose()
    front.dispose()
  })
  function hits(group: Group, origin: Vector3, direction: Vector3) {
    return new Raycaster(origin, direction)
      .intersectObject(group, true)
      .filter((h) => h.object instanceof Mesh)
  }
  it('opens the B1 adit into daylight and retains granite beside it', () => {
    const y = floorSection(ADIT.floorId).floor + 1.4
    const through = (z: number) => hits(full, new Vector3(-60, y, z), new Vector3(1, 0, 0))[0]
    expect(through(aditCentreZ).point.x).toBeGreaterThanOrEqual(undergroundPlan.x1 - 0.01)
    expect(through(aditCentreZ + ADIT.width / 2 + 0.5).point.x).toBeLessThan(undergroundPlan.x0)
  })
  it('removes the southern apron down to the B4 foundation in section', () => {
    const down = new Vector3(0, -1, 0),
      origin = new Vector3(4, 20, 12)
    expect(hits(full, origin, down)[0].point.y).toBeCloseTo(0)
    expect(hits(back.object, origin, down)[0].point.y).toBeCloseTo(floorSection('B4').slabBottom)
  })
  it('carries a continuous graded approach without rock across the road surface', () => {
    for (let i = 1; i < driveway.length; i++) {
      const a = driveway[i - 1],
        b = driveway[i]
      const span = Math.hypot(b.x - a.x, b.z - a.z)
      expect(Math.abs(b.y - a.y) / span).toBeLessThanOrEqual(0.131)
      if (i === driveway.length - 1) continue
      const under = hits(full, new Vector3(b.x, 4, b.z), new Vector3(0, -1, 0))[0]
      expect(under.point.y, 'at road station ' + i).toBeLessThanOrEqual(b.y + 0.015)
    }
  })
})
