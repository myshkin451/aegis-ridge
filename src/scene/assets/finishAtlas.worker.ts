import { printLayerOffset, packScan, scanSize, type AtlasSources, type PackedAtlas } from './finishScans'

/** Decoding and channel packing also run here when the walkthrough receives an asset late. */
async function readPixels(blob: Blob, print = false) {
  const image = await createImageBitmap(blob, { colorSpaceConversion: 'none', imageOrientation: 'flipY' })
  try {
    if (Math.max(image.width, image.height) !== scanSize || (!print && Math.min(image.width, image.height) !== scanSize)) {
      throw Error('Unexpected scan or print dimensions')
    }
    const ctx = new OffscreenCanvas(scanSize, scanSize).getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(image, 0, 0, scanSize, scanSize)
    return ctx.getImageData(0, 0, scanSize, scanSize).data
  } finally {
    image.close()
  }
}

self.onmessage = async ({ data }: MessageEvent<AtlasSources>) => {
  const stride = scanSize * scanSize * 4
  const layers = printLayerOffset + data.prints.length
  const pixels = new Uint8Array(stride * layers)
  let scanMask = 0, printMask = 0
  await Promise.allSettled([
    ...data.surfaces.map(async (trio, slot) => {
      if (!trio.every((v): v is Blob => v !== null)) return
      const [color, normal, rough] = await Promise.all(trio.map((file) => readPixels(file)))
      packScan(pixels, slot, color, normal, rough)
      scanMask |= 1 << slot
    }),
    ...data.prints.map(async (file, slot) => {
      if (!file) return
      pixels.set(await readPixels(file, true), (printLayerOffset + slot) * stride)
      printMask |= 1 << slot
    }),
  ])
  const result: PackedAtlas = { pixels, layers, scanMask, printMask }
  self.postMessage(result, { transfer: [pixels.buffer] })
}
