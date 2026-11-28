import { N8AOPostPass } from 'n8ao'
import { PerspectiveCamera, Scene, WebGLRenderTarget } from 'three'
import type { WebGLRenderer } from 'three'
import { expect, it } from 'vitest'
import { FullResolutionAOHistory, patchAOHistory } from '../src/scene/atmosphere/aoHistory'

it('installs independent history uniforms when n8ao rebuilds its shader for an orthographic camera', () => {
  const pass = new N8AOPostPass(new Scene(), new PerspectiveCamera(), 8, 8)
  const perspective = pass.effectShaderQuad.material
  patchAOHistory(perspective)
  perspective.uniforms.aoHistoryValid.value = true

  pass.configureAOPass(undefined, true)
  const orthographic = pass.effectShaderQuad.material
  patchAOHistory(orthographic)
  expect(orthographic.fragmentShader).toContain('#define ORTHO')
  for (const material of [perspective, orthographic]) {
    expect(material.fragmentShader).toContain('if (readHistory(aoPosition, aoDx, aoDy, priorRaw, age))')
  }
  expect(orthographic.uniforms.aoHistoryValid.value).toBe(false)
  expect(perspective.uniforms.aoHistoryValid.value).toBe(true)
  pass.dispose()
})

it('restores the original target and requires a fresh draw after fallback or resize', () => {
  const camera = new PerspectiveCamera()
  const pass = new N8AOPostPass(new Scene(), camera, 8, 8)
  const material = pass.effectShaderQuad.material
  patchAOHistory(material)
  const history = new FullResolutionAOHistory()
  const native = new WebGLRenderTarget(8, 8)
  let active = native
  const renderer = {
    getRenderTarget: () => active,
    setRenderTarget: (target: WebGLRenderTarget) => { active = target },
  } as WebGLRenderer

  function frame(enabled: boolean, expectsHistory: boolean) {
    let rendered = native.texture
    const result = history.draw(renderer, material, camera, 0, enabled, () => {
      rendered = active.texture
      expect(active === native).toBe(!enabled)
      expect([active.width, active.height]).toEqual([native.width, native.height])
      expect(material.uniforms.aoHistoryValid.value).toBe(expectsHistory)
      expect(material.uniforms.aoPreviousRaw.value !== null).toBe(expectsHistory)
    })
    expect(active).toBe(native)
    expect(result).toBe(rendered)
  }

  frame(true, false)
  frame(true, true)
  frame(false, false)
  frame(true, false)
  frame(true, true)
  native.setSize(16, 12)
  frame(true, false)
  frame(true, true)
  native.dispose()
  history.dispose()
  pass.dispose()
})
