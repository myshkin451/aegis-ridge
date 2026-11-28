declare module 'n8ao' {
  import type { Scene, Camera, DepthTexture, ShaderMaterial, WebGLRenderer, WebGLRenderTarget } from 'three'
  import { Pass } from 'postprocessing'
  export class N8AOPostPass extends Pass {
    camera: Camera
    constructor(scene: Scene, camera: Camera, width: number, height: number)
    depthTexture: DepthTexture | null
    outputTargetInternal: WebGLRenderTarget
    copyQuad: { material: ShaderMaterial; render(renderer: WebGLRenderer): void; dispose(): void }
    accumulationQuad: { dispose(): void }
    effectShaderQuad: { dispose(): void }
    poissonBlurQuad: { dispose(): void }
    effectCompositerQuad: { material: ShaderMaterial; dispose(): void }
    depthDownsampleQuad?: { dispose(): void }
    autoDetectTransparency: boolean
    configuration: { gammaCorrection: boolean; halfRes: boolean; aoRadius: number; intensity: number }
    setQualityMode(mode: 'Low' | 'Medium'): void
  }
}
