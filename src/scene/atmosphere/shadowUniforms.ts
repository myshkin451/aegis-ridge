import { Vector2 } from 'three'

// One set of uniform objects survives material-program cache hits across quality and camera changes.
export const shadowUniforms = {
  CSM_cascades: { value: [new Vector2(), new Vector2(), new Vector2()] },
  cameraNear: { value: 0.07 },
  shadowFar: { value: 520 },
}
