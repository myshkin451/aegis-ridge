import { describe, expect, it } from 'vitest'
import { Box3, InstancedMesh, Matrix4, Vector3 } from 'three'
import { defaultBlueprint } from '../src/data/defaultBlueprint'
import { CORRIDOR, FLOORS } from '../src/data/floors'
import { footprint, shaftsAt } from '../src/geometry/coords'
import { roomDoor } from '../src/geometry/doors'
import { equipmentSolids } from '../src/geometry/equipment'
import { drawEquipment } from '../src/scene/rooms/roomModels'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'
import { useShelterStore } from '../src/store/useShelterStore'

const rooms = defaultBlueprint.rooms
const all = rooms.flatMap((room) => room.equipment)
it('assigns unique equipment tags across all 26 blueprints', () => {
  expect(rooms).toHaveLength(26)
  expect(new Set(all.map((u) => u.tagCode)).size).toBe(all.length)
})
describe.each(rooms)('$id', (room) => {
  const r = footprint(room.bounds),
    f = FLOORS[room.floorId]
  const height = room.clearHeightOverride ?? f.clearHeight
  it('keeps real instance extents inside the room and each rated installation envelope', () => {
    expect(room.equipment.length).toBeGreaterThan(0)
    for (const unit of room.equipment) {
      const {
          position: [x, y, z],
          moduleSizeM: [w, h, d],
        } = unit,
        tag = unit.tagCode
      const box = new Box3(new Vector3(x - w / 2, y, z - d / 2), new Vector3(x + w / 2, y + h, z + d / 2))
      expect(
        new Box3(new Vector3(r.x0, -0.001, r.z0), new Vector3(r.x1, height + 0.001, r.z1)).containsBox(box),
        tag,
      ).toBe(true)
      const builder = new ModelBuilder()
      drawEquipment(builder, room.floorId, unit)
      const model = builder.build()
      try {
        const rendered = new Box3().setFromObject(model.object, true)
        expect(rendered.isEmpty(), tag).toBe(false)
        expect(
          box.clone().expandByScalar(0.015).containsBox(rendered),
          tag + ' measured ' + JSON.stringify(rendered),
        ).toBe(true)
        for (const mesh of model.object.children)
          if (mesh instanceof InstancedMesh) {
            expect(
              mesh.userData.equipmentTags.every((t: string) => t === tag),
              tag,
            ).toBe(true)
            const instance = new Matrix4()
            mesh.getMatrixAt(0, instance)
            expect(instance.determinant(), tag).toBeGreaterThan(0)
          }
      } finally {
        model.dispose()
      }
    }
  })
  it('keeps the installed solids of distinct devices clear of one another', () => {
    const solids = room.equipment.flatMap((u) =>
      equipmentSolids(u).map((s) => ({
        tag: u.tagCode,
        box: new Box3()
          .setFromCenterAndSize(new Vector3(...s.center), new Vector3(...s.size))
          .expandByScalar(-0.001),
      })),
    )
    for (let i = 0; i < solids.length; i++)
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i],
          b = solids[j]
        if (a.tag !== b.tag) expect(a.box.intersectsBox(b.box), a.tag + ' / ' + b.tag).toBe(false)
      }
  })
  it('has rated quantities, explicit conversion efficiencies and separated generation and loads', () => {
    for (const u of room.equipment) {
      for (const v of [u.heatRejectionKw, u.heatKw, u.inputPowerKw, u.generatedPowerKw, u.o2RateKgPerDay]) {
        expect(Number.isFinite(v), u.tagCode).toBe(true)
        expect(v, u.tagCode).toBeGreaterThanOrEqual(0)
      }
      expect(u.powerKw).toBeCloseTo(u.inputPowerKw - u.generatedPowerKw)
      expect(u.weightKg).toBeGreaterThan(0)
      expect(u.moduleSizeM.every((v) => Number.isFinite(v) && v > 0)).toBe(true)
      if (u.generatedPowerKw) {
        expect(u.thermalEfficiency).toBeGreaterThan(0)
        expect(u.thermalEfficiency).toBeLessThan(1)
        expect(u.heatKw).toBeCloseTo(u.generatedPowerKw * (1 / u.thermalEfficiency! - 1))
      } else expect(u.thermalEfficiency).toBeNull()
    }
  })
  it('keeps anchors, door approaches, corridor and shaft openings free for the walking capsule', () => {
    expect(room.cameraAnchors.length).toBeGreaterThanOrEqual(1)
    expect(room.cameraAnchors.length).toBeLessThanOrEqual(3)
    const solid = room.equipment.flatMap((e) => equipmentSolids(e).map((s) => ({ ...s, tag: e.tagCode })))
    const bounds = solid
      .filter((b) => b.center[1] - b.size[1] / 2 < 1.75 && b.center[1] + b.size[1] / 2 > 0.2)
      .map((b) => ({
        tag: b.tag,
        x0: b.center[0] - b.size[0] / 2,
        x1: b.center[0] + b.size[0] / 2,
        z0: b.center[2] - b.size[2] / 2,
        z1: b.center[2] + b.size[2] / 2,
      }))
    const reserved = shaftsAt(f.elevation).map((s) => ({ ...s, label: s.id as string }))
    if (room.floorId.startsWith('B')) {
      reserved.push({ ...reserved[0], ...footprint(CORRIDOR), label: '主走廊' })
      const {
        base: [x, , z],
      } = roomDoor(room)
      reserved.push({ ...reserved[0], x0: x - 0.93, x1: x + 0.93, z0: z - 0.8, z1: z + 0.8, label: '门洞' })
    }
    for (const b of bounds)
      for (const area of reserved)
        expect(
          b.x1 <= area.x0 || b.x0 >= area.x1 || b.z1 <= area.z0 || b.z0 >= area.z1,
          b.tag + ' / ' + area.label,
        ).toBe(true)
    for (const a of room.cameraAnchors) {
      const [x, y, z] = a.position
      expect(y).toBe(1.65)
      expect(x >= r.x0 + 0.25 && x <= r.x1 - 0.25 && z >= r.z0 + 0.25 && z <= r.z1 - 0.25, a.name).toBe(true)
      expect(a.target.every(Number.isFinite)).toBe(true)
      expect(new Vector3(...a.position).distanceTo(new Vector3(...a.target))).toBeGreaterThan(0.5)
      for (const b of bounds)
        expect(
          Math.hypot(Math.max(0, b.x0 - x, x - b.x1), Math.max(0, b.z0 - z, z - b.z1)),
          b.tag + ' / ' + a.name,
        ).toBeGreaterThanOrEqual(0.25)
    }
  })
})
it('enters the selected floor and uses both the chosen eye position and the look target', () => {
  const store = useShelterStore
  for (const room of rooms)
    for (const [i, a] of room.cameraAnchors.entries()) {
      store.getState().focusRoom(room.id, room.equipment[0].tagCode)
      store.getState().selectAnchor(i)
      store.getState().enterRoom()
      expect(store.getState()).toMatchObject({
        floor: room.floorId,
        lastFloor: room.floorId,
        cameraState: 'walkthrough',
        landing: [a.position[0], FLOORS[room.floorId].elevation, a.position[2]],
        landingTarget: [a.target[0], FLOORS[room.floorId].elevation + a.target[1], a.target[2]],
      })
    }
})
