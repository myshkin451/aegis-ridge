import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping } from 'three'
import { fieldPrints, finishScans, scanSize, type AtlasSources, type PackedAtlas } from './finishScans'

export interface FinishAtlas {
  texture: DataArrayTexture
  scanMask: number
  printMask: number
}

const fileRoot = import.meta.env.BASE_URL + 'assets/'
async function readLocalAsset(path: string) {
  try {
    const response = await fetch(fileRoot + path)
    return response.ok ? await response.blob() : null
  } catch {
    return null
  }
}

async function pack(sources: AtlasSources) {
  const worker = new Worker(new URL('./finishAtlas.worker.ts', import.meta.url), { type: 'module' })
  try {
    return await new Promise<PackedAtlas>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<PackedAtlas>) => resolve(e.data)
      worker.onerror = (e) => { e.preventDefault(); reject(Error(e.message)) }
      worker.postMessage(sources)
    })
  } finally {
    worker.terminate()
  }
}

export async function loadFinishAtlas(art: boolean): Promise<FinishAtlas | null> {
  const [surfaces, prints] = await Promise.all([
    Promise.all(finishScans.map((scan) => Promise.all(scan.files.map(readLocalAsset)))),
    art ? Promise.all(fieldPrints.map((print) => readLocalAsset(print.file))) : [],
  ])
  const result = await pack({ surfaces, prints })
  if (!(result.scanMask || result.printMask)) return null
  const texture = new DataArrayTexture(result.pixels, scanSize, scanSize, result.layers)
  texture.name = 'ARS · sRGB/R + packed normal XY + field prints'
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.generateMipmaps = texture.needsUpdate = true
  return { texture, scanMask: result.scanMask, printMask: result.printMask }
}
