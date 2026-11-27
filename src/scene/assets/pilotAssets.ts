import {
  BoxGeometry,
  BufferGeometry,
  DataArrayTexture,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  RepeatWrapping,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const root = import.meta.env.BASE_URL + 'assets/pilot/'
const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
export const pilotVariant = query.get('pilot') === 'r1' ? 'r1' : query.get('pilot') === 'r2' ? 'r2' : 'r3'
export const simulateLateAssets = query.get('pilotLate') === '1'
export const oakAtlas = { value: null as DataArrayTexture | null }
export const hasOakAtlas = { value: false }
type PilotAssets = { oak: DataArrayTexture | null; chair: BufferGeometry | null }

async function loadOak() {
  const size = 1024
  const layerBytes = size * size * 4
  const pixels = new Uint8Array(3 * layerBytes)
  await Promise.all(
    ['diff', 'nor_gl', 'rough'].map(async (channel, layer) => {
      const response = await fetch(root + 'oak-' + channel + '.webp')
      if (!response.ok) throw Error('Missing oak ' + channel)
      const bitmap = await createImageBitmap(await response.blob(), {
        colorSpaceConversion: 'none',
        imageOrientation: 'flipY',
      })
      try {
        if (bitmap.width !== size || bitmap.height !== size) throw Error('Oak layer size mismatch')
        const canvas = new OffscreenCanvas(size, size)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(bitmap, 0, 0)
        pixels.set(ctx.getImageData(0, 0, size, size).data, layer * layerBytes)
      } finally {
        bitmap.close()
      }
    }),
  )
  const atlas = new DataArrayTexture(pixels, size, size, 3)
  atlas.name = 'oak_int · albedo sRGB / normal GL / roughness'
  atlas.magFilter = LinearFilter
  atlas.minFilter = LinearMipmapLinearFilter
  atlas.wrapS = atlas.wrapT = RepeatWrapping
  atlas.generateMipmaps = atlas.needsUpdate = true
  return atlas
}

/** Flatten source node transforms; installation dimensions and orientation come from project data. */
async function loadChair() {
  const gltf = await new GLTFLoader().loadAsync(root + 'dining-chair.glb')
  gltf.scene.updateMatrixWorld(true)
  const parts: BufferGeometry[] = []
  try {
    gltf.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return
      const part = node.geometry.clone().applyMatrix4(node.matrixWorld)
      parts.push(part)
      node.geometry.dispose()
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) mat.dispose()
    })
    const geometry = mergeGeometries(parts)
    if (!geometry) throw Error('Chair has no compatible geometry')
    geometry.rotateY(Math.PI) // Source back faces −Z; the furniture data uses +Z.
    return normalizeChair(geometry)
  } finally {
    parts.forEach((g) => g.dispose())
  }
}

function normalizeChair(geometry: BufferGeometry) {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const size = box.getSize(new Vector3()),
    centre = box.getCenter(new Vector3())
  if (Math.min(size.x, size.y, size.z) <= 0) {
    geometry.dispose()
    throw Error('Empty chair envelope')
  }
  geometry.translate(-centre.x, -centre.y, -centre.z).scale(1 / size.x, 1 / size.y, 1 / size.z)
  geometry.computeBoundingSphere()
  return geometry
}

export function proceduralChair() {
  const pieces: BoxGeometry[] = []
  function piece(x: number, y: number, z: number, w: number, h: number, d: number) {
    pieces.push(new BoxGeometry(w, h, d).translate(x, y, z))
  }
  piece(0, 0.45, 0, 0.41, 0.055, 0.4)
  piece(0, 0.71, 0.18, 0.39, 0.44, 0.048)
  for (const x of [-0.16, 0.16]) for (const z of [-0.15, 0.15]) piece(x, 0.214, z, 0.037, 0.428, 0.036)
  const chair = mergeGeometries(pieces)!
  pieces.forEach((g) => g.dispose())
  return normalizeChair(chair)
}

const batches = new Map<InstancedMesh, BufferGeometry>()
let glb: BufferGeometry | null = null
let walking = false
export function registerChairMesh(mesh: InstancedMesh) {
  batches.set(mesh, mesh.geometry)
  if (walking && glb) mesh.geometry = glb
  return () => batches.delete(mesh)
}
export function setChairWalkthrough(walk: boolean) {
  if (walking === walk) return
  walking = walk
  for (const [mesh, procedural] of batches) mesh.geometry = (walk && glb) || procedural
}

export async function loadPilotAssets(): Promise<PilotAssets> {
  // A failed channel selects the complete procedural finish; a missing GLB leaves the chair installed.
  const [oak, chair] = await Promise.all([
    pilotVariant !== 'r1' ? loadOak().catch(() => null) : null,
    pilotVariant === 'r3' ? loadChair().catch(() => null) : null,
  ])
  return { oak, chair }
}
export function installPilotAssets(assets: PilotAssets) {
  glb = assets.chair
  oakAtlas.value = assets.oak
  hasOakAtlas.value = !!assets.oak
  for (const [mesh, fallback] of batches) mesh.geometry = (walking && glb) || fallback
}
export function releasePilotAssets(assets: PilotAssets) {
  if (glb === assets.chair && oakAtlas.value === assets.oak) installPilotAssets({ oak: null, chair: null })
  assets.oak?.dispose()
  assets.chair?.dispose()
}
export function reportPilotAssets(canvas: HTMLCanvasElement) {
  canvas.dataset.pilot = pilotVariant
  canvas.dataset.pilotTexture = hasOakAtlas.value ? 'oak-array' : 'procedural'
  canvas.dataset.pilotChair = glb ? 'glb' : 'procedural'
}
