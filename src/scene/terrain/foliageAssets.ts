import {
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { shadowUniforms } from '../atmosphere/shadowUniforms'

const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
export const vegetationV3 = query.get('veg') !== 'v2'
const root = import.meta.env.BASE_URL + 'assets/vegetation/'
const images = {
  branch: 'fir-bough.webp',
  impostor: 'fir-octa.webp',
  grass: 'alpine-grass.webp',
  shrub: 'alpine-shrub.webp',
  crop: 'crop-leaves.webp',
} as const

type FoliageAssets = Record<keyof typeof images, Texture> & {
  rockLods: BufferGeometry[]
  crown: BufferGeometry
}
let installed: FoliageAssets | undefined

export function getFoliageAssets(): FoliageAssets {
  if (!installed) throw Error('植被资源尚未就绪')
  return installed
}

async function loadFieldMeshes() {
  const { scene } = await new GLTFLoader().loadAsync(root + 'boulder-lods.glb')
  const lods: BufferGeometry[] = []
  try {
    scene.updateMatrixWorld(true)
    for (const name of ['rock-near', 'rock-mid', 'rock-far', 'fir-crown']) {
      const rock = scene.getObjectByName(name)
      if (!(rock instanceof Mesh) || !rock.geometry.hasAttribute(name === 'fir-crown' ? 'uv' : 'color'))
        throw Error('植被模型缺少网格或顶点属性 ' + name)
      const geometry = rock.geometry.clone().applyMatrix4(rock.matrixWorld)
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
      lods.push(geometry)
    }
    return lods
  } catch (error) {
    for (const geometry of lods) geometry.dispose()
    throw error
  } finally {
    scene.traverse((o) => {
      if (!(o instanceof Mesh)) return
      o.geometry.dispose()
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.dispose()
    })
  }
}

/** The scene owns materials and instance buffers. This opening gate owns their shared maps and meshes. */
export async function preloadFoliage(gl: WebGLRenderer, mounted: () => boolean) {
  gl.domElement.dataset.veg = vegetationV3 ? 'v3' : 'v2'
  if (!vegetationV3) return () => {}
  const resources: { dispose(): void }[] = []
  const loader = new TextureLoader()
  const maps = {} as Record<keyof typeof images, Texture>
  let meshes: BufferGeometry[] = []
  const loaded = await Promise.allSettled([
    ...Object.entries(images).map(async ([key, file]) => {
      const texture = await loader.loadAsync(root + file)
      resources.push(texture)
      texture.colorSpace = SRGBColorSpace
      maps[key as keyof typeof images] = texture
      if (mounted()) gl.initTexture(texture)
    }),
    loadFieldMeshes().then((lods) => {
      resources.push(...lods)
      meshes = lods
    }),
  ])
  const assets = { ...maps, rockLods: meshes.slice(0, 3), crown: meshes[3] }
  const release = () => {
    if (installed === assets) installed = undefined
    resources.forEach((resource) => resource.dispose())
  }
  const failed = loaded.find((result) => result.status === 'rejected')
  if (failed) {
    release()
    throw failed.reason
  }
  // A cancelled request can settle after a replacement scene has installed its own maps.
  if (mounted()) {
    installed = assets
    performance.mark('ars-open-foliage-assets')
  }
  return release
}

export function makeCropMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    name: 'crop leaves',
    map: installed?.crop ?? null,
    side: DoubleSide,
    roughness: 0.82,
    alphaTest: 0.4,
    forceSinglePass: true,
  })
  mat.customProgramCacheKey = () => 'ars-crop-transmission-v3'
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shadowUniforms)
    // Retain Three's front-lit PBR and shadow attenuation. A thin backlit blade
    // scatters a small, green-biased share of the incident light through the leaf.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_pars_fragment>',
      `#include <lights_physical_pars_fragment>
      void cropDirect(const in IncidentLight light, const in vec3 pos,
          const in vec3 n, const in vec3 viewDir, const in vec3 coatNormal,
          const in PhysicalMaterial material, inout ReflectedLight reflected) {
        RE_Direct_Physical(light, pos, n, viewDir, coatNormal, material, reflected);
        float wrap = clamp((0.30 - dot(n, light.direction)) / 1.30, 0.0, 1.0);
        reflected.directDiffuse += light.color * BRDF_Lambert(material.diffuseColor)
          * vec3(0.17, 0.26, 0.09) * wrap;
      }
      #undef RE_Direct
      #define RE_Direct cropDirect`,
    )
  }
  return mat
}
