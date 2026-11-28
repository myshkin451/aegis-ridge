import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Camera, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Uniform, Vector3 } from 'three'

/** Small lens blur in scene-linear light. Reject samples at nearer silhouettes to keep
 * distant sky colours from washing into the edge of a foreground wall. */
export class PhotographicDepth extends Effect {
  readonly focus = new Uniform(4)
  constructor() {
    super('PhotographicDepth', `
      uniform float focus;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        float z = max(0.05, -getViewZ(depth));
        float radius = min(2.4, 2.8 * abs(1. - focus / z));
        vec3 sum = inputColor.rgb * 2.;
        float total = 2.;
        for (int i = 0; i < 8; ++i) {
          float angle = float(i) * 0.78539816;
          vec2 tap = uv + texelSize * radius * vec2(cos(angle), sin(angle));
          float other = max(.05, -getViewZ(readDepth(tap)));
          float weight = smoothstep(.80, .98, min(other, z) / max(other, z));
          sum += texture2D(inputBuffer, tap).rgb * weight;
          total += weight;
        }
        outputColor = vec4(sum / total, inputColor.a);
      }`, { attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH, blendFunction: BlendFunction.SRC })
    this.uniforms.set('focus', this.focus)
  }
}

/** Camera controls keep their own view/quaternion. Level only the photographic exposure,
 * then offset its optical centre so the subject under the crosshair stays in place. */
export function shiftLens() {
  const projection = new Matrix4(), rotation = new Quaternion(), aim = new Vector3()
  let applied = false
  return {
    apply(camera: Camera, enabled: boolean) {
      applied = false
      if (!enabled || !(camera instanceof PerspectiveCamera)) return
      camera.getWorldDirection(aim)
      const horizontal = Math.hypot(aim.x, aim.z)
      // A vertical overhead photograph has no horizontal sightline to level against.
      if (horizontal < 0.32) return
      applied = true
      projection.copy(camera.projectionMatrix)
      rotation.copy(camera.quaternion)
      const correction = MathUtils.smoothstep(horizontal, 0.32, 0.65)
      const pitch = Math.asin(MathUtils.clamp(aim.y, -1, 1))
      const residual = pitch * (1 - correction)
      aim.y = Math.tan(residual) * horizontal
      camera.lookAt(aim.add(camera.position))
      camera.updateMatrixWorld(true)
      camera.projectionMatrix.elements[9] += camera.projectionMatrix.elements[5] * Math.tan(pitch - residual)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    },
    restore(camera: Camera) {
      if (!applied) return
      camera.quaternion.copy(rotation)
      camera.updateMatrixWorld(true)
      camera.projectionMatrix.copy(projection)
      camera.projectionMatrixInverse.copy(projection).invert()
      applied = false
    },
  }
}
