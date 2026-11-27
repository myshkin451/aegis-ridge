import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  InstancedMesh,
  Mesh,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { foldedThrow } from '../rooms/foldedThrow'

export const domesticKinds = [
  'pillow',
  'duvet',
  'sofa-cushion',
  'wc-bowl',
  'basin',
  'pleated-shade',
  'houseplant',
] as const
export type DomesticKind = (typeof domesticKinds)[number]
export type DomesticLibrary = Map<DomesticKind, BufferGeometry>
const libraryThrows = new WeakMap<DomesticLibrary, BufferGeometry>()
export const isDomestic = (name: string): name is DomesticKind =>
  (domesticKinds as readonly string[]).includes(name)

function fit(geometry: BufferGeometry) {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const size = box.getSize(new Vector3()),
    centre = box.getCenter(new Vector3())
  if (Math.min(size.x, size.y, size.z) <= 0) throw Error('Empty domestic installation envelope')
  geometry.translate(-centre.x, -centre.y, -centre.z).scale(1 / size.x, 1 / size.y, 1 / size.z)
  geometry.computeBoundingSphere()
  return geometry
}

/** Each named shell is a detachable part. Its material, dimensions and placement come from the survey. */
export async function loadDomesticAssets(): Promise<DomesticLibrary> {
  const file = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'assets/pilot/domestic.glb')
  return takeDomesticGeometry(file.scene)
}

export function takeDomesticGeometry(scene: Group): DomesticLibrary {
  const library: DomesticLibrary = new Map()
  scene.updateMatrixWorld(true)
  try {
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) return
      const geometry = node.geometry
      for (const paint of Array.isArray(node.material) ? node.material : [node.material]) paint.dispose()
      if (!isDomestic(node.name) || library.has(node.name)) {
        geometry.dispose()
        return
      }
      library.set(node.name, geometry)
      fit(geometry.applyMatrix4(node.matrixWorld))
      geometry.name = 'GLB/' + node.name
    })
    const quilt = library.get('duvet')
    if (quilt) libraryThrows.set(library, foldedThrow(quilt))
    return library
  } catch (error) {
    disposeDomesticAssets(library)
    throw error
  }
}

type Fitting = DomesticKind | 'folded-throw'
const batches = new Map<InstancedMesh, { kind: Fitting; fallback: BufferGeometry }>()
let installed: DomesticLibrary | null = null
let inRoom = false
function updateMesh(mesh: InstancedMesh, kind: Fitting, fallback: BufferGeometry) {
  const fitting = installed && (kind === 'folded-throw' ? libraryThrows.get(installed) : installed.get(kind))
  const next = (inRoom && fitting) || fallback
  if (mesh.geometry !== next) {
    mesh.geometry = next
    mesh.computeBoundingSphere()
  }
}
export function registerDomesticMesh(mesh: InstancedMesh, kind: Fitting) {
  const fallback = mesh.geometry
  batches.set(mesh, { kind, fallback })
  updateMesh(mesh, kind, fallback)
  return () => batches.delete(mesh)
}
export function setDomesticWalkthrough(walk: boolean) {
  if (inRoom === walk) return
  inRoom = walk
  for (const [mesh, { kind, fallback }] of batches) updateMesh(mesh, kind, fallback)
}
export function installDomesticAssets(library: DomesticLibrary | null) {
  installed = library
  for (const [mesh, { kind, fallback }] of batches) updateMesh(mesh, kind, fallback)
}
export function disposeDomesticAssets(library: DomesticLibrary) {
  if (installed === library) installDomesticAssets(null)
  libraryThrows.get(library)?.dispose()
  libraryThrows.delete(library)
  for (const geometry of library.values()) geometry.dispose()
}

function mergeAndFit(parts: BufferGeometry[]) {
  for (const part of parts) part.deleteAttribute('uv')
  const merged = mergeGeometries(parts)!
  for (const part of parts) part.dispose()
  return fit(merged)
}

/** Simple preloaded installations keep their dimensions and batch slots when assets arrive. */
export function fallbackBasin() {
  const profile = [
    [0.02, -0.48],
    [0.34, -0.47],
    [0.47, 0.32],
    [0.5, 0.46],
    [0.47, 0.5],
    [0.4, 0.46],
    [0.26, -0.13],
    [0.04, -0.22],
    [0.006, -0.27],
  ]
  return fit(
    new LatheGeometry(
      profile.map(([x, y]) => new Vector2(x, y)),
      20,
    ),
  )
}
export function fallbackToilet() {
  return mergeAndFit([
    new BoxGeometry(0.55, 0.93, 0.2).translate(0, 0.475, 0.33),
    new LatheGeometry(
      [
        [0.01, 0.01],
        [0.18, 0.015],
        [0.155, 0.2],
        [0.24, 0.29],
        [0.31, 0.414],
        [0.302, 0.459],
        [0.234, 0.462],
        [0.22, 0.396],
        [0.123, 0.273],
        [0.01, 0.246],
      ].map(([x, y]) => new Vector2(x, y)),
      20,
    )
      .scale(1, 1, 1.13)
      .translate(0, 0, -0.07),
  ])
}
export function fallbackPlant() {
  const parts: BufferGeometry[] = []
  for (let i = 0; i < 13; i++) {
    const a = i * 2.4,
      reach = 0.09 + (i % 3) * 0.05
    const tip = new Vector3(reach * Math.sin(a), 0.15 + (i % 4) * 0.085, reach * Math.cos(a))
    const stem = new CylinderGeometry(0.0035, 0.004, tip.length(), 4)
    stem.applyQuaternion(stemQuaternion(tip))
    parts.push(stem.translate(tip.x / 2, tip.y / 2, tip.z / 2))
    parts.push(
      new SphereGeometry(1, 8, 4)
        .scale(0.075, 0.009, 0.115)
        .rotateX(-0.5)
        .rotateY(a)
        .translate(tip.x, tip.y, tip.z),
    )
  }
  return mergeAndFit(parts)
}
function stemQuaternion(tip: Vector3) {
  return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tip.clone().normalize())
}
