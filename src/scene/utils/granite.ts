import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RedFormat,
  RepeatWrapping,
} from 'three'

// A small, tileable mineral-grain field. Three projections keep vertical cuts and
// horizontal treads at the same physical grain size without special terrain UVs.
const size = 128
function hash(x: number, y: number) {
  let n = Math.imul(x + 33, 374761393) + Math.imul(y + 97, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
function noise(x: number, y: number, period: number) {
  const gx = (x * period) / size,
    gy = (y * period) / size,
    a = Math.floor(gx),
    b = Math.floor(gy)
  const dx = gx - a,
    dy = gy - b,
    sx = dx * dx * (3 - 2 * dx),
    sy = dy * dy * (3 - 2 * dy)
  const val = (i: number, j: number) => hash(i % period, j % period)
  return (
    (val(a, b) * (1 - sx) + val(a + 1, b) * sx) * (1 - sy) +
    (val(a, b + 1) * (1 - sx) + val(a + 1, b + 1) * sx) * sy
  )
}
const grain = new Uint8Array(size * size)
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const fine = hash(x, y)
    grain[y * size + x] = Math.round(
      255 * (noise(x, y, 4) * 0.26 + noise(x, y, 12) * 0.25 + noise(x, y, 32) * 0.22 + fine * 0.27),
    )
  }

export function graniteMaterial() {
  const map = new DataTexture(grain, size, size, RedFormat)
  map.wrapS = map.wrapT = RepeatWrapping
  map.minFilter = LinearMipmapLinearFilter
  map.magFilter = LinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.04 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGraniteGrain = { value: map }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStonePosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStonePosition = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uGraniteGrain;\nvarying vec3 vStonePosition;',
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          'vec3 p = vStonePosition;',
          'vec3 axis = abs(normalize(cross(dFdx(p), dFdy(p))));',
          'axis /= max(dot(axis, vec3(1.0)), 0.001);',
          'float grain = dot(axis, vec3(texture2D(uGraniteGrain,p.zy*0.28).r,texture2D(uGraniteGrain,p.xz*0.28).r,texture2D(uGraniteGrain,p.xy*0.28).r));',
          'float fold = p.y * 2.7 + p.x * 0.32 - p.z * 0.17 + 1.45*sin(p.x*0.15+p.z*0.12) + grain*0.9;',
          'float seam = smoothstep(0.78,0.99,sin(fold)) * (1.0-axis.y);',
          'diffuseColor.rgb *= 0.96 + (grain-0.5)*0.74 + seam*0.15;',
        ].join('\n'),
      )
  }
  return { material, map }
}
