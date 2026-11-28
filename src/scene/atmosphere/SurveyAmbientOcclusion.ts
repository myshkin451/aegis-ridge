import { N8AOPostPass } from 'n8ao'
import type { EffectComposer } from 'postprocessing'
import { HalfFloatType, NoColorSpace, RGBAFormat } from 'three'
import type { Camera, Scene, WebGLRenderer, WebGLRenderTarget } from 'three'

function isLinearHdrTarget(target: WebGLRenderTarget, width: number, height: number) {
  const { texture, viewport } = target
  return target.width === width && target.height === height &&
    viewport.x === 0 && viewport.y === 0 && viewport.z === width && viewport.w === height &&
    !target.scissorTest && target.samples === 0 && target.textures.length === 1 &&
    texture.type === HalfFloatType && texture.format === RGBAFormat &&
    texture.internalFormat === null && texture.colorSpace === NoColorSpace
}

const skipCopy = () => {}

// n8ao 1.10.1 ends its offscreen pass with a 1:1 copy of the composited linear HDR color.
// The composer owns a separate RGBA16F colour destination. Scene depth stays on the input.
export class SurveyAmbientOcclusion extends N8AOPostPass {
  constructor(scene: Scene, camera: Camera, private readonly composer: EffectComposer) {
    super(scene, camera, composer.inputBuffer.width, composer.inputBuffer.height)
  }

  override render(
    renderer: WebGLRenderer, input: WebGLRenderTarget | null, output: WebGLRenderTarget | null,
    deltaTime?: number, stencilTest?: boolean,
  ): void {
    const scratch = this.outputTargetInternal
    // The 8px startup precompile uses the original path to keep the fallback copy shader warm.
    if (
      !input || !output || input !== this.composer.inputBuffer || output !== this.composer.outputBuffer ||
      input === output || input.texture === output.texture || this.renderToScreen || stencilTest ||
      !input.depthTexture || input.depthTexture !== this.depthTexture || output.depthTexture || output.depthBuffer ||
      renderer.capabilities.logarithmicDepthBuffer || renderer.capabilities.reversedDepthBuffer ||
      (scratch.width <= 32 && scratch.height <= 32) ||
      !isLinearHdrTarget(input, scratch.width, scratch.height) ||
      !isLinearHdrTarget(output, scratch.width, scratch.height)
    ) {
      super.render(renderer, input, output, deltaTime, stencilTest)
      return
    }

    const copy = this.copyQuad
    const drawCopy = copy.render
    const sampler = copy.material.uniforms.tDiffuse
    const priorTexture = sampler.value
    const composite = this.effectCompositerQuad.material
    const priorDepthTest = composite.depthTest
    const target = renderer.getRenderTarget()
    const face = renderer.getActiveCubeFace()
    const level = renderer.getActiveMipmapLevel()
    const autoClear = renderer.autoClear
    const xrEnabled = renderer.xr.enabled
    try {
      this.outputTargetInternal = output
      copy.render = skipCopy
      // In the original pass the copy triangle performs this depth test at the destination.
      composite.depthTest = copy.material.depthTest
      super.render(renderer, input, output, deltaTime, stencilTest)
      if (!renderer.domElement.dataset.aoOutput) renderer.domElement.dataset.aoOutput = 'composer'
    } catch (error) {
      renderer.setRenderTarget(target, face, level)
      throw error
    } finally {
      this.outputTargetInternal = scratch
      copy.render = drawCopy
      sampler.value = priorTexture
      composite.depthTest = priorDepthTest
      renderer.autoClear = autoClear
      renderer.xr.enabled = xrEnabled
    }
  }
}
