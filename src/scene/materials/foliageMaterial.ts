import { DoubleSide, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking, type Texture } from 'three'
import { shadowUniforms } from '../atmosphere/shadowUniforms'
import { weatherUniform } from './pbrLibrary'

export type OutdoorCard = 'branch' | 'impostor' | 'ground'
const declarations = `
  uniform float windTime;
  uniform float snowLoad;
  varying float exposed;
  varying float presence;
`

// The capture grid and the camera-facing quad share a basis in the unscaled tree's local space.
// Orthographic shadow cameras get their own capture direction, including in the depth pass.
const billboard = `
  mat3 axes = mat3(instanceMatrix);
  vec3 toEye = projectionMatrix[3][3] > 0.5 ? vec3(viewMatrix[0].z, viewMatrix[1].z, viewMatrix[2].z) :
    cameraPosition - instanceMatrix[3].xyz;
  vec3 ray = normalize(inverse(axes) * toEye);
  ray.y = max(ray.y, 0.0001);
  ray = normalize(ray);
  vec2 oct = vec2(ray.x + ray.z, ray.x - ray.z) / dot(abs(ray), vec3(1.));
  vec2 frame = floor(clamp(oct * 0.5 + 0.5, 0., 1.) * 4. + 0.5);
  vMapUv = (frame + clamp(uv, 0.006, 0.994)) / 5.;
  vec3 right = length(ray.xz) < 0.0002 ? vec3(1.,0.,0.) : normalize(cross(vec3(0.,1.,0.), ray));
  vec3 up = cross(ray, right);
`
function bend(kind: OutdoorCard) {
  if (kind === 'impostor')
    return `
    transformed = right * position.x + up * position.y;
    float tip = clamp(transformed.y + 0.5, 0., 1.);
    transformed.x += sin(windTime * 1.4 + phase) * tip * tip * 0.005;
    exposed = smoothstep(0.05, 0.92, tip);
  `
  if (kind === 'branch')
    return `
    float tip = clamp(position.y + 0.52, 0., 1.);
    float gust = sin(windTime * 1.4 + phase) + 0.31 * sin(windTime * 2.3 + 9. * tip + phase);
    transformed.x += gust * (0.006 * tip * tip + 0.003 * uv.y);
    transformed.y -= 0.014 * snowLoad * uv.y;
    exposed = 0.28 + 0.72 * uv.y;
  `
  return `
    float tip = uv.y;
    transformed.x += sin(windTime * 1.8 + phase + 1.8 * tip) * 0.032 * tip * tip;
    presence = 1. - smoothstep(65., 114., distance(cameraPosition, instanceMatrix[3].xyz));
    exposed = tip * tip;
  `
}

function animate(
  material: MeshStandardMaterial | MeshDepthMaterial,
  kind: OutdoorCard,
  time: { value: number },
) {
  material.customProgramCacheKey = () => 'ars-vegetation-v3-' + kind
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shadowUniforms, { windTime: time, snowLoad: weatherUniform })
    shader.vertexShader = declarations + shader.vertexShader
    shader.vertexShader = shader.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + (kind === 'impostor' ? billboard : ''))
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float phase = dot(instanceMatrix[3].xz, vec2(0.19, 0.067));
        presence = 1.;
        ${bend(kind)}`,
      )
    if (kind === 'impostor') {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal = normalize(vec3(ray.x * 0.27, 0.94, ray.z * 0.27));',
      )
    }
    if (material instanceof MeshDepthMaterial) return
    shader.fragmentShader = declarations + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `
      ${
        kind === 'ground'
          ? `if (presence < 1.) {
        vec2 texel = floor(vMapUv * 151.);
        float threshold = fract(dot(fract(texel * vec2(0.1031, 0.11369)), vec2(27.37, 39.73)));
        if (presence <= threshold) discard;
      }`
          : ''
      }
      #include <alphatest_fragment>
      float pinnae = clamp(dot(diffuseColor.rgb, vec3(0.7, 1.3, 0.3)), 0., 1.);
      float snow = snowLoad * smoothstep(0.18, 1., exposed + 0.42 * pinnae);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.61, 0.68, 0.69), 0.82 * snow);
    `,
    )
  }
}

export function outdoorCardMaterial(kind: OutdoorCard, map: Texture, time: { value: number }) {
  const material = new MeshStandardMaterial({
    map,
    alphaTest: kind === 'impostor' ? 0.18 : 0.27,
    side: DoubleSide,
    roughness: 0.97,
  })
  // The shoot scan includes inter-needle occlusion. Lift its diffuse response before the scene
  // applies branch self-shadow and dawn skylight a second time. Snow colour stays independent.
  if (kind !== 'ground') material.color.setRGB(2.05, 2.82, 2.42)
  material.userData.staticVegetationOpacity = true
  material.forceSinglePass = true
  animate(material, kind, time)
  return material
}

export function treeShadowMaterial(kind: 'branch' | 'impostor', map: Texture, time: { value: number }) {
  const material = new MeshDepthMaterial({
    map,
    depthPacking: RGBADepthPacking,
    alphaTest: kind === 'impostor' ? 0.18 : 0.27,
    side: DoubleSide,
  })
  animate(material, kind, time)
  return material
}

export function outdoorSolid(colors: boolean, color: string) {
  const material = new MeshStandardMaterial({ vertexColors: colors, color, roughness: 0.96 })
  material.userData.staticVegetationOpacity = true
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shadowUniforms)
  }
  material.customProgramCacheKey = () => 'ars-vegetation-solid'
  return material
}
