import { N8AOPostPass } from 'n8ao'
import type { EffectComposer } from 'postprocessing'
import { FogExp2, HalfFloatType, NoColorSpace, RGBAFormat } from 'three'
import { FullResolutionAOHistory, patchAOHistory } from './aoHistory'
import type { Camera, Scene, Texture, WebGLRenderer, WebGLRenderTarget } from 'three'

function isLinearHdrTarget(target: WebGLRenderTarget, width: number, height: number) {
  const { texture, viewport } = target
  return target.width === width && target.height === height &&
    viewport.x === 0 && viewport.y === 0 && viewport.z === width && viewport.w === height &&
    !target.scissorTest && target.samples === 0 && target.textures.length === 1 &&
    texture.type === HalfFloatType && texture.format === RGBAFormat &&
    texture.internalFormat === null && texture.colorSpace === NoColorSpace
}
const skipCopy = () => {}

// Both scene cameras have a diagonal XY projection, including off-centre photo framing.
// Keep the depth reconstruction exact while avoiding a general 4x4 transform at every tap.
function viewPositions(source: string) {
  return source.replace(/vec4 viewSpacePosition = projectionMatrixInv \* clipSpacePosition;[\s\S]*?return worldSpacePosition.xyz;/,
    `
    #ifdef ORTHO
      return vec3(projectionMatrixInv[0].x, projectionMatrixInv[1].y, projectionMatrixInv[2].z) *
        clipSpacePosition.xyz + projectionMatrixInv[3].xyz;
    #else
      return (vec3(clipSpacePosition.xy * vec2(projectionMatrixInv[0].x, projectionMatrixInv[1].y), 0.) +
        projectionMatrixInv[3].xyz) / (clipSpacePosition.z * projectionMatrixInv[2].w + projectionMatrixInv[3].w);
    #endif`)
}

/** Full-resolution N8AO Medium. With temporal accumulation disabled,
 * the original chain writes the same AO to two more textures before applying it to the HDR scene.
 * Apply that multiplication in the bilateral filter's output instead. */
export class SurveyAmbientOcclusion extends N8AOPostPass {
  private readonly history = new FullResolutionAOHistory()
  historyEnabled = false
  revision = 0

  override dispose() {
    this.history.dispose()
    super.dispose()
  }

  constructor(private readonly world: Scene, camera: Camera, private readonly composer: EffectComposer) {
    super(world, camera, composer.inputBuffer.width, composer.inputBuffer.height)
  }

  override configureAOPass(depthType?: number, orthographic?: boolean) {
    super.configureAOPass(depthType, orthographic)
    const m = this.effectShaderQuad.material
    m.fragmentShader = viewPositions(m.fragmentShader).replace('vec4 offset = projMat * vec4(samplePos, 1.0);', `
      #ifdef ORTHO
      vec4 offset = vec4(samplePos * vec3(projMat[0].x,projMat[1].y,projMat[2].z) + projMat[3].xyz, 1.);
      #else
      vec4 offset = vec4(samplePos.xy * vec2(projMat[0].x,projMat[1].y) + projMat[2].xy * samplePos.z,
        projMat[2].z * samplePos.z + projMat[3].z, -samplePos.z);
      #endif`)
    patchAOHistory(m)
  }

  override configureDenoisePass(depthType?: number, orthographic?: boolean) {
    super.configureDenoisePass(depthType, orthographic)
    const material = this.poissonBlurQuad.material
    material.uniforms = { ...material.uniforms, composeHere: { value: false }, hdrScene: { value: null },
      fogDensity: { value: 0 }, aoIntensity: { value: 1 } }
    material.fragmentShader = viewPositions(material.fragmentShader)
      // A constant neighbourhood is unchanged by any bilateral weights. On planar walls,
      // open ground and unoccluded sky this saves a second set of eight depth fetches.
      .replace('for(int i = 0; i < NUM_SAMPLES; i++) {', `
        vec2 sampleUv[NUM_SAMPLES];
        vec4 neighbourhood[NUM_SAMPLES];
        bool constantAO = true;
        for(int i = 0; i < NUM_SAMPLES; i++) {
          sampleUv[i] = uv + rotationMatrix * poissonDisk[i] * texelSize * size;
          neighbourhood[i] = texture2D(tDiffuse, sampleUv[i]);
          constantAO = constantAO && abs(neighbourhood[i].r - baseOcc) < 0.000001;
        }
        if (constantAO && baseOcc > 0.) { gl_FragColor = data; return; }
        for(int i = 0; i < NUM_SAMPLES; i++) {`)
      .replace('vec4 dataSample = texture2D(tDiffuse, uv + offset);', 'vec4 dataSample = neighbourhood[i];')
      .replace('void main() {', `
      uniform bool composeHere;
      uniform vec3 cameraPos;
      uniform sampler2D hdrScene;
      uniform float fogDensity, aoIntensity;
      void denoise(out vec4 filtered, out vec3 viewPosition) {
        viewPosition = vec3(0.);
      `)
      .replace('vec3 worldPos = getWorldPos(d, vUv);', 'vec3 worldPos = getWorldPos(d, vUv); viewPosition = worldPos;')
      .replaceAll('gl_FragColor =', 'filtered =') + `
      void main() {
        vec4 filtered;
        vec3 position;
        denoise(filtered, position);
        if (!composeHere) { gl_FragColor = filtered; return; }
        vec4 sceneColor = texture2D(hdrScene, vUv);
        // n8ao's intermediate AO channel uses UNORM8.
        float ao = pow(floor(filtered.r * 255.0 + 0.5) / 255.0, aoIntensity);
        vec3 offset = cameraPos - position;
        float visibility = exp(-fogDensity * fogDensity * dot(offset, offset));
        gl_FragColor = vec4(sceneColor.rgb * mix(1.0, ao, visibility), sceneColor.a);
      }`
  }

  override render(renderer: WebGLRenderer, input: WebGLRenderTarget | null, output: WebGLRenderTarget | null,
    deltaTime?: number, stencilTest?: boolean) {
    const scratch = this.outputTargetInternal, cfg = this.configuration
    const fog = this.world.fog
    if (!input || !output || input !== this.composer.inputBuffer || output !== this.composer.outputBuffer ||
      input === output || this.renderToScreen || stencilTest || output.depthBuffer ||
      !input.depthTexture || input.depthTexture !== this.depthTexture ||
      renderer.capabilities.logarithmicDepthBuffer || renderer.capabilities.reversedDepthBuffer ||
      cfg.halfRes || cfg.accumulate || cfg.denoiseIterations < 1 || cfg.gammaCorrection ||
      cfg.transparencyAware || cfg.renderMode !== 0 || cfg.aoTones !== 0 || cfg.color.getHex() !== 0 ||
      (fog !== null && !(fog instanceof FogExp2)) ||
      !isLinearHdrTarget(input, scratch.width, scratch.height) || !isLinearHdrTarget(output, scratch.width, scratch.height)) {
      this.history.invalidate()
      super.render(renderer, input, output, deltaTime, stencilTest)
      return
    }
    const accumulationTarget = this.accumulationRenderTarget
    const blur = this.poissonBlurQuad, compose = this.effectCompositerQuad
    const raw = this.effectShaderQuad, drawRaw = raw.render
    let rawTexture: Texture | undefined
    const draw = blur.render, accumulate = this.accumulationQuad.render, composite = compose.render, copy = this.copyQuad.render
    try {
      // With the three redundant draws removed, avoid allocating or binding their full-size scratch targets.
      this.accumulationRenderTarget = this.outputTargetInternal = output
      raw.render = (gl) => {
        rawTexture = this.history.draw(gl, raw.material, this.camera, this.revision, this.historyEnabled, () => drawRaw.call(raw, gl))
      }
      blur.render = function (gl) {
        // The library can replace the material while switching between perspective and orthographic cameras.
        const uniforms = this.material.uniforms
        if (uniforms.index.value === 0 && rawTexture) uniforms.tDiffuse.value = rawTexture
        if (uniforms.index.value !== cfg.denoiseIterations - 1) { draw.call(this, gl); return }
        uniforms.composeHere.value = true
        uniforms.hdrScene.value = input.texture
        uniforms.fogDensity.value = fog?.density ?? 0
        uniforms.aoIntensity.value = cfg.intensity
        gl.setRenderTarget(output)
        try { draw.call(this, gl) } finally { uniforms.composeHere.value = false; uniforms.hdrScene.value = null }
      }
      this.accumulationQuad.render = compose.render = this.copyQuad.render = skipCopy
      super.render(renderer, input, output, deltaTime, stencilTest)
      renderer.setRenderTarget(output)
      renderer.domElement.dataset.aoOutput = 'composer'
    } finally {
      this.accumulationRenderTarget = accumulationTarget
      this.outputTargetInternal = scratch
      raw.render = drawRaw
      blur.render = draw
      compose.render = composite
      this.accumulationQuad.render = accumulate
      this.copyQuad.render = copy
    }
  }
}
