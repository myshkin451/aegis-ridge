import { Loader } from 'three'
import { decodeTile } from '../../geometry/siteElevations'
import type { AtlasInfo, ReliefFile, TerrainAtlas } from '../../geometry/siteElevations'
import { terrainV2 } from './terrainVersion'

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
    const primary = new URL(url, document.baseURI)
    const absolute = terrainV2 ? primary : new URL('atlas-v1.json', primary)
    this.manager.itemStart(url)
    const read = async () => {
      const info: AtlasInfo = await (await resource(absolute.href)).json()
      if (info.version !== (terrainV2 ? 2 : 1) || info.tiles.length !== 4 || (terrainV2 && !info.relief))
        throw new Error('地形清单格式不符')
      const bytes = async (entry: { file: string; sha256: string }) => {
        const file = new URL(entry.file, absolute)
        file.searchParams.set('v', entry.sha256.slice(0, 12))
        return new Uint8Array(await (await resource(file.href)).arrayBuffer())
      }
      const load = async (tile: AtlasInfo['tiles'][number]) => decodeTile(tile, await bytes(tile))
      const grid = async (entry: ReliefFile, channels: number) => {
        const data = await bytes(entry)
        if (data.length !== entry.n ** 2 * channels) throw new Error('地形图幅尺寸不符 ' + entry.file)
        return { n: entry.n, bytes: data }
      }
      const [tiles, insets, relief] = await Promise.all([
        Promise.all(info.tiles.map(load)),
        Promise.all(info.insets.map(load)),
        info.relief &&
          Promise.all([grid(info.relief.horizons, 32), grid(info.relief.macroNormal, 2)]).then(
            ([horizons, macroNormal]) => ({ horizons, macroNormal }),
          ),
      ])
      return { tiles, insets, relief, road: info.road }
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
