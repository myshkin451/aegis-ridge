declare module 'n8ao' {
  import type { Scene, Camera } from 'three'
  import { Pass } from 'postprocessing'
  export class N8AOPostPass extends Pass {
    camera: Camera
    constructor(scene: Scene, camera: Camera, width: number, height: number)
    copyQuad: { dispose(): void }
    accumulationQuad: { dispose(): void }
    effectShaderQuad: { dispose(): void }
    poissonBlurQuad: { dispose(): void }
    effectCompositerQuad: { dispose(): void }
    depthDownsampleQuad?: { dispose(): void }
    autoDetectTransparency: boolean
    configuration: { gammaCorrection: boolean; halfRes: boolean; aoRadius: number; intensity: number }
    setQualityMode(mode: 'Low' | 'Medium'): void
  }
}
