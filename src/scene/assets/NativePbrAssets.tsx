import { createContext, useContext, useLayoutEffect, useRef } from 'react'
import { Euler, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three'
import { useBuildingCut } from '../BuildingSection'
import type { NativePackLibrary } from './commonsLibrary'

type XYZ = readonly [number, number, number]
export interface NativeAssetPlacement {
  /** Key formatted as `<pack>/<id>`, e.g. `b2-wing/armchair` or `upper-b1/crate`. */
  asset: string
  position: XYZ
  size: XYZ
  yaw?: number
  pitch?: number
  roll?: number
}

export const NativePacksContext = createContext<NativePackLibrary | null>(null)

/** Instanced native-PBR GLB renderer shared by parallel fortress room branches. */
export function NativePbrAssets({
  name,
  placements,
}: {
  name: string
  placements: readonly NativeAssetPlacement[]
}) {
  const parent = useRef<Group>(null)
  const library = useContext(NativePacksContext)
  const cut = useBuildingCut()
  useLayoutEffect(() => {
    if (!library || placements.length === 0) return
    const root = parent.current!
    const byMesh = new Map<Mesh, Matrix4[]>()
    for (const placement of placements) {
      const asset = library.assets.get(placement.asset)
      if (!asset) continue
      const orientation = new Quaternion().setFromEuler(
        new Euler(placement.pitch ?? 0, placement.yaw ?? 0, placement.roll ?? 0, 'YXZ'),
      )
      const installation = new Matrix4()
        .compose(
          new Vector3(...placement.position),
          orientation,
          new Vector3(...placement.size).divide(asset.size),
        )
        .multiply(new Matrix4().makeTranslation(-asset.base.x, -asset.base.y, -asset.base.z))
      asset.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return
        let transforms = byMesh.get(object)
        if (!transforms) byMesh.set(object, (transforms = []))
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
        mesh.dispose()
      }
    }
  }, [placements, library, cut])
  return <group ref={parent} name={name} userData={{ fitout: true, skipWalk: true }} />
}
