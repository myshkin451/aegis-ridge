import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FogExp2,
  Group,
  Mesh,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  Vector3,
  type WebGLRenderTarget,
} from 'three'
import { photographs } from '../../data/photographs'
import { Sky } from 'three/addons/objects/Sky.js'
import { useShelterStore } from '../../store/useShelterStore'
import { nearSurfaceOpening } from '../../geometry/doors'
import { randomSource } from '../../geometry/random'
import { weatherUniform } from '../materials/pbrLibrary'
import { reduceMotion } from '../utils/Model'

export function sunAt(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  const angle = ((hour + minute / 60 - 6) / 12) * Math.PI
  return new Vector3(Math.cos(angle), Math.sin(angle) * 0.84, Math.sin(angle) * 0.54).normalize()
}
function distantRidges() {
  const g = new BufferGeometry(),
    v: number[] = [],
    colors: number[] = []
  for (let layer = 0; layer < 6; layer++) {
    const radius = 3900 + layer * 900,
      phase = layer * 2.31
    const color = new Color().lerpColors(new Color('#415b72'), new Color('#bfc9d0'), layer / 6)
    function point(i: number, crest: boolean): [number, number, number] {
      const a = (i / 700) * Math.PI * 2
      const ridges =
        0.036 * Math.sin(7 * a + phase) +
        0.02 * Math.cos(17 * a - phase) +
        0.012 * Math.sin(39 * a + 2 * phase) +
        0.008 * Math.cos(71 * a - phase)
      return [
        Math.sin(a) * radius,
        crest ? radius * (0.03 + layer * 0.014 + ridges) - 140 : -480,
        Math.cos(a) * radius,
      ]
    }
    for (let i = 0; i < 700; i++) {
      for (const p of [
        point(i, false),
        point(i, true),
        point(i + 1, true),
        point(i, false),
        point(i + 1, true),
        point(i + 1, false),
      ]) {
        v.push(...p)
        colors.push(color.r, color.g, color.b)
      }
    }
  }
  g.setAttribute('position', new Float32BufferAttribute(v, 3))
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}
const noise = `
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fb(vec2 p){return .53*noise2(p)+.28*noise2(p*2.13+37.)+.13*noise2(p*4.45+18.)+.06*noise2(p*9.24);}
`
function cloudSea() {
  const geo = new PlaneGeometry(9500, 9500, 88, 88)
  geo.rotateX(-Math.PI / 2)
  const group = new Group()
  const mats = [-217, -158, -119].map((y, i) => {
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        phase: { value: i * 17 },
        drift: { value: [0.0017, 0.0031, 0.0044][i] },
        time: { value: 0 },
        sun: { value: new Vector3() },
        shade: { value: new Color() },
      },
      vertexShader: `uniform float phase,time,drift; varying vec3 vP;${noise}
        void main(){vec3 p=position; p.y+=49.*fb(p.xz*.0024+phase+vec2(time*drift,-time*drift*.24))+13.*fb(p.xz*.012+phase); vec4 w=modelMatrix*vec4(p,1.);vP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `varying vec3 vP; uniform float phase,time,drift; uniform vec3 sun,shade;${noise}
        void main(){vec2 p=vP.xz*vec2(.0068,.008)+phase+vec2(time*drift,time*drift*.34);
        float f=fb(p+fb(p*.41)*1.8),lit=clamp(.51+3.1*(f-fb(p+.22*sun.xz)),0.,1.);
        float edge=1.-smoothstep(3400.,4700.,length(vP.xz));
        float a=smoothstep(.22,.70,f)*edge;
        vec3 col=mix(shade,vec3(.99,.89,.80),lit)*(.84+.25*f);
        gl_FragColor=vec4(col,a*(.68-phase*.005)); #include <colorspace_fragment>
        }`.replace('; #include', ';\n#include'),
    })
    const sheet = new Mesh(geo, m)
    sheet.position.y = y
    sheet.renderOrder = 2 + i
    group.add(sheet)
    return m
  })
  return {
    group,
    mats,
    dispose() {
      geo.dispose()
      mats.forEach((m) => m.dispose())
    },
  }
}
function Spindrift() {
  const geom = useMemo(() => {
    const p: number[] = [],
      random = randomSource(1503)
    for (let i = 0; i < 6200; i++) {
      const x = random() * 112,
        y = random() * 55,
        z = random() * 90
      p.push(x, y, z, x + 0.44 + random() * 0.7, y - 0.23, z + 0.06)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(p, 3))
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { time: { value: 0 } },
        vertexShader: `uniform float time; varying float fade;
      void main(){vec3 p=mod(position+vec3(time*9.,-time*3.,time),vec3(112.,55.,90.))-vec3(56.,9.,45.);
      vec4 mv=modelViewMatrix*vec4(p,1.);fade=smoothstep(1.,6.,-mv.z)*(1.-smoothstep(45.,120.,-mv.z));gl_Position=projectionMatrix*mv;}`,
        fragmentShader: 'varying float fade; void main(){gl_FragColor=vec4(.90,.96,1.,.68*fade);}',
      }),
    [],
  )
  useFrame((_, dt) => {
    if (!reduceMotion()) material.uniforms.time.value += Math.min(dt, 0.09)
  })
  useLayoutEffect(
    () => () => {
      geom.dispose()
      material.dispose()
    },
    [geom, material],
  )
  return <lineSegments frustumCulled={false} geometry={geom} material={material} />
}
export function PhysicalSky() {
  const time = useShelterStore((s) => s.time),
    cold = useShelterStore((s) => s.cold)
  const exterior = useShelterStore((s) => s.mode === 'exterior' && s.cameraState === 'site')
  const xray = useShelterStore((s) => s.mode === 'xray'),
    walk = useShelterStore((s) => s.cameraState === 'walkthrough')
  const section = useShelterStore((s) => s.cameraState === 'section')
  const scene = useThree((s) => s.scene),
    gl = useThree((s) => s.gl)
  const sky = useMemo(() => new Sky(), []),
    clouds = useMemo(cloudSea, []),
    ridges = useMemo(distantRidges, [])
  const outer = useRef<Group>(null)
  const sun = useMemo(() => sunAt(time), [time]),
    clock = useRef(0)
  const twilight = sun.y < 0.01,
    skyStudy = exterior || section
  const environments = useMemo(() => new Map<string, WebGLRenderTarget>(), [])
  useLayoutEffect(() => {
    sky.scale.setScalar(13000)
    const env = new Scene(),
      dome = new Sky(),
      pmrem = new PMREMGenerator(gl)
    dome.scale.copy(sky.scale)
    env.add(dome)
    const conditions = [{ time: '07:40', cold: false }, ...Object.values(photographs)]
    for (const condition of conditions) {
      const icy = 'cold' in condition && condition.cold
      const u = dome.material.uniforms
      u.sunPosition.value.copy(sunAt(condition.time)).multiplyScalar(450000)
      u.turbidity.value = icy ? 9 : 2.6
      u.rayleigh.value = icy ? 0.68 : 1.2
      u.mieCoefficient.value = icy ? 0.018 : 0.004
      environments.set(condition.time, pmrem.fromScene(env, 0.04, 0.1, 15000, { size: 64 }))
    }
    pmrem.dispose()
    dome.geometry.dispose()
    dome.material.dispose()
    scene.fog = new FogExp2(0xffffff, 0)
    scene.background = new Color()
    return () => {
      scene.environment = null
      scene.fog = null
      scene.background = null
      for (const target of environments.values()) target.dispose()
      environments.clear()
    }
  }, [environments, gl, scene, sky])
  useLayoutEffect(() => {
    weatherUniform.value = Number(cold)
    const u = sky.material.uniforms
    u.sunPosition.value.copy(sun).multiplyScalar(450000)
    u.turbidity.value = cold ? 9 : 2.6
    u.rayleigh.value = cold ? 0.68 : 1.2
    u.mieCoefficient.value = cold ? 0.018 : 0.004
    const haze = cold ? '#b5c8d2' : twilight ? '#667f9d' : sun.y < 0.16 ? '#8dabc1' : '#bdcbd0'
    const fog = scene.fog as FogExp2
    fog.color.set(haze)
    fog.density = exterior ? (cold ? 0.009 : 0.00019) : 0
    const paper = scene.background as Color
    paper.set(xray ? '#161c20' : walk ? '#373a3c' : section && twilight ? '#515f76' : '#dce2df')
    for (const m of clouds.mats) {
      m.uniforms.sun.value.copy(sun)
      m.uniforms.shade.value.set(twilight ? '#62778e' : sun.y < 0.16 ? '#657d9a' : '#7389a4')
    }
    scene.environment = environments.get(time)!.texture
    scene.environmentIntensity = walk ? 0.3 : 0.5
  }, [environments, scene, sky, clouds, sun, cold, exterior, twilight, xray, walk, section, time])
  useLayoutEffect(
    () => () => {
      sky.geometry.dispose()
      sky.material.dispose()
      ridges.dispose()
      clouds.dispose()
    },
    [sky, ridges, clouds],
  )
  useFrame(({ camera }, dt) => {
    if (outer.current)
      outer.current.visible =
        exterior || (walk && nearSurfaceOpening(camera.position.x, camera.position.y, camera.position.z))
    if (exterior && !reduceMotion()) {
      clock.current += Math.min(dt, 0.1)
      for (const m of clouds.mats) m.uniforms.time.value = clock.current
    }
  })
  return (
    <>
      <group ref={outer}>
        <primitive object={sky} />
        <mesh geometry={ridges}>
          <meshBasicMaterial vertexColors side={DoubleSide} />
        </mesh>
        <primitive object={clouds.group} />
      </group>
      <group visible={exterior && cold}>
        <Spindrift />
      </group>
      <hemisphereLight
        args={[
          xray
            ? '#9eb6cd'
            : skyStudy && twilight
              ? '#97b5e1'
              : exterior && sun.y < 0.16
                ? '#bdcff3'
                : '#e8eff8',
          walk ? '#887c73' : '#8b8576',
          xray ? 0.48 : walk ? 1.36 : twilight ? 0.8 : 1.16,
        ]}
      />
    </>
  )
}
