import {
  Box3, Group, LinearFilter, LinearMipmapLinearFilter, LoadingManager, Mesh, MeshStandardMaterial,
  Texture, Vector3, type WebGLRenderer,
} from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import dracoWrapper from 'three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url'
import dracoWasm from 'three/addons/libs/draco/gltf/draco_decoder.wasm?url'
import { shadowUniforms } from '../atmosphere/shadowUniforms'

const models = ['sofa', 'dining-chair', 'coffee-table', 'bar-stool', 'plant', 'fern', 'journal', 'platter', 'pan', 'pot', 'kettle', 'mug', 'coffee-maker'] as const
export type CommonsAsset = (typeof models)[number]
export interface SourceModel {
  scene: Group
  size: Vector3
  base: Vector3
}

function prepareMaterial(material: MeshStandardMaterial, maxAnisotropy: number) {
  for (const texture of Object.values(material)) {
    if (!(texture instanceof Texture)) continue
    texture.anisotropy = Math.min(8, maxAnisotropy)
    texture.magFilter = LinearFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.generateMipmaps = true
  }
  // GLTFLoader sets the UV set, colorspace, alpha and PBR factors. Keep all of them.
  const previousCompile = material.onBeforeCompile.bind(material)
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile(shader, renderer)
    Object.assign(shader.uniforms, shadowUniforms)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      vec3 dndx = dFdx(normal), dndy = dFdy(normal);
      float normalVariance = .5 * (dot(dndx,dndx) + dot(dndy,dndy));
      roughnessFactor = clamp(sqrt(roughnessFactor * roughnessFactor + min(normalVariance,.38)), .08, 1.);
    `)
  }
  material.customProgramCacheKey = () => 'commons-pbr-aa-v1'
}

function releaseScenes(scenes: Iterable<Group>) {
  const geometries = new Set<Mesh['geometry']>()
  const materials = new Set<MeshStandardMaterial>()
  const textures = new Set<Texture>()
  const bitmaps = new Set<ImageBitmap>()
  for (const scene of scenes) scene.traverse((node) => {
    if (!(node instanceof Mesh)) return
    geometries.add(node.geometry)
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) materials.add(m)
  })
  for (const material of materials)
    for (const v of Object.values(material)) if (v instanceof Texture) textures.add(v)
  for (const texture of textures) {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) bitmaps.add(texture.image)
    texture.dispose()
  }
  for (const bitmap of bitmaps) bitmap.close()
  for (const mat of materials) mat.dispose()
  for (const geo of geometries) geo.dispose()
}

export async function loadCommonsLibrary(gl: WebGLRenderer) {
  const assets = new Map<CommonsAsset, SourceModel>()
  const loaded: Group[] = []
  const manager = new LoadingManager()
  // Vite emits both decoder files from the installed Three version, including at a subpath deployment.
  manager.setURLModifier((url) => url === 'draco_wasm_wrapper.js' ? dracoWrapper : url === 'draco_decoder.wasm' ? dracoWasm : url)
  const draco = new DRACOLoader(manager).setWorkerLimit(2)
  const loader = new GLTFLoader(manager).setDRACOLoader(draco)
  try {
    // Wait for every worker before disposing the decoder or a partly loaded library.
    const results = await Promise.allSettled(models.map(async (id) => {
      const { scene } = await loader.loadAsync(import.meta.env.BASE_URL + 'assets/commons/' + id + '.glb')
      loaded.push(scene)
      scene.updateMatrixWorld(true)
      const bounds = new Box3().setFromObject(scene, true)
      const size = bounds.getSize(new Vector3())
      if (Math.min(size.x, size.y, size.z) <= 0) throw new Error(id + ': invalid model extent')
      const base = bounds.getCenter(new Vector3())
      base.y = bounds.min.y
      const materials = new Set<MeshStandardMaterial>()
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          if (material instanceof MeshStandardMaterial) materials.add(material)
      })
      for (const material of materials) prepareMaterial(material, gl.capabilities.getMaxAnisotropy())
      assets.set(id, { scene, size, base })
    }))
    for (const result of results) if (result.status === 'rejected') throw result.reason
    gl.domElement.dataset.commonsModels = String(assets.size)
    return { assets, dispose: () => releaseScenes(loaded) }
  } catch (error) {
    releaseScenes(loaded)
    throw error
  } finally {
    draco.dispose()
  }
}
export type CommonsLibrary = Awaited<ReturnType<typeof loadCommonsLibrary>>
