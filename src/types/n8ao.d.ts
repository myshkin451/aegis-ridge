declare module 'n8ao' {
  import type { Scene, Camera, Color, DepthTexture, ShaderMaterial, WebGLRenderer, WebGLRenderTarget } from 'three'
  import { Pass } from 'postprocessing'
  interface Quad { material: ShaderMaterial; render(renderer: WebGLRenderer): void; dispose(): void }
  export class N8AOPostPass extends Pass {
    camera: Camera
    constructor(scene: Scene, camera: Camera, width: number, height: number)
    depthTexture: DepthTexture | null
    outputTargetInternal: WebGLRenderTarget
    accumulationRenderTarget: WebGLRenderTarget
    copyQuad: Quad
    accumulationQuad: Quad
    effectShaderQuad: Quad
    poissonBlurQuad: Quad
    effectCompositerQuad: Quad
    depthDownsampleQuad?: { dispose(): void }
    autoDetectTransparency: boolean
    configureAOPass(depthType?: number, orthographic?: boolean): void
    configureDenoisePass(depthType?: number, orthographic?: boolean): void
    configuration: { accumulate: boolean; denoiseIterations: number; transparencyAware: boolean; renderMode: number; aoTones: number; color: Color; gammaCorrection: boolean; halfRes: boolean; aoRadius: number; intensity: number; biasOffset: number; biasMultiplier: number }
    setQualityMode(mode: 'Low' | 'Medium'): void
  }
}
