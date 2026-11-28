import type { EffectComposer } from 'postprocessing'
import {
  Camera, Color, CustomBlending, HalfFloatType, Matrix4, NoBlending, OneFactor,
  ShaderMaterial, WebGLRenderTarget, type Texture, type WebGLRenderer,
} from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { framedSize, type PhotoAspect } from '../../store/usePhotoMode'

const samplesAcross = 4
const sampleCount = samplesAcross ** 2
const vertexShader = `
  varying vec2 sampleUv;
  void main() { sampleUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`
const shader = (add: boolean) => new ShaderMaterial({
  uniforms: { image: { value: null as Texture | null } },
  vertexShader,
  fragmentShader: `varying vec2 sampleUv; uniform sampler2D image;
    void main() {
      vec4 c = texture2D(image, sampleUv);
      gl_FragColor = ${add ? 'c * 0.0625' : 'vec4(sRGBTransferOETF(c).rgb, 1.)'};
    }`,
  transparent: add, depthWrite: false, depthTest: false, toneMapped: false,
  blending: add ? CustomBlending : NoBlending, blendSrc: OneFactor, blendDst: OneFactor,
})

export function exposureProcessor() {
  const accumulate = shader(true), encode = shader(false)
  const quad = new FullScreenQuad(accumulate)
  function draw(gl: WebGLRenderer, image: Texture, target: WebGLRenderTarget, adding: boolean) {
    const clear = gl.autoClear
    const material = adding ? accumulate : encode
    material.uniforms.image.value = image
    quad.material = material
    gl.setRenderTarget(target)
    gl.autoClear = false
    try { quad.render(gl) } finally { gl.autoClear = clear }
  }
  return {
    draw,
    clearBindings() {
      accumulate.uniforms.image.value = encode.uniforms.image.value = null
    },
    warm(gl: WebGLRenderer, source: Texture) {
      const target = gl.getRenderTarget()
      const sum = new WebGLRenderTarget(2, 2, { type: HalfFloatType, depthBuffer: false })
      const bytes = new WebGLRenderTarget(2, 2, { depthBuffer: false })
      try {
        draw(gl, source, sum, true)
        draw(gl, sum.texture, bytes, false)
      } finally {
        gl.setRenderTarget(target)
        this.clearBindings()
        sum.dispose()
        bytes.dispose()
      }
    },
    dispose() {
      quad.dispose()
      accumulate.dispose()
      encode.dispose()
    },
  }
}

/** Wait without stalling the renderer thread. At most one sample is in flight. */
async function finishSample(gl: WebGL2RenderingContext, signal: AbortSignal) {
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
  if (!fence) throw new Error('图形设备未能完成曝光')
  gl.flush()
  try {
    for (;;) {
      signal.throwIfAborted()
      const status = gl.clientWaitSync(fence, 0, 0)
      if (status === gl.WAIT_FAILED || gl.isContextLost()) throw new Error('图形设备中断曝光')
      if (status !== gl.TIMEOUT_EXPIRED) return
      await new Promise(resolve => setTimeout(resolve, 8))
    }
  } finally { gl.deleteSync(fence) }
}

/** Sixteen stratified subpixel samples per output pixel, accumulated in linear RGBA16F.
 * Tiles reuse the normal live composer's full-resolution buffers. Overscan keeps the
 * photo's DOF, AO and SMAA kernels on real neighbouring pixels at tile boundaries. */
export async function capturePhotograph(
  gl: WebGLRenderer, camera: Camera, pipe: EffectComposer, tool: ReturnType<typeof exposureProcessor>,
  aspect: PhotoAspect, signal: AbortSignal,
) {
  const tileW = gl.domElement.width, tileH = gl.domElement.height
  const fullW = tileW * 2, fullH = tileH * 2
  const output = framedSize(fullW, fullH, aspect)
  const originX = (fullW - output.width) / 2, originY = (fullH - output.height) / 2
  const guard = Math.min(48, Math.floor(Math.min(tileW, tileH) / 8))
  const stepX = tileW - 2 * guard, stepY = tileH - 2 * guard
  const original = camera.projectionMatrix.clone(), tile = new Matrix4()
  const sum = new WebGLRenderTarget(tileW, tileH, { type: HalfFloatType, depthBuffer: false })
  const bytes = new WebGLRenderTarget(tileW, tileH, { depthBuffer: false })
  const previousTarget = gl.getRenderTarget(), clearColor = gl.getClearColor(new Color()), alpha = gl.getClearAlpha()
  const finalPass = pipe.passes.at(-1)!
  const screen = finalPass.renderToScreen
  const worker = new Worker(new URL('./photoEncode.worker.ts', import.meta.url), { type: 'module' })
  const png = new Promise<Blob>((resolve, reject) => {
    worker.onmessage = event => event.data.blob ? resolve(event.data.blob) : reject(new Error(event.data.error))
    worker.onerror = event => reject(new Error(event.message))
  })
  // A worker can fail before the last tile arrives.
  png.catch(() => {})
  worker.postMessage(output)
  try {
    finalPass.renderToScreen = false
    // Composer swaps local buffer references after each enabled colour pass.
    const swaps = pipe.passes.filter(pass => pass.enabled && pass.needsSwap).length
    const result = swaps % 2 ? pipe.outputBuffer : pipe.inputBuffer
    for (let y = 0; y < output.height; y += stepY) {
      for (let x = 0; x < output.width; x += stepX) {
        const width = Math.min(stepX, output.width - x), height = Math.min(stepY, output.height - y)
        gl.setRenderTarget(sum)
        gl.setClearColor(0, 0)
        gl.clear(true, false, false)
        gl.setClearColor(clearColor, alpha)
        for (let sample = 0; sample < sampleCount; sample++) {
          signal.throwIfAborted()
          const jx = (sample % samplesAcross + 0.5) / samplesAcross - 0.5
          const jy = (Math.floor(sample / samplesAcross) + 0.5) / samplesAcross - 0.5
          const dx = (fullW - 2 * (originX + x - guard + jx)) / tileW - 1
          const dy = 1 - (fullH - 2 * (originY + y - guard + jy)) / tileH
          tile.makeScale(fullW / tileW, fullH / tileH, 1).setPosition(dx, dy, 0)
          camera.projectionMatrix.multiplyMatrices(tile, original)
          camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
          pipe.render(0)
          tool.draw(gl, result.texture, sum, true)
          await finishSample(gl.getContext() as WebGL2RenderingContext, signal)
        }
        tool.draw(gl, sum.texture, bytes, false)
        const pixels = new Uint8Array(width * height * 4)
        await gl.readRenderTargetPixelsAsync(bytes, guard, tileH - guard - height, width, height, pixels)
        worker.postMessage({ x, y, width, height, pixels }, [pixels.buffer])
      }
    }
    worker.postMessage('encode')
    return { blob: await png, ...output }
  } finally {
    finalPass.renderToScreen = screen
    camera.projectionMatrix.copy(original)
    camera.projectionMatrixInverse.copy(original).invert()
    gl.setRenderTarget(previousTarget)
    gl.setClearColor(clearColor, alpha)
    tool.clearBindings()
    sum.dispose()
    bytes.dispose()
    worker.terminate()
  }
}
