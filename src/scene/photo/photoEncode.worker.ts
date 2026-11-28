// WebGL readback begins at the lower-left; PNG rows begin at the upper-left.
let surface: OffscreenCanvas
let context: OffscreenCanvasRenderingContext2D
type Tile = { x: number; y: number; width: number; height: number; pixels: Uint8Array }
self.onmessage = async (event: MessageEvent<{ width: number; height: number } | Tile | 'encode'>) => {
  try {
    const data = event.data
    if (data === 'encode') {
      self.postMessage({ blob: await surface.convertToBlob({ type: 'image/png' }) })
    } else if ('pixels' in data) {
      const image = new ImageData(data.width, data.height)
      const stride = data.width * 4
      for (let row = 0; row < data.height; row++) {
        const start = (data.height - 1 - row) * stride
        image.data.set(data.pixels.subarray(start, start + stride), row * stride)
      }
      context.putImageData(image, data.x, data.y)
    } else {
      surface = new OffscreenCanvas(data.width, data.height)
      const drawing = surface.getContext('2d', { alpha: false })
      if (!drawing) throw new Error('PNG 画布不可用')
      context = drawing
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
export {}
