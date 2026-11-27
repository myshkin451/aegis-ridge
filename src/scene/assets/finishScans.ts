/** Albedo, OpenGL normal and linear roughness. Real repeat is in world metres. */
export const finishScans = [
  {
    finish: 'oak_int', metres: 1.8, meanLinear: [0.356, 0.209, 0.096],
    files: ['pilot/oak-diff.webp', 'pilot/oak-nor_gl.webp', 'pilot/oak-rough.webp'],
  },
  {
    finish: 'fabric', metres: 0.3, meanLinear: [0.3905, 0.3905, 0.3905],
    files: ['finishes/linen-color.webp', 'finishes/linen-normal.webp', 'finishes/linen-rough.webp'],
  },
  {
    finish: 'plaster', metres: 1, meanLinear: [0.2725, 0.2467, 0.1980],
    files: ['finishes/plaster-color.webp', 'finishes/plaster-normal.webp', 'finishes/plaster-rough.webp'],
  },
  {
    finish: 'tile', metres: 1.5, meanLinear: [0.2485, 0.1835, 0.1295],
    files: ['finishes/tile-color.webp', 'finishes/tile-normal.webp', 'finishes/tile-rough.webp'],
  },
] as const

export const fieldPrints = [
  { finish: 'art_ridge', file: 'art/ridge-transects.webp' },
  { finish: 'art_herbarium', file: 'art/larch-study.webp' },
  { finish: 'art_water', file: 'art/surface-drainage.webp' },
] as const

export const scanSize = 1024
// Layers 0–3 contain sRGB colour and linear roughness in A. Normal XY pairs share layers 4–5.
export const normalLayerOffset = finishScans.length
export const printLayerOffset = normalLayerOffset + Math.ceil(finishScans.length / 2)

export function mipBytes(size: number, layers: number) {
  let texels = 0
  for (let n = size; n >= 1; n = Math.floor(n / 2)) texels += n * n
  return texels * layers * 4
}

/** Write one surface without touching the neighbouring normal channels, regardless of arrival order. */
export function packScan(
  pixels: Uint8Array, slot: number, color: Uint8ClampedArray, normal: Uint8ClampedArray, rough: Uint8ClampedArray,
) {
  const stride = color.length
  const out = slot * stride
  const normalOut = (normalLayerOffset + Math.floor(slot / 2)) * stride + 2 * (slot % 2)
  pixels.set(color, out)
  for (let i = 0; i < stride; i += 4) {
    pixels[out + i + 3] = rough[i]
    pixels[normalOut + i] = normal[i]
    pixels[normalOut + i + 1] = normal[i + 1]
  }
}

export interface AtlasSources {
  surfaces: (Blob | null)[][]
  prints: (Blob | null)[]
}

export interface PackedAtlas {
  pixels: Uint8Array<ArrayBuffer>
  layers: number
  scanMask: number
  printMask: number
}
