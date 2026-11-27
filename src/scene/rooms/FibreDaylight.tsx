import { useLayoutEffect, useMemo } from 'react'
import { AdditiveBlending, CircleGeometry, Color, CylinderGeometry, Object3D, ShaderMaterial } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FLOORS } from '../../data/floors'
import { residentialLayouts } from '../../data/roomLayouts/residential'
import { useShelterStore } from '../../store/useShelterStore'
import { sunAt } from '../atmosphere/PhysicalSky'

const outlet = residentialLayouts.b2_commons.equipment.find((e) => e.tagCode === 'FO-201')!
const [x, base, z] = outlet.position
const y = FLOORS.B2.elevation + base
const length = base + 0.031 - 0.8
const lensRadius = 0.117

function makeBeam() {
  const cone = new CylinderGeometry(lensRadius, lensRadius + length * Math.tan(0.19), length, 44, 1, true)
  const lens = new CircleGeometry(lensRadius, 44).rotateX(Math.PI / 2).translate(0, length / 2, 0)
  const geometry = mergeGeometries([cone, lens])!
  cone.dispose()
  lens.dispose()
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { sunlight: { value: 0 }, tint: { value: new Color('#fff4d8') } },
    vertexShader: `varying float altitude,lensFace; varying vec3 gaze,surface;
      void main() {
        vec4 mv=modelViewMatrix*vec4(position,1.);
        altitude=uv.y; lensFace=step(.98,-normal.y); gaze=-mv.xyz; surface=normalMatrix*normal;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `uniform float sunlight; uniform vec3 tint;
      varying float altitude,lensFace; varying vec3 gaze,surface;
      void main() {
        // The visible path length tends to zero at the sides of the cone of illuminated air.
        float path=pow(max(0.,dot(normalize(gaze),normalize(surface))),.72);
        float air=path*(.085+.13*altitude)*(.18+.82*smoothstep(0.,.15,altitude));
        vec3 radiance=tint*mix(1.,4.6,lensFace);
        gl_FragColor=vec4(radiance,sunlight*mix(air,1.,lensFace));
      }`,
  })
  return { material, geometry }
}

/** The tracked roof collector feeds a fixed downward diffuser. Its light follows the site's solar altitude. */
export function FibreDaylight() {
  const time = useShelterStore((s) => s.time)
  const closed = useShelterStore((s) => s.cold)
  const walking = useShelterStore((s) => s.cameraState === 'walkthrough' && s.lastFloor === 'B2')
  const beam = useMemo(makeBeam, [])
  useLayoutEffect(
    () => () => {
      beam.geometry.dispose()
      beam.material.dispose()
    },
    [beam],
  )
  const target = useMemo(() => {
    const aim = new Object3D()
    aim.position.set(x, FLOORS.B2.elevation + 0.76, z)
    aim.updateMatrixWorld()
    return aim
  }, [])
  const sunHeight = Math.max(0, sunAt(time).y)
  beam.material.uniforms.sunlight.value = closed ? 0 : sunHeight
  return (
    <>
      <mesh
        geometry={beam.geometry}
        material={beam.material}
        userData={{ emits: true }}
        visible={walking && !closed && sunHeight > 0}
        position={[x, y + 0.031 - length / 2, z]}
      />
      <spotLight
        position={[x, y + 0.04, z]}
        target={target}
        color={sunHeight < 0.3 ? '#ffd9a4' : '#fff3d6'}
        intensity={closed ? 0 : 76 * sunHeight}
        distance={3.5}
        angle={0.26}
        penumbra={0.43}
        decay={2}
      />
    </>
  )
}
