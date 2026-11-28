import {
  DataArrayTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RGFormat,
} from 'three'
import type { TerrainAtlas } from '../../geometry/siteElevations'

// A horizontal surface under an isotropic sky receives cos²(horizon) of the open-sky
// irradiance in each azimuth sector. Reuse the angles already decoded for direct sun.
function solarSurvey(angles: Uint8Array<ArrayBuffer>, side: number) {
  const pixels = side * side
  const data = new Uint8Array(pixels * 2 * 4)
  const irradiance = Float64Array.from({ length: 256 }, (_, angle) => Math.cos((angle * Math.PI) / 510) ** 2)
  for (let level = 0; level < 2; level++) {
    const start = level * 16 * pixels
    for (let p = 0; p < pixels; p++) {
      let sum = 0
      for (let d = 0; d < 16; d++) sum += irradiance[angles[start + d * pixels + p]]
      const index = 4 * (level * pixels + p)
      data[index + 2] = Math.round((255 * sum) / 16)
      data[index + 3] = 255
    }
  }
  const texture = new DataArrayTexture(data, side, side, 2)
  texture.name = '太阳两侧地平角与天空开敞度 · 主山 / 外围'
  texture.format = RGBAFormat
  texture.minFilter = texture.magFilter = LinearFilter
  let previous = -1
  function setBearing(bearing: number) {
    if (bearing === previous) return
    previous = bearing
    for (let level = 0; level < 2; level++) {
      const first = (level * 16 + bearing) * pixels
      const next = (level * 16 + (bearing + 1) % 16) * pixels
      for (let p = 0; p < pixels; p++) {
        const index = 4 * (level * pixels + p)
        data[index] = angles[first + p]
        data[index + 1] = angles[next + p]
      }
    }
    texture.needsUpdate = true
  }
  setBearing(0)
  return { texture, setBearing }
}

/** One filtered fetch returns both bracketing azimuth samples and the isotropic sky-view factor. */
export function makeSurveyTextures(atlas: TerrainAtlas) {
  if (!atlas.relief) throw new Error('地形缺少 V2 地平角图')
  const { horizons: angles, macroNormal: normals } = atlas.relief
  const { texture: horizons, setBearing } = solarSurvey(angles.bytes, angles.n)
  const macroNormal = new DataTexture(normals.bytes, normals.n, normals.n, RGFormat)
  macroNormal.name = '10 m 地形宏观法线'
  macroNormal.magFilter = LinearFilter
  macroNormal.minFilter = LinearMipmapLinearFilter
  macroNormal.generateMipmaps = true
  macroNormal.needsUpdate = true
  return {
    horizons,
    setBearing,
    macroNormal,
    dispose() {
      horizons.dispose()
      macroNormal.dispose()
    },
  }
}
