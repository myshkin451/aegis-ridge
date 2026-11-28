import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Mesh, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three'
import { attachCut, useBuildingCut } from '../BuildingSection'
import type { WalkSurface } from '../mep/lens'
import type { CutMaterial } from '../materials/sectionShader'
import type { BuiltModel, ModelBuilder } from './modelBuilder'

export function reduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function setOpacity(model: BuiltModel, amount: number) {
  const casts = amount > 0.6
  const shadowChanged = casts !== model.casts
  if (shadowChanged) {
    model.shadowCasters.forEach((object) => {
      object.castShadow = casts
    })
    model.casts = casts
  }
  model.object.visible = amount > 0.001
  if (!model.object.visible) return shadowChanged
  for (const { material, alpha, depth } of model.materials) {
    const opacity = alpha * amount
    const transparent = opacity < 0.999
    if (material.transparent !== transparent) {
      material.transparent = transparent
      material.needsUpdate = true
    }
    material.opacity = opacity
    material.depthWrite = depth && !transparent
  }
  return shadowChanged
}

function orderOpaque(model: BuiltModel, order: number) {
  for (const mesh of model.object.children) {
    if (!(mesh instanceof Mesh) || Array.isArray(mesh.material)) continue
    mesh.renderOrder = mesh.material.depthWrite && !mesh.material.transparent ? order : 0
  }
}

export function Model({
  build,
  opacity = 1,
  delayMs = 0,
  cutMaterial = 'structure',
  interior = false,
  opaqueOrder = 0,
  walkSurface,
  hiddenEquipment,
}: {
  build: () => ModelBuilder
  opacity?: number
  delayMs?: number
  interior?: boolean
  opaqueOrder?: number
  hiddenEquipment?: ReadonlySet<string>
  walkSurface?: WalkSurface
  cutMaterial?: CutMaterial
}) {
  const cut = useBuildingCut()
  const mount = useRef<Group>(null)
  const model = useRef<BuiltModel | null>(null)
  const amount = useRef(opacity)
  const fade = useRef({ from: opacity, elapsed: 0 })
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)

  useLayoutEffect(() => {
    const built = build().build()
    const parent = mount.current!
    if (walkSurface)
      for (const { material } of built.materials) material.userData.walkSurface = walkSurface
    if (interior) {
      // Match the three permanent sun cascades for fit-outs installed after the initial scene traversal.
      for (const { material } of built.materials) if (material instanceof MeshStandardMaterial) {
        Object.assign((material as MeshStandardMaterial & { defines: Record<string, number> }).defines, { USE_CSM: 1, CSM_CASCADES: 3 })
      }
      built.object.userData.fitout = true
      for (const caster of built.shadowCasters) {
        caster.userData.localFurnitureShadow = true
        caster.castShadow = false
      }
      built.shadowCasters.length = 0
    }
    parent.add(built.object)
    model.current = built
    setOpacity(built, amount.current)
    gl.shadowMap.needsUpdate = true
    invalidate()
    return () => {
      parent.remove(built.object)
      built.dispose()
      model.current = null
      gl.shadowMap.needsUpdate = true
    }
  }, [build, invalidate, gl, interior, walkSurface])
  useLayoutEffect(() => {
    if (cut && model.current) return attachCut(model.current, cut, cutMaterial)
  }, [cut, cutMaterial, build])
  useLayoutEffect(() => {
    if (!hiddenEquipment?.size || !model.current) return
    const hidden = new Matrix4().makeScale(0, 0, 0)
    const saved = new Map<InstancedMesh, [number, Matrix4][]>()
    for (const mesh of model.current.object.children) {
      if (!(mesh instanceof InstancedMesh) || !mesh.userData.batchTags?.some((tag: string) => hiddenEquipment.has(tag))) continue
      const entries: [number, Matrix4][] = []
      mesh.userData.equipmentTags.forEach((tag: string, index: number) => {
        if (!hiddenEquipment.has(tag)) return
        const original = new Matrix4()
        mesh.getMatrixAt(index, original)
        entries.push([index, original])
        mesh.setMatrixAt(index, hidden)
      })
      mesh.instanceMatrix.needsUpdate = true
      saved.set(mesh, entries)
    }
    return () => {
      for (const [mesh, entries] of saved) {
        for (const [index, matrix] of entries) mesh.setMatrixAt(index, matrix)
        mesh.instanceMatrix.needsUpdate = true
      }
    }
  }, [hiddenEquipment, build])
  useLayoutEffect(() => {
    if (model.current) orderOpaque(model.current, opaqueOrder)
  }, [opaqueOrder, build])
  useLayoutEffect(() => {
    fade.current = { from: amount.current, elapsed: 0 }
    invalidate()
  }, [opacity, delayMs, invalidate])

  useFrame((_, dt) => {
    if (!model.current || amount.current === opacity) return
    const transition = fade.current
    transition.elapsed += dt * 1000
    const t = reduceMotion() ? 1 : Math.min(1, Math.max(0, (transition.elapsed - delayMs) / 360))
    amount.current = t === 1 ? opacity : opacity + (transition.from - opacity) * (1 - t) ** 3
    if (setOpacity(model.current, amount.current)) gl.shadowMap.needsUpdate = true
    if (opaqueOrder) orderOpaque(model.current, opaqueOrder)
    invalidate()
  })
  return <group ref={mount} />
}
