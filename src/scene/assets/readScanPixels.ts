import { scanSize } from './finishScans'

let context: OffscreenCanvasRenderingContext2D | null = null

export async function readPixels(blob: Blob, print = false) {
  const image = await createImageBitmap(blob, { colorSpaceConversion: 'none', imageOrientation: 'flipY' })
  try {
    if (
      Math.max(image.width, image.height) !== scanSize ||
      (!print && Math.min(image.width, image.height) !== scanSize)
    )
      throw Error('Unexpected scan or print dimensions')
    // Each worker reuses one readback surface. drawImage/getImageData are synchronous even for concurrent decodes.
    context ??= new OffscreenCanvas(scanSize, scanSize).getContext('2d', { willReadFrequently: true })
    if (!context) throw Error('Cannot decode scans on the worker')
    context.globalCompositeOperation = 'copy'
    context.drawImage(image, 0, 0, scanSize, scanSize)
    return context.getImageData(0, 0, scanSize, scanSize).data
  } finally {
    image.close()
  }
}
