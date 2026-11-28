import {
  BufferGeometry,
  InstancedBufferGeometry,
  InstancedMesh,
  Line,
  LOD,
  Material,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  DirectionalLight,
  SpotLight,
  Vector2,
  type Camera,
  type Sphere,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three'
import type { exposureProcessor } from '../photo/capturePhotograph'
import type { EffectComposer, EffectPass } from 'postprocessing'
import { useShelterStore } from '../../store/useShelterStore'
import { setChairWalkthrough } from '../assets/pilotAssets'
import type { N8AOPostPass } from 'n8ao'

export function precompileSurvey(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  pipe: EffectComposer,
  ao: N8AOPostPass,
  depthOfField: EffectPass,
  exposure: ReturnType<typeof exposureProcessor>,
) {
  // compile() alone misses local clipping, shadow depth, post passes and transparency variants.
  // Exercise their real draw paths on a tiny buffer, before opening the interactive viewport.
  setChairWalkthrough(true)
  const size = gl.getSize(new Vector2())
  const objects: [Object3D, boolean, boolean, boolean][] = []
  const lods: LOD[] = []
  const lights: (DirectionalLight | SpotLight)[] = []
  const indoorCasters: Object3D[] = []
  const materials = new Map<Material, boolean>()
  // Programs depend on attribute layouts and instancing, not vertex counts. Draw one
  // primitive per single-material batch into the warm passes, including shadow maps.
  const geometries = new Map<BufferGeometry, { count: number; minDraw: number }>()
  const grouped = new Set<BufferGeometry>()
  const instances = new Map<InstancedMesh, [number, Sphere | null]>()
  const instancedBuffers = new Map<InstancedBufferGeometry, number>()
  scene.traverse((o) => {
    if ((o instanceof DirectionalLight || o instanceof SpotLight) && o.castShadow) lights.push(o)
    objects.push([o, o.visible, o.frustumCulled, o.castShadow])
    if (o.userData.localDoorShadow || o.userData.localFurnitureShadow) indoorCasters.push(o)
    o.visible = true
    o.frustumCulled = false
    if (o instanceof LOD && o.autoUpdate) {
      o.autoUpdate = false
      lods.push(o)
    }
    if (
      o instanceof Mesh &&
      (o.userData.localDoorShadow || (o.userData.finish && !['glass', 'lamp'].includes(o.userData.finish)))
    )
      o.castShadow = true
    if (o instanceof Mesh || o instanceof Line) {
      if (Array.isArray(o.material)) grouped.add(o.geometry)
      else {
        materials.set(o.material, o.material.transparent)
        const minDraw = o instanceof Mesh ? 3 : 2
        const prev = geometries.get(o.geometry)
        if (!prev) geometries.set(o.geometry, { count: o.geometry.drawRange.count, minDraw })
        else prev.minDraw = Math.max(prev.minDraw, minDraw)
      }
      if (o instanceof InstancedMesh && !instances.has(o)) {
        instances.set(o, [o.count, o.boundingSphere])
        o.count = Math.min(1, o.count)
      }
      if (o.geometry instanceof InstancedBufferGeometry && !instancedBuffers.has(o.geometry)) {
        instancedBuffers.set(o.geometry, o.geometry.instanceCount)
        o.geometry.instanceCount = Math.min(1, o.geometry.instanceCount)
      }
    }
  })
  // A shared multi-material geometry can require a different shader for each group.
  for (const geometry of grouped) geometries.delete(geometry)
  for (const [geometry, { count, minDraw }] of geometries) geometry.drawRange.count = Math.min(minDraw, count)
  pipe.setSize(8, 8, false)
  gl.setRenderTarget(pipe.inputBuffer)
  gl.compile(scene, camera)
  performance.mark('ars-open-compile')
  gl.setRenderTarget(null)
  depthOfField.enabled = true
  const finalPass = pipe.passes[pipe.passes.length - 1]
  const warmLinearOutput = () => {
    finalPass.renderToScreen = false
    finalPass.render(gl, pipe.inputBuffer, pipe.outputBuffer, 0, false)
    finalPass.renderToScreen = true
  }
  for (const caster of indoorCasters) caster.castShadow = false
  for (const light of lights) light.shadow.needsUpdate = light instanceof DirectionalLight
  gl.shadowMap.needsUpdate = true
  pipe.render(0)
  warmLinearOutput()
  exposure.warm(gl, pipe.outputBuffer.texture)
  performance.mark('ars-open-opaque')
  for (const [m, transparent] of materials)
    if (
      !transparent &&
      !m.userData.staticVegetationOpacity &&
      (m instanceof MeshStandardMaterial || m.type === 'LineBasicMaterial')
    ) {
      m.transparent = true
      m.needsUpdate = true
    }
  const ortho = new OrthographicCamera(-20, 20, 12, -12, 0.5, 15000)
  ortho.position.copy(camera.position)
  ortho.quaternion.copy(camera.quaternion)
  ortho.updateMatrixWorld()
  pipe.setMainCamera(ortho)
  ao.camera = ortho
  for (const caster of indoorCasters) caster.castShadow = true
  for (const light of lights) light.shadow.needsUpdate = light instanceof SpotLight
  gl.shadowMap.needsUpdate = true
  pipe.render(0)
  warmLinearOutput()
  depthOfField.enabled = false
  gl.setRenderTarget(null)
  performance.mark('ars-open-faded')
  for (const [o, visible, cull, casts] of objects) {
    o.visible = visible
    o.frustumCulled = cull
    o.castShadow = casts
  }
  for (const [geometry, { count }] of geometries) geometry.drawRange.count = count
  for (const [geometry, count] of instancedBuffers) geometry.instanceCount = count
  for (const [mesh, [count, sphere]] of instances) {
    mesh.count = count
    mesh.boundingSphere = sphere
  }
  for (const lod of lods) lod.autoUpdate = true
  for (const [m, t] of materials)
    if (m.transparent !== t) {
      m.transparent = t
      m.needsUpdate = true
    }
  pipe.setMainCamera(camera)
  ao.camera = camera
  // postprocessing deletes/reinserts PERSPECTIVE_CAMERA after the orthographic pass.
  // Three also keys programs on define insertion order. Exercise the restored variants.
  depthOfField.render(gl, pipe.inputBuffer, pipe.outputBuffer, 0, false)
  warmLinearOutput()
  gl.setRenderTarget(null)
  pipe.setSize(size.x, size.y, false)
  for (const light of lights) light.shadow.needsUpdate = light instanceof DirectionalLight
  setChairWalkthrough(useShelterStore.getState().cameraState === 'walkthrough')
}
