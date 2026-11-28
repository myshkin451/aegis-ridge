import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  Vector3,
  type WebGLRenderTarget,
} from 'three'
import { bedrooms } from '../../geometry/residentialPlan'
import { circadianAt } from '../../data/lighting'
import { FLOORS } from '../../data/floors'
import { pilotFixtures } from '../../data/roomLayouts/residential'
import { floorAt } from '../../geometry/viewGeometry'
import { captureRooms, ReflectionMixer, reflectionBytes, reflectionRoomAt, reflectionRooms } from './roomEnvironment'
import { photographs } from '../../data/photographs'
import { Sky } from 'three/addons/objects/Sky.js'
import { useShelterStore } from '../../store/useShelterStore'
import { nearSurfaceOpening } from '../../geometry/doors'
import { useOperationsStore } from '../../store/useOperationsStore'
import { WeatherParticles } from './WeatherParticles'
import { emergencyCircuit, residentialDaylight, roomClockMinutes, roomSpecular, roomWashStrength, weatherUniform } from '../materials/pbrLibrary'
import { reduceMotion } from '../utils/Model'

export function sunAt(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  const angle = ((hour + minute / 60 - 6) / 12) * Math.PI
  return new Vector3(Math.cos(angle), Math.sin(angle) * 0.84, Math.sin(angle) * 0.54).normalize()
}
function crestElevation(layer: number, angle: number) {
  const phase = layer * 2.31
  const ridges =
    0.036 * Math.sin(7 * angle + phase) +
    0.02 * Math.cos(17 * angle - phase) +
    0.012 * Math.sin(39 * angle + 2 * phase) +
    0.008 * Math.cos(71 * angle - phase)
  return (3900 + layer * 900) * (0.03 + layer * 0.014 + ridges) - 140
}

function distantRidges() {
  const g = new BufferGeometry(),
    v: number[] = [],
    colors: number[] = []
  for (let layer = 0; layer < 6; layer++) {
    const radius = 3900 + layer * 900
    const color = new Color().lerpColors(new Color('#415b72'), new Color('#bfc9d0'), layer / 6)
    function point(i: number, crest: boolean): [number, number, number] {
      const a = (i / 700) * Math.PI * 2
      return [Math.sin(a) * radius, crest ? crestElevation(layer, a) : -480, Math.cos(a) * radius]
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
        lowMist: { value: 0 },
        drift: { value: [0.0017, 0.0031, 0.0044][i] },
        time: { value: 0 },
        sun: { value: new Vector3() },
        shade: { value: new Color() },
      },
      vertexShader: `uniform float phase,time,drift,lowMist; varying vec3 vP;${noise}
        void main(){vec3 p=position; p.y+=49.*fb(p.xz*.0024+phase+vec2(time*drift,-time*drift*.24))+13.*fb(p.xz*.012+phase); vec4 w=modelMatrix*vec4(p,1.);
        if (lowMist>.5) { w.y=1.6+3.*fb(p.xz*.025+phase); }
        vP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader:
        `varying vec3 vP; uniform float phase,time,drift,lowMist; uniform vec3 sun,shade;${noise}
        void main(){vec2 p=vP.xz*vec2(.0068,.008)+phase+vec2(time*drift,time*drift*.34);
        float f=fb(p+fb(p*.41)*1.8),lit=clamp(.51+3.1*(f-fb(p+.22*sun.xz)),0.,1.);
        float edge=1.-smoothstep(3400.,4700.,length(vP.xz));
        float a=smoothstep(.22,.70,f)*edge;
        vec3 col=mix(shade,vec3(.99,.89,.80),lit)*(.84+.25*f);
        if (lowMist>.5) {
          col=mix(vec3(.36,.40,.27),vec3(.61,.65,.49),lit);
          a*=.37*(1.-smoothstep(90.,360.,length(vP.xz)));
        }
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
function linkedSkies() {
  const sky = new Sky()
  // Both apertures use the same program and physical sun. The small daylight display
  // maps local panel metres to rays toward the western horizon, retaining its true depth.
  const source = sky.material
  const vertex =
    'uniform float windowMode;\n' +
    source.vertexShader
      .replace(
        'vWorldPosition = worldPosition.xyz;',
        `vWorldPosition = windowMode > .5
        ? cameraPosition + vec3(-0.62, 0.18 + position.y * 0.67, position.x * 0.88)
        : worldPosition.xyz;`,
      )
      .replace('gl_Position.z = gl_Position.w;', 'if (windowMode < .5) gl_Position.z = gl_Position.w;')
  source.vertexShader = vertex
  source.fragmentShader =
    'uniform float windowMode;\n' +
    source.fragmentShader.replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      `if (windowMode > .5) {
        float dusk = 1.0-smoothstep(-.30,.09,vSunDirection.y);
        retColor *= mix(vec3(1.),vec3(.40,.85,1.75),dusk);
      }
      gl_FragColor = vec4(retColor,1.);`,
    )
  source.uniforms.windowMode = { value: 0 }
  const m = source.clone()
  m.uniforms = { ...source.uniforms, windowMode: { value: 1 } }
  m.depthWrite = true
  return { sky, panelMaterial: m }
}

function windowRidges() {
  const [w, h] = pilotFixtures.skyPanelSize
  const geometry = new BufferGeometry()
  const positions: number[] = [],
    colors: number[] = []
  // Project two ridgelines from the outdoor survey onto the same westward window rays.
  for (const layer of [4, 1]) {
    const radius = 3900 + layer * 900
    const tint = new Color(layer === 4 ? '#64819a' : '#344e68')
    function at(i: number, top: boolean) {
      const x = w * (i / 90 - 0.5),
        z = x * 0.88
      const a = Math.atan2(-0.62, z)
      const crest = ((Math.hypot(0.62, z) * crestElevation(layer, a)) / radius - 0.18) / 0.67
      positions.push(x, top ? Math.max(-h / 2, crest) : -h / 2, layer === 4 ? -0.001 : -0.002)
      colors.push(tint.r, tint.g, tint.b)
    }
    for (let i = 0; i < 90; i++) {
      at(i, false)
      at(i, true)
      at(i + 1, true)
      at(i, false)
      at(i + 1, true)
      at(i + 1, false)
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

export function PhysicalSky() {
  const time = useShelterStore((s) => s.time),
    cold = useShelterStore((s) => s.cold)
  const scenario = useOperationsStore((s) => s.scenario)
  const weather = scenario === 'normal' && cold ? 'cryo' : scenario
  const exterior = useShelterStore((s) => s.mode === 'exterior' && s.cameraState === 'site')
  const xray = useShelterStore((s) => s.mode === 'xray'),
    walk = useShelterStore((s) => s.cameraState === 'walkthrough')
  const section = useShelterStore((s) => s.cameraState === 'section')
  const scene = useThree((s) => s.scene),
    gl = useThree((s) => s.gl)
  const { sky, panelMaterial } = useMemo(linkedSkies, []),
    skyline = useMemo(windowRidges, []),
    clouds = useMemo(cloudSea, []),
    ridges = useMemo(distantRidges, [])
  const outer = useRef<Group>(null)
  const hemisphere = useRef<HemisphereLight>(null)
  const panel = useRef<Group>(null)
  const sun = useMemo(() => sunAt(time), [time]),
    clock = useRef(0)
  const twilight = sun.y < 0.01,
    skyStudy = exterior || section
  const mixer = useRef<ReflectionMixer | null>(null)
  const cubeSize = 64
  const showReflection = useMemo(() => new URLSearchParams(location.search).get('roomReflections') !== 'off', [])
  const windowFace = useMemo(() => new PlaneGeometry(...pilotFixtures.skyPanelSize), [])
  const cycle = useMemo(() => circadianAt(time), [time])
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
      if (environments.has(condition.time)) continue
      const icy = 'cold' in condition && condition.cold
      const u = dome.material.uniforms
      u.sunPosition.value.copy(sunAt(condition.time)).multiplyScalar(450000)
      u.turbidity.value = icy ? 9 : 2.6
      u.rayleigh.value = icy ? 0.68 : 1.2
      u.mieCoefficient.value = icy ? 0.018 : 0.004
      environments.set(condition.time, pmrem.fromScene(env, 0.04, 0.1, 15000, { size: cubeSize }))
    }
    pmrem.dispose()
    dome.geometry.dispose()
    dome.material.dispose()
    scene.fog = new FogExp2(0xffffff, 0)
    scene.background = new Color()
    return () => {
      mixer.current?.dispose()
      mixer.current = null
      roomSpecular.value = 1
      scene.environment = null
      scene.fog = null
      scene.background = null
      for (const target of environments.values()) target.dispose()
      environments.clear()
    }
  }, [environments, gl, scene, sky])
  useLayoutEffect(() => {
    weatherUniform.value = Number(weather === 'cryo')
    const [hours, minutes] = time.split(':').map(Number)
    roomClockMinutes.value = hours * 60 + minutes
    residentialDaylight.value = (cycle.kelvin - 2200) / 2800
    const u = sky.material.uniforms
    u.sunPosition.value.copy(sun).multiplyScalar(450000)
    u.turbidity.value = cold ? 9 : 2.6
    u.rayleigh.value = cold ? 0.68 : 1.2
    u.mieCoefficient.value = cold ? 0.018 : 0.004
    const haze =
      weather === 'bio'
        ? '#b7bca0'
        : weather === 'fallout'
          ? '#ad998a'
          : cold
            ? '#b5c8d2'
            : twilight
              ? '#667f9d'
              : sun.y < 0.16
                ? '#8dabc1'
                : '#bdcbd0'
    const fog = scene.fog as FogExp2
    fog.color.set(haze)
    fog.density = exterior ? { normal: 0.00019, cryo: 0.009, bio: 0.0031, fallout: 0.0041 }[weather] : 0
    const paper = scene.background as Color
    paper.set(xray ? '#161c20' : walk ? '#373a3c' : section && twilight ? '#515f76' : '#dce2df')
    for (const [i, m] of clouds.mats.entries()) {
      m.uniforms.lowMist.value = Number(weather === 'bio' && i === 2)
      m.uniforms.sun.value.copy(sun)
      m.uniforms.shade.value.set(twilight ? '#62778e' : sun.y < 0.16 ? '#657d9a' : '#7389a4')
    }
    if (!scene.environment) scene.environment = environments.get('07:40')!.texture
    scene.environmentIntensity = walk ? 0.3 : 0.5
  }, [environments, scene, sky, clouds, sun, cold, weather, exterior, twilight, xray, walk, section, time, cycle])
  useLayoutEffect(
    () => () => {
      sky.geometry.dispose()
      sky.material.dispose()
      panelMaterial.dispose()
      windowFace.dispose()
      skyline.dispose()
      ridges.dispose()
      clouds.dispose()
    },
    [sky, ridges, clouds, panelMaterial, skyline, windowFace],
  )
  useFrame(({ camera }, dt) => {
    if (!mixer.current) {
      performance.mark('ars-open-room-capture')
      const pmrem = new PMREMGenerator(gl)
      try {
        captureRooms(gl, scene, pmrem, cubeSize, environments)
      } finally {
        pmrem.dispose()
      }
      performance.mark('ars-open-room-filtered')
      mixer.current = new ReflectionMixer(gl, environments.get('07:40')!)
      const bytes = [...environments.values()].reduce((sum, target) => sum + reflectionBytes(target), mixer.current.bytes)
      gl.domElement.dataset.interiorEnvironmentBytes = String(bytes)
      gl.domElement.dataset.probeCount = String(reflectionRooms.length)
    }
    const floor = floorAt(camera.position.y - 1.65)
    const underground = walk && floor.startsWith('B') && camera.position.y < -6
    roomWashStrength.value = underground ? 0.1 : 1
    if (panel.current) panel.current.visible = underground && floor === 'B2' && emergencyCircuit.value === 0
    if (hemisphere.current) {
      const hemi = hemisphere.current
      hemi.color.set(
        underground
          ? '#f5e2c6'
          : xray
            ? '#9eb6cd'
            : skyStudy && twilight
              ? '#97b5e1'
              : exterior && sun.y < 0.16
                ? '#bdcff3'
                : '#e8eff8',
      )
      hemi.groundColor.set(underground ? '#7d6c5d' : walk ? '#887c73' : '#8b8576')
      hemi.intensity = underground ? 0.32 : xray ? 0.48 : walk ? 1.36 : twilight ? 0.18 : 0.35 + 0.81 * Math.min(1, Math.max(0, sun.y * 4))
    }
    const room = walk
      ? reflectionRoomAt(floor, camera.position.x, camera.position.y, camera.position.z)
      : undefined
    const skyKey = environments.has(time) ? time : sun.y < 0.05 ? '22:00' : sun.y < 0.28 ? '06:15' : '10:30'
    const target = environments.get(room ?? skyKey) ?? environments.get(skyKey)!
    scene.environment = mixer.current.update(gl, target.texture, dt)
    const emergency = Boolean(room && emergencyCircuit.value)
    const dim = room && floor === 'B2' && cycle.night && !emergency
    if (emergency && hemisphere.current) hemisphere.current.intensity = 0.075
    if (room === 'b2_commons' && !emergency) {
      roomWashStrength.value = .012
      if (hemisphere.current) {
        hemisphere.current.color.set('#d4dcde')
        hemisphere.current.groundColor.set('#968978')
        hemisphere.current.intensity = .16
      }
    }
    if (dim && hemisphere.current) hemisphere.current.intensity = room === 'b2_command' ? 0.018 : 0.035
    roomSpecular.value = room && !showReflection ? 0 : 1
    scene.environmentIntensity = emergency ? 0.08 : dim ? 0.025 : room === 'b2_commons' ? 0.22 : room && floor === 'B2' ? 0.57 : walk ? 0.32 : 0.5
    const mix = mixer.current.mix.toFixed(3).replace(/1\.000/, '1')
    if (gl.domElement.dataset.reflectionMix !== mix) gl.domElement.dataset.reflectionMix = mix
    if (gl.domElement.dataset.interiorEnvironment !== (room ?? 'sky'))
      gl.domElement.dataset.interiorEnvironment = room ?? 'sky'
    if (outer.current)
      outer.current.visible =
        exterior || (walk && nearSurfaceOpening(camera.position.x, camera.position.y, camera.position.z))
    if (exterior && !reduceMotion()) {
      clock.current += Math.min(dt, 0.1)
      for (const m of clouds.mats) m.uniforms.time.value = clock.current
    }
  }, 0.7)
  return (
    <>
      <group ref={outer}>
        {/* The dome projects to the far plane. Test it against the opaque terrain before shading the sky. */}
        <primitive object={sky} renderOrder={1} />
        <mesh geometry={ridges} visible={new URLSearchParams(location.search).get('terrain') === 'v1'}>
          <meshBasicMaterial vertexColors side={DoubleSide} />
        </mesh>
        <primitive object={clouds.group} />
      </group>
      <WeatherParticles visible={exterior} weather={weather} />
      <hemisphereLight ref={hemisphere} />
      <group ref={panel} visible={false} name="Bedroom sky windows">
        {bedrooms.map((b, i) => {
          const north = b.z0 === 0
          const x = i === 0 ? pilotFixtures.skyPanel[0] : (b.x0 + b.x1) / 2
          const y = i === 0 ? pilotFixtures.skyPanel[1] : 1.78
          const z = i === 0 ? pilotFixtures.skyPanel[2] : (b.z0 + b.z1) / 2 + (north ? -2.345 : 2.345)
          return <group key={b.id} position={[x, FLOORS.B2.elevation + y, z]}
              rotation-y={north ? Math.PI : 0} scale={i === 0 ? 1 : 0.88}>
            <mesh material={panelMaterial} geometry={windowFace} />
            <mesh geometry={skyline}>
              <meshBasicMaterial vertexColors side={DoubleSide} color={twilight ? '#526277' : '#c2d0db'} />
            </mesh>
          </group>
        })}
      </group>
    </>
  )
}
