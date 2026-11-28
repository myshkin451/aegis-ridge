import { readFileSync } from 'node:fs'
import { buildMepNetwork } from '../../data/mepNetwork'
import { decodeTile, type AtlasInfo, type TileInfo } from '../../geometry/siteElevations'

const assets = new URL('../../../public/terrain/', import.meta.url)
const manifest: AtlasInfo = JSON.parse(readFileSync(new URL('atlas.json', assets), 'utf8'))
const loadTile = (tile: TileInfo) => decodeTile(tile, readFileSync(new URL(tile.file, assets)))
export const stationAtlas = {
  tiles: manifest.tiles.map(loadTile),
  insets: manifest.insets.map(loadTile),
  road: manifest.road,
}
export const stationNetwork = buildMepNetwork(stationAtlas)
