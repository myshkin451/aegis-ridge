import { createContext, useContext, useLayoutEffect, useRef } from 'react'
import { Euler, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three'
import { useBuildingCut } from '../BuildingSection'
import type { CommonsAsset, CommonsLibrary } from './commonsLibrary'

type XYZ = readonly [number, number, number]
export interface CommonsPlacement {
  asset: CommonsAsset
  position: XYZ
  size: XYZ
  yaw?: number
  pitch?: number
  roll?: number
}
export const CommonsLibraryContext = createContext<CommonsLibrary | null>(null)

/** Positions are floor-local, in metres, about the centre of the object's base. */
export function CommonsAssets({ placements }: { placements: readonly CommonsPlacement[] }) {
  const parent = useRef<Group>(null)
  const library = useContext(CommonsLibraryContext)
  const cut = useBuildingCut()
  useLayoutEffect(() => {
    if (!library) return
    const root = parent.current!
    const byMesh = new Map<Mesh, Matrix4[]>()
    for (const placement of placements) {
      const asset = library.assets.get(placement.asset)!
      const orientation = new Quaternion().setFromEuler(
        new Euler(placement.pitch ?? 0, placement.yaw ?? 0, placement.roll ?? 0, 'YXZ'),
      )
      const installation = new Matrix4().compose(
        new Vector3(...placement.position), orientation, new Vector3(...placement.size).divide(asset.size),
      ).multiply(new Matrix4().makeTranslation(-asset.base.x, -asset.base.y, -asset.base.z))
      asset.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return
        let transforms = byMesh.get(object)
        if (!transforms) byMesh.set(object, transforms = [])
        transforms.push(new Matrix4().multiplyMatrices(installation, object.matrixWorld))
      })
    }
    const batches: InstancedMesh[] = []
    for (const [source, transforms] of byMesh) {
      const mesh = new InstancedMesh(source.geometry, source.material, transforms.length)
      for (const m of Array.isArray(source.material) ? source.material : [source.material]) {
        m.clippingPlanes = cut?.planes ?? null
        m.clipShadows = true
      }
      mesh.name = source.name
      mesh.castShadow = mesh.receiveShadow = true
      mesh.userData.localFurnitureShadow = true
      for (const [i, matrix] of transforms.entries()) mesh.setMatrixAt(i, matrix)
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      root.add(mesh)
      batches.push(mesh)
    }
    return () => {
      for (const mesh of batches) {
        root.remove(mesh)
        mesh.dispose() // Geometry, textures and materials belong to the preloaded library.
      }
    }
  }, [placements, library, cut])
  return <group ref={parent} name="B2 客厅与厨房 · 原装家具" userData={{ fitout: true, skipWalk: true }} />
}
