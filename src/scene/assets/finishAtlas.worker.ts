import { printLayerOffset, packScan, scanSize, type AtlasSources, type PackedAtlas } from './finishScans'

import { readPixels } from './readScanPixels'

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
