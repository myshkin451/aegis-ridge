import { Vector4 } from 'three'
import { CORRIDOR } from '../../data/floors'
import { footprint } from '../../geometry/coords'

/** Centre and radius in NDC units of viewport height. W corrects for viewport aspect. */
export const walkRevealUniforms = {
  arsLens: { value: new Vector4(0, 0, 0, 1) },
  arsPlenumReveal: { value: 0 },
  arsWalkFloor: { value: 0 },
  arsWalkSoffit: { value: 0 },
}
export const serviceCorridor = footprint(CORRIDOR)
export type WalkSurface = 'wall' | 'ceiling'
export function lensContainsNdc(x: number, y: number) {
  const lens = walkRevealUniforms.arsLens.value
  return lens.z > 0 && Math.hypot((x - lens.x) * lens.w, y - lens.y) < lens.z
}

// The shader operates on the original batches, including instanced lamps mixed with lamps in rooms.
// Projected coordinates also work in reduced-resolution targets used by the existing post pipeline.
export const walkRevealPars = `
  uniform vec4 arsLens;
  uniform float arsPlenumReveal, arsWalkFloor, arsWalkSoffit;
  uniform int arsWalkSurface;
  varying vec3 arsProjected;
`
export const walkRevealFragment = `
  if (arsWalkSurface != 0) {
    if (arsLens.z > 0.0 && vMetric.y > arsWalkFloor + .045 && vMetric.y < arsWalkSoffit) {
      vec2 offset = arsProjected.xy / arsProjected.z - arsLens.xy;
      offset.x *= arsLens.w;
      if (dot(offset, offset) < arsLens.z * arsLens.z) discard;
    }
    if (arsWalkSurface == 2 && arsPlenumReveal > 0.0 &&
        vMetric.y > arsWalkFloor + 2.78 && vMetric.y < arsWalkFloor + 3.10 &&
        vMetric.x >= ${serviceCorridor.x0.toFixed(2)} && vMetric.x <= ${serviceCorridor.x1.toFixed(2)} &&
        vMetric.z >= ${serviceCorridor.z0.toFixed(2)} && vMetric.z <= ${serviceCorridor.z1.toFixed(2)}) {
      // Fractional coverage preserves depth ordering of both the ductwork and the panel skins.
      float sampleRank = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(.06711056, .00583715))));
      if (sampleRank < .94 * arsPlenumReveal) discard;
    }
  }
`
