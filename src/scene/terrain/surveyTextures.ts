import {
  DataArrayTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RedFormat,
  RGFormat,
} from 'three'
import type { TerrainAtlas } from '../../geometry/siteElevations'

// A horizontal surface under an isotropic sky receives cos²(horizon) of the open-sky
// irradiance in each azimuth sector. Reuse the angles already decoded for direct sun.
function skyViewLayers(angles: Uint8Array<ArrayBuffer>, pixels: number) {
  const data = new Uint8Array(pixels * 34)
  data.set(angles)
  const irradiance = Float64Array.from({ length: 256 }, (_, angle) => Math.cos((angle * Math.PI) / 510) ** 2)
  for (let level = 0; level < 2; level++) {
    const start = level * 16 * pixels
    for (let p = 0; p < pixels; p++) {
      let sum = 0
      for (let d = 0; d < 16; d++) sum += irradiance[angles[start + d * pixels + p]]
      data[(32 + level) * pixels + p] = Math.round((255 * sum) / 16)
    }
  }
  return data
}

/** R8 bearings run east toward south. The last two layers are sky-view factors, main then outer. */
export function makeSurveyTextures(atlas: TerrainAtlas) {
  if (!atlas.relief) throw new Error('地形缺少 V2 地平角图')
  const { horizons: angles, macroNormal: normals } = atlas.relief
  const horizons = new DataArrayTexture(skyViewLayers(angles.bytes, angles.n ** 2), angles.n, angles.n, 34)
  horizons.name = '16 方位地平角 · 主山 / 外围'
  horizons.format = RedFormat
  horizons.minFilter = horizons.magFilter = LinearFilter
  horizons.needsUpdate = true
  const macroNormal = new DataTexture(normals.bytes, normals.n, normals.n, RGFormat)
  macroNormal.name = '10 m 地形宏观法线'
  macroNormal.magFilter = LinearFilter
  macroNormal.minFilter = LinearMipmapLinearFilter
  macroNormal.generateMipmaps = true
  macroNormal.needsUpdate = true
  return {
    horizons,
    macroNormal,
    dispose() {
      horizons.dispose()
      macroNormal.dispose()
    },
  }
}
