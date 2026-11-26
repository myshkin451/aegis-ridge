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
function makeCut() {
  const planes = normals.map((n) => new Plane(new Vector3(...n), 25000))
  return { planes, models: new Map<BuiltModel, CutMaterial>(), group: new Group() }
}
type Cut = ReturnType<typeof makeCut>
const CutContext = createContext<Cut | null>(null)
export const useBuildingCut = () => useContext(CutContext)
export function attachCut(model: BuiltModel, cut: Cut, kind: CutMaterial) {
  cut.models.set(model, kind)
  for (const { material } of model.materials) {
    material.clippingPlanes = cut.planes
    // CSM only illuminates the intact exterior. Cutaway lighting never samples shadow maps.
    material.clipShadows = false
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
      if (type !== kind || model.object.userData.fitout) continue
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
        mesh.userData.face = i
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
      cap.userData.face = i
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
  const cut = useMemo(makeCut, [])
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => makeCaps(cut), [cut])
  useLayoutEffect(() => {
    const limits = [-box.west, box.east, -box.bottom, box.top, -box.north, box.south]
    const enabled = (i: number) =>
      kind === 'sectionBox' || (kind === 'plan' && i === 3) || (kind === 'section' && i === 5)
    cut.planes.forEach((plane, i) => {
      plane.constant = !enabled(i)
        ? 25000
        : kind === 'plan'
          ? FLOORS[floor].elevation + h
          : kind === 'section'
            ? z
            : limits[i]
    })
    cut.group.visible = !!kind
    for (const child of cut.group.children) {
      child.visible = enabled(child.userData.face)
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
