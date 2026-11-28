import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  MathUtils,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  ShaderMaterial,
  Vector3,
} from 'three'
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js'
import { sampleTile, type TerrainTile } from '../../geometry/siteElevations'
import { nearSurfaceOpening } from '../../geometry/doors'
import { useShelterStore } from '../../store/useShelterStore'
import { useOperationsStore } from '../../store/useOperationsStore'
import { sunAt } from '../atmosphere/PhysicalSky'
import { reduceMotion } from '../utils/Model'
import type { Group } from 'three'

function mountainNoise() {
  let state = 81023
  return new SimplexNoise({
    random: () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 4294967296
    },
  })
}

// A continuous relief mesh starts on the last surveyed row. Oblique watersheds
// cross its four sides, so the camera can travel around or above the station.
function hinterland(tile: TerrainTile, noise: SimplexNoise) {
  const intervals = tile.n - 1
  // Keep all 20 m boundary vertices, then fan to 100 m stations on the outer ranges.
  const stride = 5
  const fine = intervals * 4,
    coarse = fine / stride,
    rows = 48
  const positions = new Float32Array((fine + coarse * rows) * 3)
  const indices: number[] = []
  const half = tile.span * 0.5
  function point(i: number, offset: number, index: number) {
    const side = Math.floor(i / intervals)
    const t = ((i % intervals) * 2) / intervals - 1
    const nx = [t, 1, -t, -1][side],
      nz = [-1, t, 1, -t][side]
    const x = nx * (half + offset),
      z = nz * (half + offset)
    const edge = sampleTile(tile, nx * half, nz * half).height
    const warp = 360 * noise.noise(x / 4900, z / 4100)
    const strike = (x * 0.84 + z * 0.54 + warp) / 2700
    const along = (-x * 0.54 + z * 0.84) / 4600
    const divide = noise.noise(strike, along)
    const crest = Math.exp(-1.95 * divide * divide)
    const regional = 0.5 + 0.5 * noise.noise(x / 6900, z / 6900)
    const shoulders =
      92 * crest * noise.noise(1.8 * strike + 0.31 * along, 1.8 * along) + 43 * noise.noise(x / 960, z / 760)
    const height = -420 + (780 + 820 * regional) * crest + shoulders
    const h = MathUtils.lerp(edge, height, MathUtils.smoothstep(offset, 0, 1400))
    positions.set([x, h, z], index * 3)
  }
  for (let i = 0; i < fine; i++) point(i, 0, i)
  for (let j = 0; j < rows; j++) {
    for (let k = 0; k < coarse; k++) {
      const a = fine + j * coarse + k,
        b = fine + j * coarse + ((k + 1) % coarse)
      point(k * stride, (j + 1) * 150, a)
      if (j === 0) {
        for (let v = 0; v < stride; v++) {
          const u = k * stride + v
          indices.push(u, (u + 1) % fine, a)
        }
        indices.push(((k + 1) * stride) % fine, b, a)
      }
      if (j < rows - 1) indices.push(a, b, a + coarse, b, b + coarse, a + coarse)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// A periodic density tile is sampled at three scales. Wind transports a
// single inversion bank over the outer valley; the existing lower decks remain visible through it.
function cloudDensity(noise: SimplexNoise) {
  const size = 128,
    bytes = new Uint8Array(size * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x * 2 * Math.PI) / size,
        v = (y * 2 * Math.PI) / size
      bytes[y * size + x] = Math.round(
        127.5 * (1 + noise.noise4d(1.4 * Math.cos(u), 1.4 * Math.sin(u), 1.4 * Math.cos(v), 1.4 * Math.sin(v))),
      )
    }
  const texture = new DataTexture(bytes, size, size, RedFormat)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

function distantScene(tile: TerrainTile) {
  const noise = mountainNoise()
  const land = hinterland(tile, noise),
    density = cloudDensity(noise)
  const uniforms = {
    sunlight: { value: new Vector3() },
    air: { value: new Color() },
    fogRate: { value: 1 },
    cloudMap: { value: density },
    seconds: { value: 0 },
  }
  const ridge = new ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform vec3 sunlight; varying vec3 point; varying vec3 slope;
      void main(){
        point=position;
        slope=normal;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader: `
      uniform vec3 air,sunlight; uniform float fogRate;
      varying vec3 point; varying vec3 slope;
      void main(){
        float depth=length(cameraPosition-point);
        float day=smoothstep(-.07,.08,sunlight.y);
        vec3 shade=mix(vec3(.042,.069,.12),vec3(.059,.107,.19),day);
        vec3 light=mix(vec3(.18,.23,.32),vec3(.79,.49,.30),day);
        vec3 n=normalize(slope);
        float skyView=.5+.5*dot(n,normalize(vec3(-.28,.88,-.37)));
        float exposure=clamp(.47+.45*n.y+.09*n.z,0.,1.);
        vec3 rock=mix(shade*(.45+.55*exposure),shade*vec3(1.20,1.30,1.40),skyView)
          +light*max(0.,dot(n,sunlight))*day*.68;
        // Elevated backslopes retain cool skylight and a thin snow line in the clear air.
        float ice=smoothstep(690.,1040.,point.y+95.*n.z)*smoothstep(.48,.87,n.y);
        rock=mix(rock,vec3(.43,.51,.62)*(.6+.4*skyView),ice*.46);
        float extinction=.00013*exp(-max(point.y,0.)*.00056)*fogRate;
        float alignment=max(0.,dot(normalize(point-cameraPosition),sunlight));
        float twilight=(1.-smoothstep(.08,.30,sunlight.y))*day;
        vec3 scatter=air*mix(vec3(.77,.90,1.10),vec3(1.17,.94,.79),twilight*pow(alignment,5.));
        gl_FragColor=vec4(mix(scatter,rock,exp(-depth*extinction)),1.);
        #include <colorspace_fragment>
      }`,
  })
  const cloud = new PlaneGeometry(9800, 9400, 70, 70)
  cloud.rotateX(-Math.PI / 2)
  const pos = cloud.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i)
    pos.setY(i, -99 + 19 * noise.noise(x / 710, z / 480) + 8 * noise.noise(x / 265, z / 220))
  }
  const mist = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `
      varying vec3 p; uniform sampler2D cloudMap; uniform float seconds; uniform vec3 sunlight,air;
      void main(){
        vec2 uv=p.xz*vec2(.00052,.00086)+seconds*vec2(.00076,-.00019);
        float broad=texture2D(cloudMap,uv*.39).r;
        float fold=texture2D(cloudMap,uv+vec2(.54*broad,.18*broad)).r;
        float fine=texture2D(cloudMap,uv*3.1).r;
        float thickness=.50*broad+.36*fold+.14*fine;
        float radius=length(p.xz);
        float bank=smoothstep(350.,900.,radius)*(1.-smoothstep(3500.,4680.,radius));
        float sunward=texture2D(cloudMap,uv+vec2(.54*broad,.18*broad)+.085*sunlight.xz).r;
        float rim=clamp(.46+2.1*(fold-sunward),0.,1.)*smoothstep(-.03,.06,sunlight.y);
        float dawn=1.-smoothstep(.10,.32,sunlight.y);
        vec3 shadow=air*mix(vec3(.75,.81,.92),vec3(.52,.62,.90),dawn);
        vec3 tint=mix(shadow,mix(vec3(.94,.87,.79),vec3(1.10,.77,.53),dawn),smoothstep(.12,.85,rim));
        gl_FragColor=vec4(tint,.78*bank*smoothstep(.30,.64,thickness));
        #include <colorspace_fragment>
      }`,
  })
  return {
    land,
    ridge,
    cloud,
    mist,
    uniforms,
    dispose() {
      land.dispose()
      ridge.dispose()
      cloud.dispose()
      mist.dispose()
      density.dispose()
    },
  }
}

export function DistantHorizon({ tile }: { tile: TerrainTile }) {
  const group = useRef<Group>(null)
  const model = useMemo(() => distantScene(tile), [tile])
  const time = useShelterStore((s) => s.time),
    cold = useShelterStore((s) => s.cold)
  const scenario = useOperationsStore((s) => s.scenario)
  useLayoutEffect(() => {
    const sun = sunAt(time)
    const weather = cold && scenario === 'normal' ? 'cryo' : scenario
    model.uniforms.sunlight.value.copy(sun)
    model.uniforms.fogRate.value = { normal: 1, cryo: 8, bio: 5, fallout: 6 }[weather]
    model.uniforms.air.value.set(
      weather === 'cryo'
        ? '#b5c8d2'
        : weather === 'bio'
          ? '#abb399'
          : weather === 'fallout'
            ? '#a89585'
            : sun.y < 0
              ? '#697d9b'
              : sun.y < 0.18
                ? '#a8b8ca'
                : '#b7c9d2',
    )
  }, [model, time, cold, scenario])
  useLayoutEffect(() => () => model.dispose(), [model])
  useFrame(({ camera }, dt) => {
    if (!group.current) return
    const s = useShelterStore.getState()
    group.current.visible =
      (s.mode === 'exterior' && s.cameraState === 'site') ||
      (s.cameraState === 'walkthrough' &&
        nearSurfaceOpening(camera.position.x, camera.position.y, camera.position.z))
    if (group.current.visible && !reduceMotion()) model.uniforms.seconds.value += Math.min(dt, 0.1)
  })
  return (
    <group ref={group} name="外山脊与逆温云顶">
      <mesh geometry={model.land} material={model.ridge} />
      <mesh geometry={model.cloud} material={model.mist} renderOrder={5} />
    </group>
  )
}
