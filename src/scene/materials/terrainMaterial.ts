import { MeshStandardMaterial, NoBlending, Vector3, Vector4, type DataArrayTexture } from 'three'
import { terrainScanMetres } from '../assets/terrainScans'
import { shadowUniforms } from '../atmosphere/shadowUniforms'
import type { makeSurveyTextures } from '../terrain/surveyTextures'
import { weatherUniform } from './pbrLibrary'

const sunDirection = { value: new Vector3(1, 0, 0) }
const solarSector = { value: new Vector4(0, 1, 0, 0) }

export function setTerrainSun(direction: Vector3) {
  sunDirection.value.copy(direction)
  const sector = ((Math.atan2(direction.z, direction.x) * 8) / Math.PI + 16) % 16
  const first = Math.floor(sector)
  solarSector.value.set(first, (first + 1) % 16, sector - first, Math.asin(direction.y))
}

const varyings = `
varying vec4 vLandSurvey;
varying vec3 vSurveyPosition;
`

const surfaceFunctions = `
uniform highp sampler2DArray terrainScans;
uniform highp sampler2DArray terrainHorizons;
uniform sampler2D macroNormal;
uniform float scanMetres[5], snowCover;
uniform vec3 surveySun;
uniform vec4 solarSector;

vec3 landHash(vec2 p) {
  vec3 q = fract(p.xyx * vec3(.1031, .1030, .0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
float patchNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.-2.*f);
  return mix(mix(landHash(i).x, landHash(i+vec2(1,0)).x, f.x),
             mix(landHash(i+vec2(0,1)).x, landHash(i+1.).x, f.x), f.y);
}

struct FinishSample {
  vec4 colorHeight;
  vec3 normalSlope;
  float roughness;
};

FinishSample emptyFinish() {
  return FinishSample(vec4(0.), vec3(0.), 0.);
}

// A continuous low-frequency field crossfades neighboring random offsets / quarter-turns.
// In a patch interior only one colour/height + normal/roughness pair is fetched.
void scanPlane(inout FinishSample result, float weight, vec2 uv, vec2 dx, vec2 dy,
               vec3 tangent, vec3 bitangent, float slot, float phase) {
  float cell = floor(phase), blend = smoothstep(.30,.70,fract(phase));
  int patches = blend > .002 && blend < .998 ? 2 : 1;
  if (blend >= .998) cell += 1.;
  for (int i=0; i<patches; ++i) {
    float w = patches == 1 ? weight : weight*(i==0 ? 1.-blend : blend);
    vec3 random = landHash(vec2(cell+float(i),17.*slot));
    vec2 unit = random.z < .5 ? vec2(1.,0.) : vec2(0.,1.);
    if (fract(2.*random.z) < .5) unit *= -1.;
    mat2 rotation = mat2(unit, vec2(-unit.y, unit.x));
    vec2 st = rotation * uv + random.xy;
    vec2 gx = rotation * dx, gy = rotation * dy;
    vec4 colorHeight = textureGrad(terrainScans, vec3(st,slot), gx, gy);
    vec4 normalRough = textureGrad(terrainScans, vec3(st,slot+5.), gx, gy);
    vec2 n = (normalRough.rg*2.-1.) * rotation;
    n /= sqrt(max(.14, 1.-dot(n,n)));
    result.colorHeight += w*colorHeight;
    result.normalSlope += w*(tangent*n.x + bitangent*n.y);
    result.roughness += w*normalRough.b;
  }
}

FinishSample projectFinish(int index, vec3 p, vec3 dx, vec3 dy, vec3 n, float phase) {
  FinishSample s = emptyFinish();
  float scale = scanMetres[index], slot = float(index);
  p /= scale; dx /= scale; dy /= scale;
  vec3 a = abs(n); a *= a; a *= a; a *= a;
  a /= max(dot(a, vec3(1.)), .0001);
  // Flat ground uses one projection. Cliffs use the same sample path on up to three planes.
  int planes = max(a.x,a.z) > .008 ? 3 : 1;
  for (int axis=0; axis<planes; ++axis) {
    float weight = axis==0 ? a.y : axis==1 ? a.x : a.z;
    if (weight < .008) continue;
    vec3 tangent = axis==0 ? vec3(1,0,0) : axis==1 ? vec3(0.,0.,-sign(n.x)) : vec3(sign(n.z),0.,0.);
    vec3 bitangent = axis==0 ? vec3(0,0,-1) : vec3(0,1,0);
    vec2 uv = vec2(dot(p,tangent),dot(p,bitangent));
    vec2 gx = vec2(dot(dx,tangent),dot(dx,bitangent));
    vec2 gy = vec2(dot(dy,tangent),dot(dy,bitangent));
    scanPlane(s,weight,uv,gx,gy,tangent,bitangent,slot,phase+float(axis)*2.7);
  }
  s.colorHeight.rgb = sRGBTransferEOTF(s.colorHeight).rgb;
  return s;
}

vec2 surveyUv(vec2 p, float span, float intervals) {
  return ((p/span+.5)*intervals+.5)/(intervals+1.);
}
float horizonAngle(vec2 p, float span, float layer) {
  vec2 uv = surveyUv(p, span, 200.);
  float a = texture(terrainHorizons, vec3(uv, layer+solarSector.x)).r;
  float b = texture(terrainHorizons, vec3(uv, layer+solarSector.y)).r;
  return mix(a, b, solarSector.z) * 1.5707963;
}
vec2 skyVisibility(vec2 p) {
  float radius = max(abs(p.x), abs(p.y));
  float innerWeight = 1.-smoothstep(1140.,1200.,radius);
  float angle = 0., sky = 0.;
  if (innerWeight > 0.) {
    angle += innerWeight*horizonAngle(p, 2400., 0.);
    sky += innerWeight*texture(terrainHorizons,vec3(surveyUv(p,2400.,200.),32.)).r;
  }
  if (innerWeight < 1.) {
    angle += (1.-innerWeight)*horizonAngle(p, 10000., 16.);
    sky += (1.-innerWeight)*texture(terrainHorizons,vec3(surveyUv(p,10000.,200.),33.)).r;
  }
  // Filter the finite solar disc, the byte quantisation and subpixel shadow edges.
  float penumbra = .008 + min(.026, .5*fwidth(angle));
  return vec2(smoothstep(-penumbra, penumbra, solarSector.w-angle), sky);
}
`

const finishFragment = `
vec3 p = vSurveyPosition;
vec3 slopeNormal = normalize(inverseTransformDirection(normalize(vNormal), viewMatrix));
vec3 dpdx = dFdx(p), dpdy = dFdy(p);
float range = length(vViewPosition);
float macroFraction = smoothstep(300., 495., range);
vec2 macroXZ = texture(macroNormal, surveyUv(p.xz, 10000., 1000.)).rg*2.-1.;
vec3 mappedNormal = vec3(macroXZ.x, sqrt(max(.001, 1.-dot(macroXZ,macroXZ))), macroXZ.y);
slopeNormal = normalize(mix(slopeNormal, mappedNormal, macroFraction));

float slope = vLandSurvey.r*90., curvature = vLandSurvey.g*2.-1.;
float flow = vLandSurvey.b, north = vLandSurvey.a;
float region = patchNoise(p.xz*.0081 + vec2(17.2,-83.));
float fleck = patchNoise(p.xz*.064 + vec2(region*1.7,region));
float variation = .62*region + .38*fleck - .50;
float grade = slope + 9.*variation - curvature*3.;
float rock = smoothstep(32., 48., grade);
float gravel = smoothstep(19., 36., grade+flow*5.);
float soil = smoothstep(.20, .69, flow*.85 - curvature*.17 + variation*.83 + .17);
float snowLine = 465. - 145.*north - 85.*flow + 95.*variation;
float permanentSnow = smoothstep(snowLine-72., snowLine+72., p.y);
float buildup = max(permanentSnow, snowCover*(.91+.09*north));
float snow = buildup * (1.-smoothstep(29., 63., slope+variation*14.));
float bare = 1.-snow;
float weights[5];
weights[0] = bare*rock;
weights[1] = bare*(1.-rock)*gravel;
weights[2] = bare*(1.-rock)*(1.-gravel)*(1.-soil);
weights[3] = snow;
weights[4] = bare*(1.-rock)*(1.-gravel)*soil;

// The two strongest strata bound the height blend. At a triple junction the third
// hue enters the broad-scale colour continuously. Only the two detailed scans are fetched.
const vec3 fieldTint[5] = vec3[5](vec3(1.03,1.67,2.16),vec3(1.32,1.33,1.28),
                                  vec3(1.40,2.92,5.38),vec3(1.78,1.85,1.92),vec3(1.));
const vec3 scanMean[5] = vec3[5](vec3(.177,.095,.059),vec3(.081,.080,.075),
                                  vec3(.082,.049,.009),vec3(.379,.379,.389),vec3(.194,.121,.058));
int lead=0, runner=1;
float highest=-1., second=-1.;
vec3 broad=vec3(0.); float total=0.;
for (int i=0; i<5; i++) {
  float w=weights[i];
  if (w>highest) { runner=lead; second=highest; lead=i; highest=w; }
  else if (w>second) { runner=i; second=w; }
  broad += w*w*scanMean[i]*fieldTint[i];
  total += w*w;
}
vec3 pigment=broad/total, microSlope=vec3(0.);
float surfaceRoughness=.85;
if (macroFraction < 1.) {
  float phase = (fleck + .18*region)*18.;
  int strataCount=second>.055 ? 2 : 1;
  vec3 detailColor=vec3(0.), detailSlope=vec3(0.);
  float detailRough=0., detailWeight=0.;
  for (int layer=0; layer<strataCount; ++layer) {
    int slot=layer==0 ? lead : runner;
    FinishSample face=projectFinish(slot,p,dpdx,dpdy,slopeNormal,phase+float(layer)*.34);
    float relative=layer==0 ? 1. : second/highest;
    float w=relative*relative*exp2(7.*(face.colorHeight.a-.5));
    detailWeight+=w;
    detailColor+=w*min(vec3(.98),face.colorHeight.rgb*fieldTint[slot]);
    detailSlope+=w*face.normalSlope;
    detailRough+=w*face.roughness;
  }
  pigment=mix(detailColor/detailWeight,pigment,macroFraction);
  microSlope=detailSlope*((1.-macroFraction)/detailWeight);
  surfaceRoughness=mix(detailRough/detailWeight,.85,macroFraction);
}
vec3 terrainNormal = normalize(slopeNormal + .70*(microSlope - slopeNormal*dot(microSlope,slopeNormal)));
float moisture = smoothstep(.34,.96,flow) * (1.-snow);
diffuseColor.rgb = pigment * (1. + .49*variation - .16*moisture);
surfaceRoughness = max(.22,surfaceRoughness-.09*moisture);
vec2 skyAccess = skyVisibility(p.xz);
vec3 surveySunView = (viewMatrix * vec4(surveySun,0.)).xyz;
`

const heightFog = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float valleyAir = exp(-max(0.,p.y+175.) / 460.);
    float opticalDepth = fogDensity * vFogDepth * (.59+.45*valleyAir);
    float air = 1.-exp(-opticalDepth*(.30+opticalDepth));
    float lowSun = (1.-smoothstep(.06,.33,surveySun.y)) * smoothstep(-.09,.04,surveySun.y);
    float towardSun = max(0.,dot(-normalize(vViewPosition), surveySunView));
    vec3 scattered = fogColor * mix(vec3(.69,.86,1.12), vec3(1.16,.99,.80), lowSun*pow(towardSun,3.));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, scattered, air);
  #else
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vFogDepth));
  #endif
#endif
`

// This surface has two emitters: sky and sun. The section also uses the existing
// directional fill. Indoor rectangle/spot lights and room environment maps never light these slopes.
const terrainFragment = `
uniform float opacity, envMapIntensity;
varying vec3 vViewPosition;
varying vec3 vNormal;
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <clipping_planes_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
${varyings}
${surfaceFunctions}

float nearSunShadow() {
  float visibility = 1.;
  #if defined(USE_CSM) && defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    float depth = vViewPosition.z / (shadowFar-cameraNear);
    if (receiveShadow && depth < 1.) {
      #pragma unroll_loop_start
      for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
        if (depth >= CSM_cascades[ i ].x && depth < CSM_cascades[ i ].y) {
          visibility = getShadow(directionalShadowMap[ i ], directionalLightShadows[ i ].shadowMapSize,
            directionalLightShadows[ i ].shadowIntensity, directionalLightShadows[ i ].shadowBias,
            directionalLightShadows[ i ].shadowRadius, vDirectionalShadowCoord[ i ]);
        }
      }
      #pragma unroll_loop_end
      visibility = mix(visibility,1.,smoothstep(.85,1.,depth));
    }
  #endif
  return visibility;
}

void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  vec4 diffuseColor=vec4(1.,1.,1.,opacity);
  ${finishFragment}

  vec3 normal=normalize((viewMatrix*vec4(terrainNormal,0.)).xyz);
  vec3 irradiance=ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
    // Use the sky/ground colours as a low-frequency approximation of the scene environment.
    // This retains its current intensity without sampling the indoor CubeUV reflection atlas.
    irradiance += (1.+envMapIntensity)*getHemisphereLightIrradiance(hemisphereLights[0], normal);
  #endif
  float dawnSky = (1.-smoothstep(.08,.38,surveySun.y))*smoothstep(-.17,.025,surveySun.y);
  vec3 brightSkyDirection = normalize(vec3(surveySun.x,.37,surveySun.z));
  float facet = clamp(.51+.63*dot(terrainNormal,brightSkyDirection), .20, 1.);
  vec3 skylight = mix(vec3(.68,.83,1.04)*(.58+.56*facet),vec3(1.06,1.,.91),facet*facet);
  irradiance *= skyAccess.y*mix(vec3(1.),skylight,dawnSky);
  vec3 sunSpecular=vec3(0.);
  #if NUM_DIR_LIGHTS > 0
    vec3 L=directionalLights[0].direction;
    float nl=max(0.,dot(normal,L));
    if (nl>0. && skyAccess.x>0. && any(greaterThan(directionalLights[0].color,vec3(0.)))) {
      vec3 energy=directionalLights[0].color*(skyAccess.x*nearSunShadow()*nl);
      irradiance += energy;
      // Cook–Torrance GGX with Schlick Fresnel and Smith's correlated visibility; earth and snow are dielectrics.
      vec3 V=isOrthographic ? vec3(0,0,1) : normalize(vViewPosition);
      vec3 H=normalize(L+V);
      float nv=max(.001,dot(normal,V)), nh=max(0.,dot(normal,H)), vh=max(0.,dot(V,H));
      float a2=pow4(surfaceRoughness), den=nh*nh*(a2-1.)+1.;
      float visibility=.5/max(.001,nl*sqrt(a2+(1.-a2)*nv*nv)+nv*sqrt(a2+(1.-a2)*nl*nl));
      float fresnel=.027+.973*pow(1.-vh,5.);
      sunSpecular = energy*(a2*visibility*fresnel/(PI*den*den));
    }
  #endif
  #if NUM_DIR_LIGHTS > NUM_DIR_LIGHT_SHADOWS && NUM_DIR_LIGHT_SHADOWS > 0
    irradiance += directionalLights[NUM_DIR_LIGHT_SHADOWS].color
      * max(0.,dot(normal,directionalLights[NUM_DIR_LIGHT_SHADOWS].direction));
  #endif
  vec3 outgoingLight=diffuseColor.rgb*irradiance*RECIPROCAL_PI+sunSpecular;
  #include <opaque_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  ${heightFog}
  #include <premultiplied_alpha_fragment>
}
`

export function terrainMaterial(scans: DataArrayTexture, survey: ReturnType<typeof makeSurveyTextures>) {
  const material = new MeshStandardMaterial({ roughness: 0.86, blending: NoBlending })
  material.name = 'terrain-v2'
  material.customProgramCacheKey = () => 'ars-survey-terrain-v2'
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shadowUniforms, {
      terrainScans: { value: scans },
      scanMetres: { value: terrainScanMetres },
      terrainHorizons: { value: survey.horizons },
      macroNormal: { value: survey.macroNormal },
      surveySun: sunDirection,
      solarSector,
      snowCover: weatherUniform,
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 landSurvey;\n' + varyings)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSurveyPosition=position; vLandSurvey=landSurvey;',
      )
    shader.fragmentShader = terrainFragment
  }
  return material
}
