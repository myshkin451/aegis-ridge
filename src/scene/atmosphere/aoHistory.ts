import { LinearFilter, Matrix4, NearestFilter, WebGLRenderTarget } from 'three'
import type { Camera, ShaderMaterial, Texture, WebGLRenderer } from 'three'

// Attachment 0 retains n8ao's raw AO and view-space normal, including its filtering
// convention. Attachment 1 stores the normalized scene depth at 24 bits and the age
// of that AO sample. The bilateral filter still runs at every pixel of every frame.
const historyShader = /* glsl */ `
  layout(location = 1) out highp vec4 aoHistoryDepth;
  uniform highp sampler2D aoPreviousRaw, aoPreviousDepth;
  uniform mat4 aoCurrentToPreviousView;
  uniform bool aoHistoryValid, aoCameraStill;
  uniform int aoRefreshPhase;

  vec3 packHistoryDepth(float depth) {
    uint bits = uint(round(clamp(depth, 0., 1.) * 16777215.));
    return vec3(uvec3(bits >> 16u, (bits >> 8u) & 255u, bits & 255u)) / 255.;
  }
  float unpackHistoryDepth(vec3 rgb) {
    uvec3 b = uvec3(round(rgb * 255.));
    return float((b.r << 16u) | (b.g << 8u) | b.b) / 16777215.;
  }
  bool readHistory(vec3 position, vec3 dx, vec3 dy, out vec4 raw, out float age) {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    // Whole tiles take the same branch. Every tile is freshly sampled once in four frames.
    if (!aoHistoryValid || (((pixel.x / 8) + 3 * (pixel.y / 8)) & 3) == aoRefreshPhase) return false;
    ivec2 oldPixel = pixel;
    vec3 expected = position;
    if (!aoCameraStill) {
      expected = (aoCurrentToPreviousView * vec4(position, 1.)).xyz;
      vec4 clip = projMat * vec4(expected, 1.);
      if (clip.w <= 0.) return false;
      vec3 ndc = clip.xyz / clip.w;
      if (any(greaterThanEqual(abs(ndc), vec3(1.)))) return false;
      oldPixel = ivec2(floor((ndc.xy * .5 + .5) * resolution));
      if (any(greaterThanEqual(oldPixel, ivec2(resolution)))) return false;
    }
    vec4 prior = texelFetch(aoPreviousDepth, oldPixel, 0);
    if (prior.a >= 2.5 / 255. || all(greaterThan(prior.rgb, vec3(.999)))) return false;
    if (aoCameraStill && any(greaterThan(abs(prior.rgb - aoHistoryDepth.rgb), vec3(.5/255.)))) return false;

    vec4 priorRaw = texelFetch(aoPreviousRaw, oldPixel, 0);
    vec3 priorNormal = normalize(priorRaw.gba * 2. - 1.);
    vec3 currentNormal = aoCameraStill ? priorNormal : transpose(mat3(aoCurrentToPreviousView)) * priorNormal;
    // The derivative only validates flat/locally smooth surfaces. A discontinuity, silhouette
    // or suspect normal takes the original n8ao edge-aware normal + full sampling path.
    vec3 differentialNormal = cross(dx, dy);
    float normalLength = length(differentialNormal);
    if (!(normalLength > 1e-11 && dot(currentNormal, differentialNormal) > .995 * normalLength)) return false;
    if (!aoCameraStill) {
      vec3 surface = getWorldPos(unpackHistoryDepth(prior.rgb), (vec2(oldPixel) + .5) / resolution);
      vec3 delta = surface - expected;
      float tolerance = .001 + .00005 * abs(expected.z);
      // A sloping surface has a depth gradient within a pixel. Compare the two points
      // along its normal as well as bounding their separation in screen-pixel footprints.
      float footprint = max(length(dx), length(dy));
      if (abs(dot(delta, priorNormal)) > tolerance || length(delta) > 1.6 * footprint + tolerance) return false;
    }
    raw = vec4(priorRaw.r, .5 + .5 * normalize(currentNormal));
    age = prior.a + 1./255.;
    return true;
  }
`

/** Apply after the pass has configured its camera-specific raw N8AO material, before its first draw. */
export function patchAOHistory(material: ShaderMaterial) {
  if (material.uniforms.aoHistoryValid) return
  const source = material.fragmentShader
  const position = 'vec3 worldPos = getWorldPos(depth, vUv);'
  const background = 'if (depth == 1.0) {'
  const differential = 'fwidth(distance(worldPos, cameraPos))'
  // A different upstream shader must keep rendering through the ordinary N8AO path.
  if (![position, background, differential, 'void main() {'].every(marker => source.includes(marker))) return
  // n8ao shallow-copies its shader descriptor when the camera/depth mode changes.
  // Keep this material's state private so its successor still receives the shader patch.
  material.uniforms = { ...material.uniforms,
    aoPreviousRaw: { value: null }, aoPreviousDepth: { value: null },
    aoCurrentToPreviousView: { value: new Matrix4() }, aoRefreshPhase: { value: 0 },
    aoHistoryValid: { value: false }, aoCameraStill: { value: false },
  }
  material.fragmentShader = source
    .replace('void main() {', historyShader + '\nvoid main() {')
    .replace(differential, 'aoDistanceWidth')
    .replace(background, `
      vec3 aoPosition = getWorldPos(depth, vUv);
      vec3 aoDx = dFdx(aoPosition), aoDy = dFdy(aoPosition);
      float aoDistanceWidth = fwidth(distance(aoPosition, cameraPos));
      aoHistoryDepth = vec4(packHistoryDepth(depth), 0.);
      ${background}`)
    .replace(position, `
      vec4 priorRaw; float age;
      if (readHistory(aoPosition, aoDx, aoDy, priorRaw, age)) {
        gl_FragColor = priorRaw;
        aoHistoryDepth.a = age;
        return;
      }
      vec3 worldPos = aoPosition;`)
  material.needsUpdate = true
}

function makeHistoryTarget() {
  const target = new WebGLRenderTarget(1, 1, { count: 2, depthBuffer: false, stencilBuffer: false })
  target.texture.name = 'AO history / raw occlusion and normal'
  target.texture.minFilter = target.texture.magFilter = LinearFilter
  const depth = target.textures[1]
  depth.name = 'AO history / packed depth and sample age'
  depth.minFilter = depth.magFilter = NearestFilter
  return target
}

/** Wrap a raw (pre-blur) N8AO draw. The caller supplies an occluder/clip revision and
 * passes the returned raw texture into the first denoise iteration. Use invalidate()
 * when rendering an alternate pass, skipping frames, switching views or taking a photo. */
export class FullResolutionAOHistory {
  private readonly targets = [makeHistoryTarget(), makeHistoryTarget()]
  private readonly previousView = new Matrix4()
  private readonly previousProjection = new Matrix4()
  private revision?: number | string
  private camera?: Camera
  private next = 0
  private phase = 0

  invalidate() { this.camera = undefined }

  draw(renderer: WebGLRenderer, material: ShaderMaterial, camera: Camera, revision: number | string,
    allowReuse: boolean, drawRaw: () => void): Texture {
    const native = renderer.getRenderTarget()
    if (!native) throw new Error('N8AO raw pass requires an offscreen target')
    const u = material.uniforms
    if (!allowReuse || !u.aoHistoryValid) {
      this.invalidate()
      drawRaw()
      return native.texture
    }
    const target = this.targets[this.next], prior = this.targets[1 - this.next]
    if (target.width !== native.width || target.height !== native.height) {
      for (const buffer of this.targets) buffer.setSize(native.width, native.height)
      this.invalidate()
    }
    let valid = this.camera === camera && this.revision === revision && this.previousProjection.equals(camera.projectionMatrix)
    const still = valid && this.previousView.equals(camera.matrixWorldInverse)
    const relative: Matrix4 = u.aoCurrentToPreviousView.value
    relative.multiplyMatrices(this.previousView, camera.matrixWorld)
    if (valid && !still) {
      const e = relative.elements
      // A teleport/large turn is cheaper and cleaner to evaluate in full.
      valid = e[0] + e[5] + e[10] > 2.9 && Math.hypot(e[12], e[13], e[14]) < 1
    }

    u.aoHistoryValid.value = valid
    u.aoCameraStill.value = still
    u.aoRefreshPhase.value = this.phase
    u.aoPreviousRaw.value = valid ? prior.texture : null
    u.aoPreviousDepth.value = valid ? prior.textures[1] : null
    this.invalidate()
    try {
      renderer.setRenderTarget(target)
      drawRaw()
    } finally {
      renderer.setRenderTarget(native)
      u.aoHistoryValid.value = false
      u.aoPreviousRaw.value = u.aoPreviousDepth.value = null
    }
    this.camera = camera
    this.revision = revision
    this.previousProjection.copy(camera.projectionMatrix)
    this.previousView.copy(camera.matrixWorldInverse)
    this.next = 1 - this.next
    this.phase = (this.phase + 1) % 4
    return target.texture
  }

  dispose() {
    for (const target of this.targets) target.dispose()
    this.invalidate()
  }
}
