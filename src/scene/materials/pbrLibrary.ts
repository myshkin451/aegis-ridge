import {
  Color,
  DoubleSide,
  DataTexture,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
} from 'three'
import type { MeshStandardMaterialParameters } from 'three'
import { materialAtlas, materialScanMask, fieldPrintMask, walkingMaterials } from '../assets/pilotAssets'
import { fieldPrints, finishScans, normalLayerOffset, printLayerOffset } from '../assets/finishScans'
import { shadowUniforms } from '../atmosphere/shadowUniforms'
import { setSurfaceSampling } from './surfaceSampling'
import { FLOORS } from '../../data/floors'

export type Finish =
  | 'stone'
  | 'formed_concrete'
  | 'honed_granite'
  | 'brushed_inox'
  | 'granite'
  | 'lichen'
  | 'terrain'
  | 'snow'
  | 'shotcrete'
  | 'corten'
  | 'art_ridge'
  | 'art_herbarium'
  | 'art_water'
  | 'art_spurs'
  | 'art_fold'
  | 'oak_int'
  | 'plaster'
  | 'fabric'
  | 'tile'
  | 'ceramic'
  | 'mirror'
  | 'pvc_clean'
  | 'rubber_gym'
  | 'wood'
  | 'atrium-glass'
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
export const roomClockMinutes = { value: 460 }
export const roomWashStrength = { value: 1 }
export const roomSpecular = { value: 1 }
export const residentialDaylight = { value: 0 }
export const weatherUniform = { value: 0 }
export const emergencyCircuit = { value: 0 }
export const lobbyCircuit = { value: 1 }
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
  map.needsUpdate = true
  return map
}
let atlas: DataTexture | undefined,
  users = 0
const parameters: Partial<Record<Finish, MeshStandardMaterialParameters>> = {
  brushed_inox: { roughness: 0.32, metalness: 0.68, envMapIntensity: 1.25 },
  steel: { roughness: 0.42, metalness: 0.65 },
  corten: { roughness: 0.76, metalness: 0.43 },
  epoxy: { roughness: 0.48 },
  grate: { roughness: 0.37, metalness: 0.72 },
  lamp: { roughness: 0.32, emissive: 'white', emissiveIntensity: 2.3 },
  solar: { roughness: 0.21, metalness: 0.55 },
  foliage: { roughness: 1 },
  snow: { roughness: 0.68 },
  wood: { roughness: 0.77 },
  oak_int: { roughness: 0.57 },
  plaster: { roughness: 0.93 },
  fabric: { roughness: 0.95 },
  tile: { roughness: 0.56 },
  ceramic: { roughness: 0.2 },
  mirror: { roughness: 0.08, metalness: 1, envMapIntensity: 1.45 },
  pvc_clean: { roughness: 0.55 },
  rubber_gym: { roughness: 0.97 },
}
const legacyLarch = `float joint=1.-smoothstep(.002,.008+aa*1.8,abs(fract(axes.x/.16+.5)-.5)*.16);
    float fibre=sin(95.*axes.x+mottle*5.+sin(axes.y*1.2))*(1.-smoothstep(.010,.028,aa)); float weather=1.-smoothstep(.18,.9,vBoxLocal.y+.5);
    diffuseColor.rgb=mix(diffuseColor.rgb*vec3(1.24,.91,.65),vec3(.37,.36,.33),weather*.6);
    diffuseColor.rgb*=1.-.24*joint+.045*fibre; relief+=.0006*fibre-.003*joint;`
const metricScan = `
      // Metric projection for millwork. Curved meshes blend three planes by their smooth normal.
      #ifdef FLAT_SHADED
      vec3 worldN=surfaceNormal;
      #else
      vec3 worldN=inverseTransformDirection(vNormal,viewMatrix);
      #endif
      vec3 weights = vec3(0.);
      if (boxEdges) {
        weights = axis.y>.64 ? vec3(0.,1.,0.) : axis.x>axis.z ? vec3(1.,0.,0.) : vec3(0.,0.,1.);
      } else {
        weights = pow(abs(worldN), vec3(4.));
        weights /= max(dot(weights,vec3(1.)), .00001);
      }
      vec3 albedo=vec3(0.), tilt=vec3(0.); float scanRough=0.;
      for (int i=0; i<3; ++i) {
        float w=weights[i];
        if (w<.001) continue;
        // T × B points outward on both sides. Rotate the sampling frame and the normal together.
        float side=worldN[i]<0. ? -1. : 1.;
        vec3 T=i==0 ? vec3(0.,0.,-side) : vec3(i==1 ? 1. : side,0.,0.);
        vec3 B=i==1 ? vec3(0.,0.,-side) : vec3(0.,1.,0.);
        vec2 span=i==0 ? vExtent.zy : i==1 ? vExtent.xz : vExtent.xy;
        if ((scanSlot == ${finishScans.findIndex(s => s.finish === 'oak_int')} && span.x>span.y) || (scanSlot == ${finishScans.findIndex(s => s.finish === 'formed_concrete')} && i != 1)) {vec3 t=T; T=B; B=-t;}
        vec2 st=vec2(dot(vMetric,T), dot(vMetric,B))/repeatMetres;
        // Explicit gradients survive the varying plane selection at curved edges and bevels.
        vec2 gx=vec2(dot(metricDx,T),dot(metricDx,B))/repeatMetres;
        vec2 gy=vec2(dot(metricDy,T),dot(metricDy,B))/repeatMetres;
        vec4 colorR=textureGrad(finishLayers,vec3(st,float(scanSlot)),gx,gy);
        albedo+=w*sRGBTransferEOTF(colorR).rgb;
        scanRough+=w*colorR.a;
        vec4 pairs=textureGrad(finishLayers,vec3(st,float(${normalLayerOffset}+scanSlot/2)),gx,gy);
        vec2 xy=((scanSlot%2)==0 ? pairs.rg : pairs.ba)*2.-1.;
        float nz=sqrt(max(.01,1.-dot(xy,xy)));
        tilt+=w*(T*xy.x+B*xy.y)/nz;
      }
      diffuseColor.rgb*=clamp(albedo/scanWhite,vec3(.17),vec3(2.35));
      // Honed slab finish, retaining variation from the scan while limiting glossy outliers.
      if (scanSlot == ${finishScans.findIndex(s => s.finish === 'honed_granite')}) scanRough=clamp(.35+.43*scanRough, .38, .75);
      rough+=scanRough-roughness;
      scanPerturb=mat3(viewMatrix)*tilt*.58;
`

// A BoxGeometry face owns four vertices, all with one flat normal. Evaluate the
// signed metric UV frame once on those vertices. Interpolated UVs retain ordinary
// perspective-correct hardware gradients and 8× anisotropy on grazing views.
const plankSlot = finishScans.findIndex(scan => scan.finish === 'oak_int')
const formSlot = finishScans.findIndex(scan => scan.finish === 'formed_concrete')
const slabSlot = finishScans.findIndex(scan => scan.finish === 'honed_granite')
const boxScanVertex = `
  vec3 faceNormal = normal;
  #ifdef USE_INSTANCING
    faceNormal = mat3(instanceMatrix) * faceNormal;
  #endif
  faceNormal = normalize(mat3(modelMatrix) * faceNormal);
  vec3 face = abs(faceNormal);
  int plane = face.y > .64 ? 1 : face.x > face.z ? 0 : 2;
  float side = faceNormal[plane] < 0. ? -1. : 1.;
  vec2 span = plane == 0 ? vExtent.zy : plane == 1 ? vExtent.xz : vExtent.xy;
  bool turn = (scanSlot == ${plankSlot} && span.x > span.y) || (scanSlot == ${formSlot} && plane != 1);
  vec2 st = plane == 0 ? vec2(-side * vMetric.z, vMetric.y)
    : plane == 1 ? vec2(vMetric.x, -side * vMetric.z) : vec2(side * vMetric.x, vMetric.y);
  vScanFrame = vec4((turn ? vec2(st.y,-st.x) : st) / repeatMetres,
                    side * float(plane + 1), turn ? 1. : 0.);`
const boxScanFragment = `
  vec4 colorR = texture(finishLayers, vec3(vScanFrame.xy,float(scanSlot)));
  diffuseColor.rgb *= clamp(sRGBTransferEOTF(colorR).rgb / scanWhite, vec3(.17), vec3(2.35));
  rough += (scanSlot == ${slabSlot} ? clamp(.35+.43*colorR.a,.38,.75) : colorR.a) - roughness;
  vec4 pair = texture(finishLayers, vec3(vScanFrame.xy,float(${normalLayerOffset}+scanSlot/2)));
  vec2 xy = ((scanSlot%2)==0 ? pair.rg : pair.ba)*2.-1.;
  xy *= inversesqrt(max(.01,1.-dot(xy,xy)));
  if (vScanFrame.w > .5) xy = vec2(-xy.y,xy.x);
  float side = sign(vScanFrame.z), plane = abs(vScanFrame.z);
  vec3 tilt = plane < 1.5 ? vec3(0.,xy.y,-side*xy.x)
    : plane < 2.5 ? vec3(xy.x,0.,-side*xy.y) : vec3(side*xy.x,xy.y,0.);
  scanPerturb = mat3(viewMatrix)*tilt*.58;`

const artPattern = `if (printSlot >= 0 && (printMask & (1 << printSlot)) != 0 && vBoxLocal.z > .49) {
    vec2 printUv=clamp(vBoxLocal.xy+.5,vec2(.0005),vec2(.9995));
    diffuseColor.rgb*=sRGBTransferEOTF(texture(finishLayers,vec3(printUv,float(${printLayerOffset}+printSlot)))).rgb;
  }`
const glsl = {
  brushed_inox: `float grainLine=texture2D(grains,axes*vec2(.22,32.)).g-.5;
    float coarse=texture2D(grains,axes*vec2(.09,1.4)).r-.5;
    rough+=.06*coarse+.08*grainLine; diffuseColor.rgb*=1.+.09*coarse+.09*grainLine;`,
  art_ridge: artPattern,
  art_herbarium: artPattern,
  art_water: artPattern,
  art_spurs: artPattern,
  art_fold: artPattern,
  granite: `float cell=grain.r;
    vec3 mineral=cell<.55?vec3(.62,.51,.45):cell<.85?vec3(.83,.85,.83):vec3(.13,.12,.12);
    diffuseColor.rgb*=mix(vec3(.87),mineral*1.63,detail); relief+=grain.b*.0016;`,
  lichen: `float colony=smoothstep(.48,.76,mottle + .17*grain.b + .09*axis.y);
    diffuseColor.rgb=mix(diffuseColor.rgb, mix(vec3(.39,.36,.13),vec3(.49,.20,.044),grain.r),colony*.72);
    relief+=grain.b*.003;`,
  terrain: `float slope=acos(clamp(axis.y,0.,1.))*57.296;
    float ridge=texture2D(grains,vMetric.xz*.0037+vec2(mottle*.23,vMetric.y*.0009)).b-.5;
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
    float seam=1.-smoothstep(.002,.014+aa*1.8,min(board.x,board.y));
    vec2 tie=(fract(axes/vec2(1.2,.6))-.5)*vec2(1.2,.6);
    float hole=(1.-smoothstep(.014,.027+aa*1.8,length(tie)))*(1.-axis.y);
    diffuseColor.rgb*=1.+(mottle-.5)*.09-.15*seam-.46*hole; relief-=.004*seam+.009*hole;`,
  shotcrete: `vec2 pin=abs(fract(axes/1.5)-.5)*1.5;
    float plate=1.-smoothstep(.065,.075+aa,max(pin.x,pin.y)); float bolt=1.-smoothstep(.015,.023+aa,length(pin));
    float weephole=1.-smoothstep(.024,.04+aa,length(mod(axes+.2,1.5)-.75));
    diffuseColor.rgb*=1.+(grain.b-.5)*.24-.33*plate+.28*bolt-.55*weephole; relief+=.007*grain.b+.009*plate;`,
  corten: `float streak=texture2D(grains,axes*vec2(.25,.019)).b;
    diffuseColor.rgb*=vec3(1.12,.89,.73)*(.82+.18*mottle+.27*streak); relief+=streak*.002;`,
  wood: legacyLarch,
  oak_int: `if (walkFinish) {
      float ribbon=sin(axes.x*110.+1.3*sin(axes.y*2.2)+3.*mottle)*(1.-smoothstep(.012,.029,aa));
      diffuseColor.rgb*=1.+detail*(.035*ribbon+.065*(grain.b-.5)); relief+=.00016*ribbon;
    } else {
      ${legacyLarch}
      rough+=.20;
    }`,
  plaster: `diffuseColor.rgb*=1.+.035*(mottle-.5); relief+=.00015*(grain.g-.5);`,
  fabric: `vec2 thread=cos(axes*vec2(2400.,1950.)); float nearWeave=1.-smoothstep(.0006,.0028,aa);
    diffuseColor.rgb*=1.+.065*(mottle-.5)+.043*nearWeave*thread.x*thread.y;
    relief+=.00017*nearWeave*thread.x*thread.y;`,
  tile: `vec2 border=abs(fract(axes/vec2(.60,.30)+.5)-.5)*vec2(.60,.30);
    float grout=1.-smoothstep(.001,.003+aa*1.8,min(border.x,border.y));
    diffuseColor.rgb*=1.-.24*grout+.03*(mottle-.5); relief-=.0015*grout; rough+=.27*grout;`,
  ceramic: `rough+=.025*(mottle-.5);`,
  pvc_clean: `rough+=.035*(grain.g-.5); diffuseColor.rgb*=1.+.018*(mottle-.5);`,
  rubber_gym: `diffuseColor.rgb*=1.+.13*detail*(grain.r-.5); relief+=.0009*grain.b;`,
  glass: `float glassEdge=1.-smoothstep(.002,.03,max(edgeDistance,0.)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.39,.70,.56),glassEdge*.4);`,
  epoxy: `float track=(1.-smoothstep(.03,.34,abs(abs(vMetric.z+1.)-.54)))*axis.y;
    float scuff=pow(max(0.,sin(axes.y*41.+sin(axes.x*.84))),22.)*grain.r;
    rough+=.09*(grain.g-.5)-.23*track; diffuseColor.rgb*=1.+scuff*.14*detail+.05*track;`,
  grate: `vec2 rib=abs(fract(axes/vec2(.045,.12))-.5);
    float bar=mix(1.-smoothstep(.075,.12+aa*5.,min(rib.x,rib.y)),.36,smoothstep(.012,.036,aa));
    diffuseColor.rgb*=mix(.25,1.18,bar); relief+=.004*bar;`,
}
const finishOrder = Object.keys(glsl)
const scannedFinishes = new Set<string>(finishScans.map(scan => scan.finish))
function patternsFor(scanned: boolean) {
  return Object.entries(glsl)
    .filter(([name]) => name !== 'terrain' && name !== 'glass' && scannedFinishes.has(name) === scanned)
    .map(([name, code]) => `if (finishIndex == ${finishOrder.indexOf(name)}) { ${code} }`)
    .join(' else ')
}
const solidPatterns = patternsFor(false)
const scanFallbacks = patternsFor(true)
export function pbrMaterial(kind: Finish, box = false, vertexColors = false) {
  const map = (atlas ??= mineralMap())
  users++
  const mat =
    kind === 'glass' || kind === 'atrium-glass'
      ? new MeshPhysicalMaterial({
          roughness: 0.09,
          ior: 1.51,
          metalness: 0.04,
          clearcoat: 1,
          envMapIntensity: 1.25,
          transparent: true,
          opacity: kind === 'atrium-glass' ? 0.075 : 0.4,
          depthWrite: false,
        })
      : new MeshStandardMaterial({ roughness: 0.89, ...parameters[kind], vertexColors })
  if (kind === 'shotcrete' || kind === 'foliage') mat.side = DoubleSide
  mat.name = kind
  const family = kind === 'atrium-glass' ? 'glass' : kind === 'terrain' || kind === 'glass' ? kind : 'solid'
  const scanned = scannedFinishes.has(kind)
  const planarScan = scanned && box
  mat.customProgramCacheKey = () => scanned ? (planarScan ? 'ars-scan-box' : 'ars-scan-curved') : 'ars-' + family
  mat.forceSinglePass = true
  mat.addEventListener('dispose', () => {
    if (--users === 0) {
      map.dispose()
      atlas = undefined
    }
  })
  const pattern = scanned ? scanFallbacks : family === 'solid' ? solidPatterns : glsl[family]
  mat.onBeforeCompile = (shader, renderer) => {
    setSurfaceSampling(map, renderer.capabilities.getMaxAnisotropy())
    Object.assign(shader.uniforms, shadowUniforms)
    shader.uniforms.finishIndex = { value: finishOrder.indexOf(kind) }
    shader.uniforms.boxEdges = { value: box }
    shader.uniforms.frosted = { value: ['terrain', 'stone', 'solar', 'wood', 'steel'].includes(kind) }
    shader.uniforms.usesMottle = { value: ['terrain','wood','corten','snow','ceramic','lichen','stone','oak_int','fabric','plaster','tile','pvc_clean'].includes(kind) }
    shader.uniforms.isLamp = { value: kind === 'lamp' }
    shader.uniforms.grains = { value: map }
    shader.uniforms.snowCover = weatherUniform
    shader.uniforms.emergencyCircuit = emergencyCircuit
    shader.uniforms.lobbyCircuit = lobbyCircuit
    shader.uniforms.residentialDaylight = residentialDaylight
    shader.uniforms.roomMinutes = roomClockMinutes
    shader.uniforms.washStrength = roomWashStrength
    shader.uniforms.roomSpecular = roomSpecular
    const slot = finishScans.findIndex((s) => s.finish === kind)
    shader.uniforms.scanSlot = { value: slot }
    shader.uniforms.repeatMetres = { value: finishScans[slot]?.metres ?? 1 }
    shader.uniforms.scanWhite = { value: finishScans[slot]?.meanLinear ?? [1, 1, 1] }
    shader.uniforms.printSlot = { value: fieldPrints.findIndex((print) => print.finish === kind) }
    shader.uniforms.printMask = fieldPrintMask
    shader.uniforms.scanMask = materialScanMask
    shader.uniforms.finishLayers = materialAtlas
    shader.uniforms.walkFinish = walkingMaterials
    const vary = 'varying vec3 vMetric; varying vec3 vBoxLocal; varying vec3 vExtent;' +
      (planarScan ? '\nvarying vec4 vScanFrame;' : '')
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + vary + (planarScan ? '\nuniform int scanSlot; uniform float repeatMetres;' : ''))
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 mp=vec4(position,1.); vExtent=vec3(1.); vBoxLocal=position;
        #ifdef USE_INSTANCING
          vExtent=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
          mp=instanceMatrix*mp;
        #endif
        vMetric=(modelMatrix*mp).xyz;
        ${planarScan ? boxScanVertex : ''}`,
      )
    shader.fragmentShader = shader.fragmentShader
      // Isolate room reflections in the matched photographs without changing diffuse irradiance.
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
          radiance *= roomSpecular;
          clearcoatRadiance *= roomSpecular;
        #endif`)
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D grains; uniform highp sampler2DArray finishLayers; uniform bool walkFinish; uniform int scanSlot,printSlot,scanMask,printMask; uniform vec3 scanWhite; uniform float repeatMetres; uniform float roomSpecular,snowCover,roomMinutes,residentialDaylight,washStrength,emergencyCircuit,lobbyCircuit; uniform int finishIndex; uniform bool boxEdges,frosted,usesMottle,isLamp;\n' +
          vary,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 metricDx=dFdx(vMetric), metricDy=dFdy(vMetric);
        vec3 surfaceNormal=normalize(cross(metricDx,metricDy)); vec3 axis=abs(surfaceNormal);
        vec2 axes=axis.y>.64?vMetric.xz:vec2(axis.x>axis.z?vMetric.z:vMetric.x,vMetric.y);
        float aa=max(fwidth(axes.x),fwidth(axes.y)); float detail=1.-smoothstep(.009,.15,aa);
        vec3 grain=texture2D(grains,axes*3.1).rgb;
        float mottle=0.;
        bool surfaceFrost=frosted && snowCover>0. && vMetric.y>-.15;
        ${scanned ? 'bool useScan=walkFinish && (scanMask & (1 << scanSlot)) != 0;' : ''}
        if ((usesMottle ${scanned ? '&& !useScan' : ''}) || surfaceFrost)
          mottle=texture2D(grains,axes*.017).b*.55+texture2D(grains,axes*.048).b*.45;
        float smooRock=1.-smoothstep(.66,.83,axis.y);
        vec3 scanPerturb=vec3(0.);
        float reliefFade=1.-smoothstep(.004,.032,aa);
        float rough=0., relief=.00035*(grain.g-.5)*detail*reliefFade, edgeDistance=1.;
        if(boxEdges){vec3 e=(.5-abs(vBoxLocal))*vExtent;
        edgeDistance=max(min(e.x,e.y),min(max(e.x,e.y),e.z));
        float radius=clamp(min(vExtent.x,min(vExtent.y,vExtent.z))*.12,.005,.020);
        float edge=1.-clamp(edgeDistance/radius,0.,1.);
        relief-=radius*edge*edge*.40*reliefFade; diffuseColor.rgb*=1.+.07*edge*reliefFade;}
        ${scanned ? `if (useScan) { ${planarScan ? boxScanFragment : metricScan} } else { ${pattern} }` : pattern}
        if(surfaceFrost){float frost=snowCover*smoothstep(.25,.89,surfaceNormal.y+.18*mottle)*smoothstep(-.15,.1,vMetric.y);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.75,.84,.95)*(.93+.07*grain.b),frost*.95); relief+=frost*.002*grain.b*reliefFade;}`,
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
        float arsReliefGain=reliefFade;
        normal=normalize(abs(det)*(normal+scanPerturb-normal*dot(normal,scanPerturb))-sign(det)*arsReliefGain*(dFdx(relief)*R1+dFdy(relief)*R2)+normal*1.e-12);
        vec3 arsDndu=dFdx(normal), arsDndv=dFdy(normal);
        float arsSpecVar=0.25*(dot(arsDndu,arsDndu)+dot(arsDndv,arsDndv));
        roughnessFactor=clamp(sqrt(roughnessFactor*roughnessFactor+min(2.0*arsSpecVar,0.38)),0.08,1.0);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef USE_INSTANCING_COLOR
          if(isLamp) totalEmissiveRadiance*=vColor.rgb;
        #endif
        if(isLamp && vMetric.y>0. && vMetric.y<3.9 && vMetric.x>4. && abs(vMetric.z)<10.)
          totalEmissiveRadiance*=lobbyCircuit;
        if(vMetric.y<${FLOORS.B1.elevation + FLOORS.B1.pitch} && abs(vMetric.x)<16.1 && abs(vMetric.z)<12.1) {
          vec3 wash=vMetric.y<${FLOORS.B3.elevation - 0.29}?vec3(.54,.76,1.):vMetric.y<${FLOORS.B2.elevation - 0.29}?vec3(1.,.41,.67):vMetric.y<${FLOORS.B1.elevation - 0.29}?vec3(1.,.33,.095):vec3(1.,.82,.63);
          float levelY=mod(vMetric.y-(${FLOORS.B4.elevation})+.002,${FLOORS.B4.pitch});
          float pool=.22+.98*pow(.5+.5*cos(vMetric.x*1.76),2.)*(.38+.62*smoothstep(0.,2.7,levelY));
          bool farm=vMetric.y>=${FLOORS.B3.elevation} && vMetric.y<${FLOORS.B3.elevation + 3.0} && vMetric.x<2. && vMetric.z>0.;
          bool command=vMetric.y>=${FLOORS.B2.elevation} && vMetric.y<${FLOORS.B2.elevation + 3.0} && vMetric.x>4. && vMetric.z< -2.;
          bool living=vMetric.y>=${FLOORS.B2.elevation - 0.02} && vMetric.y<${FLOORS.B2.elevation + 3.65};
          bool night=roomMinutes>=1380. || roomMinutes<390.;
          if(living && !command && emergencyCircuit==0.) {
            wash=mix(vec3(1.,.28,.06),vec3(.98,.84,.68),residentialDaylight);
            if(night) {
              pool*=.12;
              if(isLamp) totalEmissiveRadiance*=levelY<.32?vec3(1.,.28,.035):vec3(.025,.013,.006);
            } else if(isLamp) totalEmissiveRadiance*=mix(vec3(1.,.68,.38),vec3(1.),residentialDaylight);
          }
          if(farm && emergencyCircuit==0. && roomMinutes>=720. && roomMinutes<1200.) {
            wash=vec3(.6,.68,.63); pool*=.38;
            if(isLamp) totalEmissiveRadiance*=.025;
          }
          if(command && night && emergencyCircuit==0.) {
            wash=vec3(1.,.045,.012);
            if(isLamp) totalEmissiveRadiance*=vec3(.65,.02,.012);
          }
          if (vMetric.y<${FLOORS.B3.elevation - 0.29} && washStrength<.99) wash=vec3(1.,.83,.68);
          if (emergencyCircuit>.0) {
            bool decon=vMetric.y>=${FLOORS.B1.elevation} && vMetric.x< -8. && vMetric.z< -2.;
            wash=mix(wash,decon?vec3(.85,.12,.06):vec3(.56,.36,.20),emergencyCircuit);
            if(isLamp) totalEmissiveRadiance*=mix(vec3(1.),decon?vec3(1.,.09,.04):vec3(.40,.27,.19),emergencyCircuit);
          }
          totalEmissiveRadiance+=diffuseColor.rgb*wash*pool*washStrength;
        }`,
      )
    if (kind === 'terrain')
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
      #ifdef USE_FOG
        float lowHaze=exp(-max(0.,vMetric.y+160.)*.0024);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,lowHaze*(1.-exp(-vFogDepth*min(fogDensity,.00035))));
      #endif`,
      )
  }
  return mat
}
export const lampTint = (id: keyof typeof floorLight) => new Color(floorLight[id])
