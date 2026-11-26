import { Loader } from 'three'
import { decodeTile } from '../../geometry/siteElevations'
import type { AtlasInfo, TerrainAtlas } from '../../geometry/siteElevations'

async function resource(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('无法加载地形 ' + response.status + ' ' + url)
  return response
}
export class AtlasLoader extends Loader<TerrainAtlas> {
  load(
    url: string,
    onLoad: (atlas: TerrainAtlas) => void,
    _progress?: unknown,
    onError?: (err: unknown) => void,
  ) {
    const absolute = new URL(url, document.baseURI)
    this.manager.itemStart(url)
    const read = async () => {
      const info: AtlasInfo = await (await resource(absolute.href)).json()
      if (info.version !== 1 || info.tiles.length !== 4) throw new Error('地形清单格式不符')
      const load = async (tile: AtlasInfo['tiles'][number]) => {
        const file = new URL(tile.file, absolute)
        file.searchParams.set('v', tile.sha256.slice(0, 12))
        const bytes = await (await resource(file.href)).arrayBuffer()
        return decodeTile(tile, new Uint8Array(bytes))
      }
      const [tiles, insets] = await Promise.all([
        Promise.all(info.tiles.map(load)),
        Promise.all(info.insets.map(load)),
      ])
      return { tiles, insets, road: info.road }
    }
    read()
      .then(onLoad)
      .catch((e) => {
        this.manager.itemError(url)
        onError?.(e)
      })
      .finally(() => this.manager.itemEnd(url))
  }
}
