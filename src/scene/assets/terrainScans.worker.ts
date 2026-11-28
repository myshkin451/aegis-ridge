import { scanSize } from './finishScans'
import { readPixels } from './readScanPixels'

self.onmessage = async ({ data }: MessageEvent<Blob[][]>) => {
  try {
    const stride = scanSize * scanSize * 4
    const pixels = new Uint8Array(2 * data.length * stride)
    await Promise.all(
      data.map(async (files, slot) => {
        const [color, height, surface] = await Promise.all(files.map((file) => readPixels(file)))
        const offset = slot * stride
        pixels.set(color, offset)
        for (let i = 0; i < stride; i += 4) pixels[offset + i + 3] = height[i]
        pixels.set(surface, offset + data.length * stride)
      }),
    )
    self.postMessage(pixels, { transfer: [pixels.buffer] })
  } catch (error) {
    self.postMessage('无法解码 1K 地表扫描。' + String(error))
  }
}
