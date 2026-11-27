import {
  BoxGeometry,
  BufferGeometry,
  DataArrayTexture,
  InstancedMesh,
  Mesh,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { loadFinishAtlas, type FinishAtlas } from './finishAtlas'
import { fieldPrints, finishScans, mipBytes, scanSize } from './finishScans'
import { loadDomesticAssets, installDomesticAssets, disposeDomesticAssets, setDomesticWalkthrough, type DomesticLibrary } from './domesticAssets'

const root = import.meta.env.BASE_URL + 'assets/pilot/'
const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
export const pilotVariant = query.get('pilot') === 'r1' ? 'r1' : query.get('pilot') === 'r2' ? 'r2' : 'r3'
export const simulateLateAssets = query.get('pilotLate') === '1'
export const materialAtlas = { value: null as DataArrayTexture | null }
export const materialScanMask = { value: 0 }
export const fieldPrintMask = { value: 0 }
export const walkingMaterials = { value: false }
type PilotAssets = { finishes: FinishAtlas | null; chair: BufferGeometry | null; domestic: DomesticLibrary | null }
let installed: PilotAssets | undefined

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
  walkingMaterials.value = walk
  setDomesticWalkthrough(walk)
  if (walking === walk) return
  walking = walk
  for (const [mesh, procedural] of batches) mesh.geometry = (walk && glb) || procedural
}

export async function loadPilotAssets(): Promise<PilotAssets> {
  const [finishes, chair, domestic] = await Promise.all([
    pilotVariant !== 'r1' ? loadFinishAtlas(pilotVariant === 'r3').catch(() => null) : null,
    pilotVariant === 'r3' ? loadChair().catch(() => null) : null,
    pilotVariant === 'r3' ? loadDomesticAssets().catch(() => null) : null,
  ])
  return { finishes, chair, domestic }
}

export function installPilotAssets(assets: PilotAssets) {
  installed = assets
  glb = assets.chair
  materialAtlas.value = assets.finishes?.texture ?? null
  materialScanMask.value = assets.finishes?.scanMask ?? 0
  fieldPrintMask.value = assets.finishes?.printMask ?? 0
  installDomesticAssets(assets.domestic)
  for (const [mesh, fallback] of batches) mesh.geometry = (walking && glb) || fallback
}

export function releasePilotAssets(assets: PilotAssets) {
  if (installed === assets) {
    installPilotAssets({ finishes: null, chair: null, domestic: null })
    installed = undefined
  }
  assets.finishes?.texture.dispose()
  assets.chair?.dispose()
  if (assets.domestic) disposeDomesticAssets(assets.domestic)
}

export function reportPilotAssets(canvas: HTMLCanvasElement) {
  const count = finishScans.filter((_, i) => materialScanMask.value & (1 << i)).length
  const depth = materialAtlas.value?.image.depth ?? 0
  canvas.dataset.pilot = pilotVariant
  canvas.dataset.pilotTexture = count ? 'finish-array' : 'procedural'
  canvas.dataset.pilotFinishes = String(count)
  canvas.dataset.pilotArt = fieldPrintMask.value === (1 << fieldPrints.length) - 1 ? '1' : '0'
  canvas.dataset.pilotTextureBytes = String(mipBytes(scanSize, depth))
  canvas.dataset.pilotDomestic = String(installed?.domestic?.size ?? 0)
  canvas.dataset.pilotChair = glb ? 'glb' : 'procedural'
}
