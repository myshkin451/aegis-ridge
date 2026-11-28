import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping } from 'three'
import { scanSize } from './finishScans'

const surfaces = ['cliff', 'talus', 'meadow', 'snow', 'soil'] as const
export const terrainScanMetres = [2.55, 2, 2, 2, 1.3] as const

export async function loadTerrainScans(): Promise<DataArrayTexture> {
  // Start fetches in the window so startup instrumentation sees each transfer before the compile survey.
  const sources = await Promise.all(
    surfaces.map((surface) =>
      Promise.all(
        ['color', 'height', 'surface'].map(async (channel) => {
          const path = import.meta.env.BASE_URL + 'assets/terrain/' + surface + '-' + channel + '.webp'
          const response = await fetch(path)
          if (!response.ok) throw Error('无法读取地表扫描 ' + response.status + ' ' + path)
          return response.blob()
        }),
      ),
    ),
  )
  const worker = new Worker(new URL('./terrainScans.worker.ts', import.meta.url), { type: 'module' })
  try {
    const pixels = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<Uint8Array<ArrayBuffer> | string>) =>
        typeof data === 'string' ? reject(Error(data)) : resolve(data)
      worker.onerror = (event) => {
        event.preventDefault()
        reject(Error(event.message))
      }
      worker.postMessage(sources)
    })
    const texture = new DataArrayTexture(pixels, scanSize, scanSize, surfaces.length * 2)
    texture.name = 'ARS · terrain scans (colour/height, normal XY/roughness)'
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.magFilter = LinearFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.generateMipmaps = texture.needsUpdate = true
    return texture
  } finally {
    worker.terminate()
  }
}
