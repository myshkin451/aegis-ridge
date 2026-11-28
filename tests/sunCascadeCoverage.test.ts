import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Scene, Vector3 } from 'three'
import { CSM } from 'three/addons/csm/CSM.js'
import { sunCascadeCoverage } from '../src/scene/atmosphere/sunCascadeCoverage'

describe('outdoor solar shadow coverage', () => {
  it('keeps every receiver in its last rendered map during turns and travel, and refreshes light and geometry changes', () => {
    const camera = new PerspectiveCamera(24, 1728 / 1117, 0.8, 12_000)
    const direction = new Vector3(-0.9, -0.34, -0.22).normalize()
    const sun = new CSM({ camera, parent: new Scene(), lightDirection: direction,
      cascades: 3, maxFar: 520, shadowMapSize: 2048, mode: 'practical', lightMargin: 90 })
    const update = sunCascadeCoverage()
    const point = new Vector3()
    let draws = 0
    function render(force: boolean, time: number) {
      camera.updateMatrixWorld()
      update(sun, force, time, true)
      for (const [index, light] of sun.lights.entries()) {
        if (light.shadow.needsUpdate) {
          light.updateMatrixWorld()
          light.target.updateMatrixWorld()
          light.shadow.updateMatrices(light)
          light.shadow.needsUpdate = false
          draws++
        }
        const { near, far } = sun.frustums[index].vertices
        for (const corner of [...near, ...far]) {
          point.copy(corner).applyMatrix4(camera.matrixWorld).project(light.shadow.camera)
          expect(Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z))).toBeLessThanOrEqual(1 + 1e-7)
        }
      }
    }
    for (let frame = 0; frame < 180; frame++) {
      const angle = frame / 180 * Math.PI
      camera.position.set(98 * Math.cos(angle), 20, 98 * Math.sin(angle))
      camera.lookAt(0, 9, 0)
      render(frame === 0, frame / 60)
    }
    expect(draws).toBeLessThan(180 * sun.cascades / 2)
    camera.position.add(new Vector3(420, -70, 600))
    camera.rotateY(1.8)
    render(false, 3.1)
    sun.lightDirection.set(0.7, -0.3, 0.6).normalize()
    const before = draws
    render(true, 3.2)
    expect(draws - before).toBe(sun.cascades)
    sun.remove()
    sun.dispose()
  })
})
