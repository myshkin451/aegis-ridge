import { describe, expect, it } from 'vitest'
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { defaultBlueprint } from '../src/data/defaultBlueprint'
import { dimensionText, millimetres, useMeasurements } from '../src/store/useMeasurements'
import { closestFeature, drawingEdges, surfaceEdges } from '../src/scene/measurement/snapping'
import { cutWallEdges } from '../src/scene/measurement/wallSections'
import { roomStructure } from '../src/scene/utils/shellGeometry'
import { ModelBuilder } from '../src/scene/utils/modelBuilder'

describe('measured dimensions', () => {
  it('rounds the actual three-dimensional distance once and supports consecutive pairs and clear', () => {
    const s = useMeasurements
    s.setState({ enabled: true, dimensions: [], start: null })
    const a = { world: [0, 0, 0] as [number, number, number], feature: '端点' }
    const b = { world: [1.2, .9, 2] as [number, number, number], feature: '端点' }
    const c = { world: [1.2, .9, 2.0006] as [number, number, number], feature: '端点' }
    expect(millimetres(a.world, b.world)).toBe(2500)
    for (const p of [a, a, b, b, c]) s.getState().mark(p)
    expect(s.getState().dimensions.map(dimensionText)).toEqual(['2 500 mm', '1 mm'])
    expect(s.getState().start).toBeNull()
    s.getState().toggle()
    expect(s.getState().dimensions).toHaveLength(2)
    s.getState().clear()
    expect(s.getState().dimensions).toEqual([])
  })

  it('uses the chosen plan elevation and the real 2 m corridor and 4 m shaft grid', () => {
    const edges = drawingEdges({ kind: 'plan', floor: 'B2', at: -13.2 }, defaultBlueprint.rooms)
    const cam = new OrthographicCamera(-16, 16, 12, -12, .1, 100)
    cam.position.set(0, 30, 0)
    cam.up.set(0, 0, -1)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld()
    const closed = edges.filter((edge) => edge.name.includes('重载货梯'))
    expect(closed.some(({ a, b }) => millimetres(a.toArray(), b.toArray()) === 4000)).toBe(true)
    const start = [-8.8, -13.2, -2] as [number, number, number]
    const p = new Vector3(-8.76, -13.2, .012).project(cam)
    const picked = closestFeature(edges, new Vector2(800 * (1 + p.x), 600 * (1 - p.y)), cam, 1600, 1200, start, 7)
    expect(picked?.world).toEqual([-8.8, -13.2, 0])
    expect(millimetres(start, picked!.world)).toBe(2000)
    expect(edges.every(({ a, b }) => a.y === -13.2 && b.y === -13.2)).toBe(true)
  })

  it('restricts section snapping to rooms and installations intersected by the cut', () => {
    const section = drawingEdges({ kind: 'section', at: 5.75 }, defaultBlueprint.rooms)
    expect(section.length).toBeGreaterThan(0)
    expect(section.every(({ a, b }) => a.z === 5.75 && b.z === 5.75)).toBe(true)
    expect(section.some(({ name }) => name.includes('房界'))).toBe(true)
    expect(section.some(({ name }) => name.includes('安装轮廓'))).toBe(true)
    expect(section.some(({ name }) => name.includes('主控室'))).toBe(false)
  })

  it('measures cut masonry faces and both jambs from the installed B2 partition model', () => {
    const builder = new ModelBuilder()
    roomStructure(builder, 'B2')
    const model = builder.build()
    try {
      model.object.position.y = -14.4
      model.object.updateMatrixWorld(true)
      for (const { material } of model.materials) material.userData.walkSurface = 'wall'
      const cut = cutWallEdges(model.object, { kind: 'plan', floor: 'B2', at: -13.2 })
      const faces = cut.filter(({ a, b, name }) => name === '实墙面' && a.z === b.z &&
        Math.min(a.x, b.x) < 1.6 && Math.max(a.x, b.x) > 1.6).map(edge => edge.a.z)
      const lower = faces.find(z => Math.abs(z - 5.075) < .00001)
      const upper = faces.find(z => Math.abs(z - 6.925) < .00001)
      expect(Math.round(1000 * (upper! - lower!))).toBe(1850)
      const camera = new OrthographicCamera(-28.8, 28.8, 18, -18, .1, 200)
      camera.position.set(0, 100, 0)
      camera.up.set(0, 0, -1)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
      const edges = cut.concat(drawingEdges({ kind: 'plan', floor: 'B2', at: -13.2 }, defaultBlueprint.rooms, 'equipment'))
      const pick = (z: number, start?: [number, number, number]) =>
        closestFeature(edges, new Vector2(760, Math.round(450 + z * 25)), camera, 1440, 900, start, 7)!
      const a = pick(5.075), b = pick(6.925, a.world)
      expect(a.feature).toContain('实墙面')
      expect(b.feature).toContain('实墙面')
      expect(millimetres(a.world, b.world)).toBe(1850)
      const jambs = cut.filter(({ name }) => name === '门框').flatMap(({ a }) => [a])
      const left = jambs.find(p => Math.abs(p.x - (-.985)) < .00001 && Math.abs(p.z - 7.105) < .00001)
      const right = jambs.find(p => Math.abs(p.x - (-.015)) < .00001 && Math.abs(p.z - 7.105) < .00001)
      expect(millimetres(left!.toArray(), right!.toArray())).toBe(970)
      expect(cut.some(({ a, b, name }) => name === '实墙面' && a.z === b.z && Math.abs(a.z - 7) < .09 &&
        Math.min(a.x, b.x) < -.5 && Math.max(a.x, b.x) > -.5)).toBe(false)
      const section = cutWallEdges(model.object, { kind: 'section', at: 10 })
      expect(section.some(({ a, name }) => name === '实墙面' && Math.abs(a.x - 1.075) < .00001)).toBe(true)
    } finally {
      model.dispose()
    }
  })

  it('recovers world-space edge position from a perspective projection', () => {
    const cam = new PerspectiveCamera(60, 1, .1, 100)
    const a = new Vector3(-1, 0, -3), b = new Vector3(2, 0, -14)
    const actual = a.clone().lerp(b, .62)
    const ndc = actual.clone().project(cam)
    const pick = closestFeature([{ a, b, name: '边' }], new Vector2(500 * (ndc.x + 1), 501), cam, 1000, 1000, undefined, 5)
    expect(new Vector3(...pick!.world).distanceTo(actual)).toBeLessThan(1e-9)
  })

  it('snaps to the actual installed mesh, excludes triangle diagonals and clips hidden edges', () => {
    const box = new BoxGeometry(2, 2, 2)
    const material = new MeshStandardMaterial()
    material.clippingPlanes = [new Plane(new Vector3(-1, 0, 0), 4)]
    const mesh = new InstancedMesh(box, material, 1)
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(4, 0, -10))
    mesh.userData.equipmentTags = ['EQ-1']
    const ray = new Raycaster(new Vector3(3.8, 0, 0), new Vector3(0, 0, -1))
    const edges = surfaceEdges(ray.intersectObject(mesh)[0])
    expect(edges).toHaveLength(3)
    for (const { a, b, name } of edges) {
      expect(name).toBe('EQ-1')
      expect(a.z).toBe(-9)
      expect(b.z).toBe(-9)
      expect(Math.max(a.x, b.x)).toBeLessThanOrEqual(4)
      expect(a.x === b.x || a.y === b.y).toBe(true)
    }
    box.dispose()
    material.dispose()
    mesh.dispose()
  })
})
