import { createContext, useContext, useLayoutEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  BackSide,
  FrontSide,
  AlwaysStencilFunc,
  DecrementWrapStencilOp,
  IncrementWrapStencilOp,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  Plane,
  Vector3,
  ZeroStencilOp,
} from 'three'
import { useThree } from '@react-three/fiber'
import { useShelterStore } from '../store/useShelterStore'
import { sectionMaterial } from './materials/sectionShader'
import type { CutMaterial } from './materials/sectionShader'
import type { BuiltModel } from './utils/modelBuilder'

const kinds: CutMaterial[] = ['structure', 'concrete', 'granite']
function stencilPass(plane: Plane, back: boolean) {
  const op = back ? IncrementWrapStencilOp : DecrementWrapStencilOp
  return new MeshBasicMaterial({
    side: back ? BackSide : FrontSide,
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
}
function makeCut() {
  const plane = new Plane(new Vector3(0, 0, -1))
  return {
    plane,
    passes: [stencilPass(plane, true), stencilPass(plane, false)],
    caps: kinds.map((kind) => {
      const m = sectionMaterial(kind)
      m.stencilWrite = true
      m.stencilFunc = NotEqualStencilFunc
      m.stencilFail = m.stencilZFail = m.stencilZPass = ZeroStencilOp
      return m
    }),
  }
}
const CutContext = createContext<ReturnType<typeof makeCut> | null>(null)
export const useBuildingCut = () => useContext(CutContext)

export function attachCut(model: BuiltModel, cut: ReturnType<typeof makeCut>, kind: CutMaterial) {
  const proxies: Mesh[] = []
  const opaque = new Set(model.materials.filter((m) => m.alpha === 1).map((m) => m.material))
  for (const { material } of model.materials) {
    material.clippingPlanes = [cut.plane]
    material.clipShadows = true
    material.needsUpdate = true
  }
  for (const source of [...model.object.children]) {
    if (!(source instanceof Mesh) || !opaque.has(source.material)) continue
    // The stencil counts closed solids. Lines, transparent glazing and lamps need only clipping.
    for (const [i, material] of cut.passes.entries()) {
      let proxy: Mesh
      if (source instanceof InstancedMesh) {
        const inst = new InstancedMesh(source.geometry, material, source.count)
        inst.instanceMatrix.copy(source.instanceMatrix)
        inst.boundingSphere = source.boundingSphere
        proxy = inst
      } else proxy = new Mesh(source.geometry, material)
      proxy.renderOrder = -20 + kinds.indexOf(kind) * 3 + i
      source.add(proxy)
      proxies.push(proxy)
    }
  }
  return () => {
    for (const proxy of proxies) {
      proxy.removeFromParent()
      if (proxy instanceof InstancedMesh) proxy.dispose()
    }
    for (const { material } of model.materials) {
      material.clippingPlanes = null
      material.clipShadows = false
      material.needsUpdate = true
    }
  }
}
export function BuildingSection({ children }: { children: ReactNode }) {
  const active = useShelterStore((s) => s.mode === 'cutaway' && s.floor === 'ALL')
  const z = useShelterStore((s) => s.sectionZ)
  const cut = useMemo(makeCut, []),
    invalidate = useThree((s) => s.invalidate),
    gl = useThree((s) => s.gl)
  useLayoutEffect(() => {
    cut.plane.constant = z
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [cut, z, active, invalidate, gl])
  useLayoutEffect(
    () => () => {
      ;[...cut.passes, ...cut.caps].forEach((m) => m.dispose())
    },
    [cut],
  )
  return (
    <CutContext.Provider value={active ? cut : null}>
      {children}
      {active &&
        cut.caps.map((material, i) => (
          <mesh
            key={i}
            position={[0, -8, z]}
            renderOrder={-18 + i * 3}
            material={material}
            onAfterRender={(renderer) => renderer.clearStencil()}
          >
            <planeGeometry args={[40, 45]} />
          </mesh>
        ))}
    </CutContext.Provider>
  )
}
