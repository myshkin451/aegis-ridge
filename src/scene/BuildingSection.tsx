import { createContext, useContext, useLayoutEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  AlwaysStencilFunc,
  BackSide,
  DecrementWrapStencilOp,
  DoubleSide,
  FrontSide,
  Group,
  IncrementWrapStencilOp,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  Plane,
  PlaneGeometry,
  Vector3,
  ZeroStencilOp,
} from 'three'
import { useThree } from '@react-three/fiber'
import { useShelterStore } from '../store/useShelterStore'
import { FLOORS } from '../data/floors'
import { sectionMaterial } from './materials/sectionShader'
import type { CutMaterial } from './materials/sectionShader'
import type { BuiltModel } from './utils/modelBuilder'
import { appendSolids, positionGeometry } from './utils/solidGeometry'

const kinds: CutMaterial[] = ['structure', 'concrete', 'granite']
const normals = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const
function makeCut(indices: number[]) {
  const planes = indices.map((i) => new Plane(new Vector3(...normals[i])))
  return { planes, models: new Map<BuiltModel, CutMaterial>(), group: new Group() }
}
type Cut = ReturnType<typeof makeCut>
const CutContext = createContext<Cut | null>(null)
export const useBuildingCut = () => useContext(CutContext)
export function attachCut(model: BuiltModel, cut: Cut, kind: CutMaterial) {
  cut.models.set(model, kind)
  for (const { material } of model.materials) {
    material.clippingPlanes = cut.planes
    material.clipShadows = true
    material.needsUpdate = true
  }
  return () => {
    cut.models.delete(model)
    for (const { material } of model.materials) {
      material.clippingPlanes = null
      material.clipShadows = false
      material.needsUpdate = true
    }
  }
}
function makeCaps(cut: Cut) {
  const releases: (() => void)[] = []
  const square = new PlaneGeometry(100, 100)
  for (const [k, kind] of kinds.entries()) {
    const vertices: number[] = []
    for (const [model, type] of cut.models) {
      if (type !== kind) continue
      const opaque = new Set(model.materials.filter((m) => m.alpha === 1).map((m) => m.material))
      appendSolids(
        model.object,
        vertices,
        (mesh) =>
          !Array.isArray(mesh.material) &&
          opaque.has(mesh.material) &&
          !['foliage', 'lamp', 'needles'].includes(mesh.userData.finish),
        true,
      )
    }
    if (!vertices.length) continue
    const geometry = positionGeometry(vertices)
    releases.push(() => geometry.dispose())
    cut.planes.forEach((plane, i) => {
      const order = -100 + (i * kinds.length + k) * 3
      for (const [j, side] of [BackSide, FrontSide].entries()) {
        const op = j ? DecrementWrapStencilOp : IncrementWrapStencilOp
        const material = new MeshBasicMaterial({
          side,
          clippingPlanes: [plane],
          depthWrite: false,
          depthTest: false,
          colorWrite: false,
          stencilWrite: true,
          stencilFunc: AlwaysStencilFunc,
          stencilFail: op,
          stencilZFail: op,
          stencilZPass: op,
        })
        const mesh = new Mesh(geometry, material)
        mesh.renderOrder = order + j
        cut.group.add(mesh)
        releases.push(() => material.dispose())
      }
      const material = sectionMaterial(kind)
      material.side = DoubleSide
      material.clipping = true
      material.clippingPlanes = cut.planes.filter((other) => other !== plane)
      material.stencilWrite = true
      material.stencilFunc = NotEqualStencilFunc
      material.stencilFail = material.stencilZFail = material.stencilZPass = ZeroStencilOp
      const cap = new Mesh(square, material)
      cap.frustumCulled = false
      cap.userData.plane = plane
      cap.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), plane.normal.clone().negate())
      cap.renderOrder = order + 2
      cap.onAfterRender = (renderer) => renderer.clearStencil()
      cut.group.add(cap)
      releases.push(() => material.dispose())
    })
  }
  return () => {
    cut.group.clear()
    square.dispose()
    releases.forEach((f) => f())
  }
}
export function BuildingSection({ children }: { children: ReactNode }) {
  const view = useShelterStore((s) => s.cameraState),
    mode = useShelterStore((s) => s.mode)
  const z = useShelterStore((s) => s.sectionZ),
    box = useShelterStore((s) => s.box)
  const h = useShelterStore((s) => s.cutHeight),
    floor = useShelterStore((s) => s.lastFloor)
  const orbitCut = useShelterStore((s) => s.orbitCut)
  const kind =
    mode === 'xray'
      ? null
      : view === 'section' || view === 'sectionBox' || view === 'plan'
        ? view
        : view === 'floorOrbit' && orbitCut
          ? 'plan'
          : null
  const cut = useMemo(
    () => kind && makeCut(kind === 'sectionBox' ? [0, 1, 2, 3, 4, 5] : kind === 'plan' ? [3] : [5]),
    [kind],
  )
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => (cut ? makeCaps(cut) : undefined), [cut, floor])
  useLayoutEffect(() => {
    if (!cut) return
    const constants =
      kind === 'sectionBox'
        ? [-box.west, box.east, -box.bottom, box.top, -box.north, box.south]
        : [kind === 'plan' ? FLOORS[floor].elevation + h : z]
    cut.planes.forEach((p, i) => {
      p.constant = constants[i]
    })
    for (const child of cut.group.children) {
      const p = child.userData.plane as Plane | undefined
      if (p) child.position.copy(p.normal).multiplyScalar(-p.constant)
    }
    gl.shadowMap.needsUpdate = true
  }, [cut, kind, box, z, floor, h, gl])
  return (
    <CutContext.Provider value={cut}>
      {children}
      {cut && <primitive object={cut.group} />}
    </CutContext.Provider>
  )
}
