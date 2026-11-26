import {
  Line,
  LOD,
  Material,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Vector2,
  type Camera,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three'
import type { EffectComposer } from 'postprocessing'
import type { N8AOPostPass } from 'n8ao'

export function precompileSurvey(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  pipe: EffectComposer,
  ao: N8AOPostPass,
) {
  // compile() alone misses local clipping, shadow depth, post passes and transparency variants.
  // Exercise their real draw paths on a tiny buffer, before opening the interactive viewport.
  const size = gl.getSize(new Vector2())
  const objects: [Object3D, boolean, boolean, boolean][] = []
  const lods: LOD[] = []
  const materials = new Map<Material, boolean>()
  scene.traverse((o) => {
    objects.push([o, o.visible, o.frustumCulled, o.castShadow])
    o.visible = true
    o.frustumCulled = false
    if (o instanceof LOD && o.autoUpdate) {
      o.autoUpdate = false
      lods.push(o)
    }
    if (o instanceof Mesh && o.userData.finish && !['glass', 'lamp'].includes(o.userData.finish))
      o.castShadow = true
    if ((o instanceof Mesh || o instanceof Line) && !Array.isArray(o.material))
      materials.set(o.material, o.material.transparent)
  })
  pipe.setSize(8, 8, false)
  gl.setRenderTarget(pipe.inputBuffer)
  gl.compile(scene, camera)
  performance.mark('ars-open-compile')
  gl.setRenderTarget(null)
  gl.shadowMap.needsUpdate = true
  pipe.render(0)
  performance.mark('ars-open-opaque')
  for (const [m, transparent] of materials)
    if (!transparent && (m instanceof MeshStandardMaterial || m.type === 'LineBasicMaterial')) {
      m.transparent = true
      m.needsUpdate = true
    }
  const ortho = new OrthographicCamera(-20, 20, 12, -12, 0.5, 15000)
  ortho.position.copy(camera.position)
  ortho.quaternion.copy(camera.quaternion)
  ortho.updateMatrixWorld()
  pipe.setMainCamera(ortho)
  ao.camera = ortho
  gl.shadowMap.needsUpdate = true
  pipe.render(0)
  performance.mark('ars-open-faded')
  for (const [o, visible, cull, casts] of objects) {
    o.visible = visible
    o.frustumCulled = cull
    o.castShadow = casts
  }
  for (const lod of lods) lod.autoUpdate = true
  for (const [m, t] of materials)
    if (m.transparent !== t) {
      m.transparent = t
      m.needsUpdate = true
    }
  pipe.setMainCamera(camera)
  ao.camera = camera
  pipe.setSize(size.x, size.y, false)
}
