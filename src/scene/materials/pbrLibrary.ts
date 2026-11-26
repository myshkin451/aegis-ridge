import {
  Color,
  DoubleSide,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
} from 'three'
import type { MeshStandardMaterialParameters } from 'three'
import { shadowUniforms } from '../atmosphere/shadowUniforms'
import { FLOORS } from '../../data/floors'

export type Finish =
  | 'stone'
  | 'granite'
  | 'lichen'
  | 'terrain'
  | 'snow'
  | 'shotcrete'
  | 'corten'
  | 'wood'
  | 'glass'
  | 'epoxy'
  | 'grate'
  | 'steel'
  | 'lamp'
  | 'foliage'
  | 'needles'
  | 'solar'
export const floorLight = {
  L2: '#ffe0af',
  L1: '#ffe5ce',
  B1: '#fff0da',
  B2: '#ffbb79',
  B3: '#ffd7ee',
  B4: '#e0efff',
} as const
export const weatherUniform = { value: 0 }
function hash(x: number, y: number) {
  let n = Math.imul(x + 71, 374761393) + Math.imul(y + 31, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
// Periodic Worley cells carry a mineral identity. Other channels supply fine grit and a smooth relief field.
function mineralMap() {
  const size = 128,
    period = 16,
    bytes = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x * period) / size,
        v = (y * period) / size
      let nearest = Infinity,
        mineral = 0
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const ix = Math.floor(u) + i,
            iy = Math.floor(v) + j
          const a = (ix + period) % period,
            b = (iy + period) % period
          const d = (ix + hash(a, b) - u) ** 2 + (iy + hash(b, a + 39) - v) ** 2
          if (d < nearest) {
            nearest = d
            mineral = hash(a + 53, b + 19)
          }
        }
      const k = 4 * (x + size * y)
      bytes[k] = Math.round(mineral * 255)
      bytes[k + 1] = Math.round(hash(x, y) * 255)
      bytes[k + 2] = Math.round(255 * Math.min(1, Math.sqrt(nearest)))
      bytes[k + 3] = 255
    }
  const map = new DataTexture(bytes, size, size)
  map.wrapS = map.wrapT = RepeatWrapping
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = map.needsUpdate = true
  return map
}
let atlas: DataTexture | undefined,
  users = 0
const parameters: Partial<Record<Finish, MeshStandardMaterialParameters>> = {
  steel: { roughness: 0.42, metalness: 0.65 },
  corten: { roughness: 0.76, metalness: 0.43 },
  epoxy: { roughness: 0.48 },
  grate: { roughness: 0.37, metalness: 0.72 },
  lamp: { roughness: 0.32, emissive: 'white', emissiveIntensity: 2.3 },
  solar: { roughness: 0.21, metalness: 0.55 },
  foliage: { roughness: 1 },
  snow: { roughness: 0.68 },
  wood: { roughness: 0.77 },
}
const glsl = {
  granite: `float cell=grain.r;
    vec3 mineral=cell<.55?vec3(.62,.51,.45):cell<.85?vec3(.83,.85,.83):vec3(.13,.12,.12);
    diffuseColor.rgb*=mix(vec3(.87),mineral*1.63,detail); relief+=grain.b*.0016;`,
  lichen: `float colony=smoothstep(.48,.76,mottle + .17*grain.b + .09*axis.y);
    diffuseColor.rgb=mix(diffuseColor.rgb, mix(vec3(.39,.36,.13),vec3(.49,.20,.044),grain.r),colony*.72);
    relief+=grain.b*.003;`,
  terrain: `float slope=acos(clamp(axis.y,0.,1.))*57.296;
    float ridge=sin(vMetric.y*.78+vMetric.x*.24+mottle*2.);
    diffuseColor.rgb*=1.+(mottle-.5)*.30+smooRock*(.18*ridge+.12*(grain.b-.5))*(1.-smoothstep(.25,2.,aa));
    float colony=smoothstep(.61,.81,mottle+.09*grain.b)*smooRock;
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.29,.28,.12),colony*.32);
    diffuseColor.rgb *= 1.+smoothstep(29.,35.,slope)*(grain.r-.5)*.16;
    float ice=smoothstep(.51,.78,dot(vColor.rgb,vec3(.2126,.7152,.0722)));
    float wind=sin(axes.x*7.+1.4*sin(axes.y*1.1)+mottle*3.)*detail;
    diffuseColor.rgb*=1.+ice*wind*.033; rough-=ice*detail*.18*step(.94,grain.g);
    relief+=grain.b*.007+ice*wind*.006;`,
  snow: `float ripple=sin(axes.x*8.+1.5*sin(axes.y*1.6)+mottle*3.);
    diffuseColor.rgb*=.97+.03*ripple; relief+=ripple*.007; rough-=.19*step(.94,grain.g)*detail;`,
  stone: `vec2 board=abs(fract(axes/vec2(2.4,1.2)+.5)-.5)*vec2(2.4,1.2);
    float seam=1.-smoothstep(.002,.014+aa,min(board.x,board.y));
    vec2 tie=(fract(axes/vec2(1.2,.6))-.5)*vec2(1.2,.6);
    float hole=(1.-smoothstep(.014,.027+aa,length(tie)))*(1.-axis.y);
    diffuseColor.rgb*=1.+(mottle-.5)*.09-.15*seam-.46*hole; relief-=.005*seam+.012*hole;`,
  shotcrete: `vec2 pin=abs(fract(axes/1.5)-.5)*1.5;
    float plate=1.-smoothstep(.065,.075+aa,max(pin.x,pin.y)); float bolt=1.-smoothstep(.015,.023+aa,length(pin));
    float weephole=1.-smoothstep(.024,.04+aa,length(mod(axes+.2,1.5)-.75));
    diffuseColor.rgb*=1.+(grain.b-.5)*.24-.33*plate+.28*bolt-.55*weephole; relief+=.007*grain.b+.009*plate;`,
  corten: `float streak=texture2D(grains,axes*vec2(.25,.019)).b;
    diffuseColor.rgb*=vec3(1.12,.89,.73)*(.82+.18*mottle+.27*streak); relief+=streak*.002;`,
  wood: `float joint=1.-smoothstep(.002,.008+aa,abs(fract(axes.x/.16+.5)-.5)*.16);
    float fibre=sin(95.*axes.x+mottle*5.+sin(axes.y*1.2)); float weather=1.-smoothstep(.18,.9,vBoxLocal.y+.5);
    diffuseColor.rgb=mix(diffuseColor.rgb*vec3(1.24,.91,.65),vec3(.37,.36,.33),weather*.6);
    diffuseColor.rgb*=1.-.24*joint+.045*fibre; relief+=.0008*fibre-.004*joint;`,
  glass: `float glassEdge=1.-smoothstep(.002,.03,max(edgeDistance,0.)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.39,.70,.56),glassEdge*.4);`,
  epoxy: `float track=(1.-smoothstep(.03,.34,abs(abs(vMetric.z+1.)-.54)))*axis.y;
    float scuff=pow(max(0.,sin(axes.y*41.+sin(axes.x*.84))),22.)*grain.r;
    rough+=.09*(grain.g-.5)-.23*track; diffuseColor.rgb*=1.+scuff*.14*detail+.05*track;`,
  grate: `vec2 rib=abs(fract(axes/vec2(.045,.12))-.5);
    float bar=1.-smoothstep(.075,.12+aa*5.,min(rib.x,rib.y));
    diffuseColor.rgb*=mix(.25,1.18,bar); relief+=.004*bar;`,
}
export function pbrMaterial(kind: Finish, box = false, vertexColors = false) {
  const map = (atlas ??= mineralMap())
  users++
  const mat =
    kind === 'glass'
      ? new MeshPhysicalMaterial({
          roughness: 0.09,
          ior: 1.51,
          metalness: 0.04,
          clearcoat: 1,
          envMapIntensity: 1.25,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        })
      : new MeshStandardMaterial({ roughness: 0.89, ...parameters[kind], vertexColors })
  if (kind === 'shotcrete' || kind === 'foliage') mat.side = DoubleSide
  mat.name = kind
  mat.customProgramCacheKey = () => 'ars-' + kind + (box ? '-edge' : '')
  mat.addEventListener('dispose', () => {
    if (--users === 0) {
      map.dispose()
      atlas = undefined
    }
  })
  const pattern = kind in glsl ? glsl[kind as keyof typeof glsl] : ''
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shadowUniforms)
    shader.uniforms.grains = { value: map }
    shader.uniforms.snowCover = weatherUniform
    const vary = 'varying vec3 vMetric; varying vec3 vBoxLocal; varying vec3 vExtent;'
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + vary)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 mp=vec4(position,1.); vExtent=vec3(1.); vBoxLocal=position;
        #ifdef USE_INSTANCING
          vExtent=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
          mp=instanceMatrix*mp;
        #endif
        vMetric=(modelMatrix*mp).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D grains; uniform float snowCover;\n' + vary,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 surfaceNormal=normalize(cross(dFdx(vMetric),dFdy(vMetric))); vec3 axis=abs(surfaceNormal);
        vec2 axes=axis.y>.64?vMetric.xz:vec2(axis.x>axis.z?vMetric.z:vMetric.x,vMetric.y);
        float aa=max(fwidth(axes.x),fwidth(axes.y)); float detail=1.-smoothstep(.009,.15,aa);
        vec3 grain=texture2D(grains,axes*3.1).rgb;
        float mottle=texture2D(grains,axes*.017).b*.55+texture2D(grains,axes*.048).b*.45;
        float smooRock=1.-smoothstep(.66,.83,axis.y);
        float rough=0., relief=.00055*(grain.g-.5)*detail, edgeDistance=1.;
        ${
          box
            ? `vec3 e=(.5-abs(vBoxLocal))*vExtent;
        edgeDistance=max(min(e.x,e.y),min(max(e.x,e.y),e.z));
        float radius=clamp(min(vExtent.x,min(vExtent.y,vExtent.z))*.12,.005,.020);
        float edge=1.-clamp(edgeDistance/radius,0.,1.);
        relief-=radius*edge*edge*.48; diffuseColor.rgb*=1.+.09*edge;`
            : ''
        }
        ${pattern}
        ${
          kind === 'terrain' || kind === 'stone' || kind === 'solar' || kind === 'wood' || kind === 'steel'
            ? `float frost=snowCover*smoothstep(.25,.89,surfaceNormal.y+.18*mottle)*smoothstep(-.15,.1,vMetric.y);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.75,.84,.95)*(.93+.07*grain.b),frost*.95); relief+=frost*.003*grain.b;`
            : ''
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+rough,.06,1.);',
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec3 R1=cross(dFdy(-vViewPosition),normal), R2=cross(normal,dFdx(-vViewPosition));
        float det=dot(dFdx(-vViewPosition),R1);
        normal=normalize(abs(det)*normal-sign(det)*(dFdx(relief)*R1+dFdy(relief)*R2)+normal*1.e-12);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${kind === 'lamp' ? '#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance*=vColor.rgb;\n#endif' : ''}
        if(vMetric.y<${FLOORS.B1.elevation + FLOORS.B1.pitch} && abs(vMetric.x)<16.1 && abs(vMetric.z)<12.1) {
          vec3 wash=vMetric.y<${FLOORS.B3.elevation - 0.29}?vec3(.54,.76,1.):vMetric.y<${FLOORS.B2.elevation - 0.29}?vec3(1.,.41,.67):vMetric.y<${FLOORS.B1.elevation - 0.29}?vec3(1.,.33,.095):vec3(1.,.82,.63);
          float levelY=mod(vMetric.y-(${FLOORS.B4.elevation})+.002,${FLOORS.B4.pitch});
          float pool=.22+.98*pow(.5+.5*cos(vMetric.x*1.76),2.)*(.38+.62*smoothstep(0.,2.7,levelY));
          totalEmissiveRadiance+=diffuseColor.rgb*wash*pool;
        }`,
      )
    if (kind === 'terrain')
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
      #ifdef USE_FOG
        float lowHaze=exp(-max(0.,vMetric.y+160.)*.0024);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,lowHaze*(1.-exp(-vFogDepth*.00035)));
      #endif`,
      )
  }
  return mat
}
export const lampTint = (id: keyof typeof floorLight) => new Color(floorLight[id])
