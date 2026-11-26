import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, MathUtils } from 'three'
import { attachCut, useBuildingCut } from '../BuildingSection'
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

export function Model({
  build,
  opacity = 1,
  cutMaterial = 'structure',
}: {
  build: () => ModelBuilder
  opacity?: number
  cutMaterial?: CutMaterial
}) {
  const cut = useBuildingCut()
  const mount = useRef<Group>(null)
  const model = useRef<BuiltModel | null>(null)
  const amount = useRef(opacity)
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)

  useLayoutEffect(() => {
    const built = build().build()
    const parent = mount.current!
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
  }, [build, invalidate, gl])
  useLayoutEffect(() => {
    if (cut && model.current) return attachCut(model.current, cut, cutMaterial)
  }, [cut, cutMaterial, build])
  useLayoutEffect(() => {
    invalidate()
  }, [opacity, invalidate])

  useFrame((_, dt) => {
    if (!model.current || amount.current === opacity) return
    const value = reduceMotion() ? opacity : MathUtils.damp(amount.current, opacity, 13, Math.min(dt, 0.1))
    amount.current = Math.abs(value - opacity) < 0.004 ? opacity : value
    if (setOpacity(model.current, amount.current)) gl.shadowMap.needsUpdate = true
    invalidate()
  })
  return <group ref={mount} />
}
