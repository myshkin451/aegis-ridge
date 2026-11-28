import { BlendFunction, Effect } from 'postprocessing'
import { Data3DTexture, LinearFilter, SRGBColorSpace, Uniform, Vector4 } from 'three'

const grades = {
  normal: { saturation: 1, tint: [1, 1, 1], lift: [0, 0, 0] },
  cryo: { saturation: 0.78, tint: [0.94, 0.98, 1.02], lift: [0.007, 0.013, 0.021] },
  bio: { saturation: 0.85, tint: [0.98, 1.005, 0.925], lift: [0.014, 0.019, 0.006] },
  fallout: { saturation: 0.69, tint: [1.01, 0.935, 0.87], lift: [0.022, 0.013, 0.009] },
}
const channels = ['normal', 'cryo', 'bio', 'fallout'] as const
const size = 17

function makeLut(id: keyof typeof grades) {
  const table = new Uint8Array(size ** 3 * 4)
  const { saturation, tint, lift } = grades[id]
  let texel = 0
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const rgb = [x, y, z].map((v) => v / (size - 1))
        const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
        for (let c = 0; c < 3; c++) {
          const level = (luma + saturation * (rgb[c] - luma)) * tint[c] + (1 - luma) ** 2 * lift[c]
          table[texel++] = Math.round(255 * Math.max(0, Math.min(1, level)))
        }
        table[texel++] = 255
      }
  const lut = new Data3DTexture(table, size, size, size)
  lut.name = 'ARS-01 / ' + id
  lut.minFilter = lut.magFilter = LinearFilter
  lut.needsUpdate = true
  return lut
}

/** Display-referred colour volumes, trilinearly sampled after AgX. Interruptions blend from the current mix. */
export class ScenarioGrade extends Effect {
  private readonly weights: Vector4
  private readonly target = new Vector4()

  constructor() {
    const weights = new Vector4(1, 0, 0, 0)
    const uniforms = new Map<string, Uniform>([['weights', new Uniform(weights)]])
    for (const id of channels) uniforms.set(id + 'Lut', new Uniform(makeLut(id)))
    super(
      'StationGrade',
      `
      uniform highp sampler3D normalLut;
      uniform highp sampler3D cryoLut;
      uniform highp sampler3D bioLut;
      uniform highp sampler3D falloutLut;
      uniform vec4 weights;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 p = (clamp(inputColor.rgb, 0., 1.) * 16. + 0.5) / 17.;
        vec3 c = vec3(0.);
        if (weights.x > 0.) c += weights.x * texture(normalLut, p).rgb;
        if (weights.y > 0.) c += weights.y * texture(cryoLut, p).rgb;
        if (weights.z > 0.) c += weights.z * texture(bioLut, p).rgb;
        if (weights.w > 0.) c += weights.w * texture(falloutLut, p).rgb;
        outputColor = vec4(c, inputColor.a);
      }`,
      { uniforms, blendFunction: BlendFunction.SRC },
    )
    this.weights = weights
    this.inputColorSpace = SRGBColorSpace
  }

  transition(scenario: keyof typeof grades, dt: number) {
    this.target.set(0, 0, 0, 0).setComponent(channels.indexOf(scenario), 1)
    const gain = 1 - Math.exp(-Math.max(0, dt) * 8)
    this.weights.lerp(this.target, gain)
    if (this.weights.dot(this.target) > 0.999) this.weights.copy(this.target)
  }

  override dispose() {
    for (const id of channels) this.uniforms.get(id + 'Lut')!.value.dispose()
    super.dispose()
  }
}
