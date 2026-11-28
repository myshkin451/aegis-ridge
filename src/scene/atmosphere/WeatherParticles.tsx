import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import {
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
} from 'three'
import { randomSource } from '../../geometry/random'
import { reduceMotion } from '../utils/Model'

export type ParticleWeather = 'normal' | 'cryo' | 'bio' | 'fallout'
const mode = { normal: 0, cryo: 1, bio: 2, fallout: 3 }

function buildParticles() {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3))
  geometry.setIndex([0, 1, 2, 2, 1, 3])
  const seed = randomSource(1503)
  const samples = new Float32Array(2600 * 4)
  for (let i = 0; i < samples.length; i++) samples[i] = seed()
  geometry.setAttribute('seed', new InstancedBufferAttribute(samples, 4))
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    forceSinglePass: true,
    uniforms: { clock: { value: 0 }, kind: { value: 0 } },
    vertexShader: `
      attribute vec4 seed;
      uniform float clock, kind;
      varying vec2 disc;
      varying float alpha;
      void main() {
        bool snow = kind < 1.5, mist = kind < 2.5 && !snow;
        vec3 span = vec3(86., 44., 86.);
        vec3 drift = snow ? vec3(12.,-4.5,2.) : mist ? vec3(.35,.08,.16) : vec3(.64,-.95,.12);
        vec3 w = mod(seed.xyz * span + drift * clock * (.6 + seed.w) - cameraPosition, span)
               - span*.5 + cameraPosition;
        if (mist) w.y += sin(w.x*.4 + clock*.4 + seed.w*15.)*.4;
        vec4 eye = viewMatrix * vec4(w,1.);
        float radius = (.012 + .037 * seed.w) * (mist ? 1.3 : 1.);
        disc = position.xy;
        if (snow) {
          vec2 along = normalize((viewMatrix * vec4(drift,0.)).xy + vec2(.0001));
          eye.xy += along * disc.y * (.12 + .39 * seed.w) + vec2(-along.y,along.x)*disc.x*radius*.45;
        } else {
          eye.xy += disc * radius;
        }
        alpha = smoothstep(.25,2.5,-eye.z) * (1.-smoothstep(20.,43.,length(w-cameraPosition)));
        if (mist) alpha *= .33 + .67 * (1.-smoothstep(1.,14.,w.y));
        gl_Position = projectionMatrix * eye;
      }`,
    fragmentShader: `
      uniform float kind;
      varying vec2 disc;
      varying float alpha;
      void main() {
        vec3 tint = kind < 1.5 ? vec3(.85,.91,.97) : kind < 2.5 ? vec3(.64,.63,.30) : vec3(.44,.35,.27);
        float edge = 1.-smoothstep(.35,1.,dot(disc,disc));
        gl_FragColor = vec4(tint, alpha*edge*.68);
      }`,
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 8
  mesh.name = '外部天气 / 合批粒子'
  return mesh
}

export function WeatherParticles({ weather, visible }: { weather: ParticleWeather; visible: boolean }) {
  const mesh = useMemo(buildParticles, [])
  mesh.material.uniforms.kind.value = mode[weather]
  mesh.geometry.instanceCount = weather === 'bio' ? 1100 : weather === 'fallout' ? 1700 : 2600
  useFrame((_, dt) => {
    if (mesh.visible && !reduceMotion()) mesh.material.uniforms.clock.value += Math.min(dt, 0.1)
  })
  useLayoutEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.material.dispose()
    },
    [mesh],
  )
  return <primitive object={mesh} visible={visible && weather !== 'normal'} />
}
