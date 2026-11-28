import { LinearFilter, LinearMipmapLinearFilter, type Texture } from 'three'

/** Set this before the first upload, including for textures supplied through custom uniforms. */
export function setSurfaceSampling(texture: Texture, maxAnisotropy: number) {
  const anisotropy = Math.min(8, maxAnisotropy)
  if (
    texture.magFilter === LinearFilter &&
    texture.minFilter === LinearMipmapLinearFilter &&
    texture.generateMipmaps &&
    texture.anisotropy === anisotropy
  ) return
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = anisotropy
  texture.needsUpdate = true
}
