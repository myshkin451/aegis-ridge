import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, ShaderMaterial } from 'three'
import { CommonsAssets } from '../assets/CommonsAssets'
import { commonsPlacements } from '../../data/roomLayouts/commonsPlacements'
import { useBuildingCut } from '../BuildingSection'
import { useShelterStore } from '../../store/useShelterStore'
import { reduceMotion } from '../utils/Model'

function HearthFlames() {
  const cut = useBuildingCut()
  const material = useMemo(
    () =>
      new ShaderMaterial({
        clipping: !!cut,
        clippingPlanes: cut?.planes,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { clock: { value: 1.4 } },
        vertexShader: `
      #include <clipping_planes_pars_vertex>
      varying vec2 st;
      void main(){
        st=uv;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mvPosition;
        #include <clipping_planes_vertex>
      }`,
        fragmentShader: `
      #include <clipping_planes_pars_fragment>
      uniform float clock;
      varying vec2 st;
      float hash(vec2 p){return fract(sin(dot(p,vec2(45.17,91.73)))*43758.55);}
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
      }
      void main(){
        #include <clipping_planes_fragment>
        float y=st.y, t=clock;
        float warp=noise(vec2(st.x*8.-t*.28,y*5.-t*1.9))-.5;
        float plume=st.x*21.+warp*(.2+2.7*y)+.21*sin(y*13.-t*1.3);
        float h=.09+.88*pow(noise(vec2(floor(plume)*1.37,t*.65)),1.25);
        float v=y/h, contour=abs(fract(plume)-.5)*2.;
        float fibre=noise(vec2(st.x*88.+warp*5.,y*8.-t*3.2));
        float ribbons=1.-smoothstep(.65,.98,contour+v*.64+v*v*.34);
        float edge=smoothstep(0.,.05,st.x)*smoothstep(0.,.05,1.-st.x);
        float intensity=ribbons*(1.-smoothstep(.03,1.,v))*edge*(.29+.85*fibre);
        float heat=exp(-y*25.)*(.42+.6*noise(vec2(st.x*39.,t*.91)))*edge;
        float core=smoothstep(.22,1.,intensity+heat);
        vec3 color=mix(vec3(2.8,.29,.014),vec3(5.9,2.78,.64),core);
        gl_FragColor=vec4(color,clamp(intensity+heat,0.,1.));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      }),
    [cut],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ clock }) => {
    const s = useShelterStore.getState()
    if (s.lastFloor === 'B2' && s.cameraState === 'walkthrough' && !reduceMotion())
      material.uniforms.clock.value = clock.elapsedTime
  })
  return (
    <mesh name="壁炉火焰" position={[-14.35, 0.772, 7.315]} userData={{ emits: true }}>
      <planeGeometry args={[1.84, 0.46]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

export function CommonsFurnishings() {
  return (
    <group name="客厅与开放厨房">
      <CommonsAssets placements={commonsPlacements} />
      <HearthFlames />
    </group>
  )
}
