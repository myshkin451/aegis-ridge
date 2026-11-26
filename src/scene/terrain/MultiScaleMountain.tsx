import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, MathUtils, MeshStandardMaterial, Plane, Vector3 } from 'three'
import { useShelterStore } from '../../store/useShelterStore'
import type { TerrainAtlas } from '../../geometry/siteElevations'
import { reduceMotion } from '../utils/Model'
import { sectionMaterial } from '../materials/sectionShader'
import { sectionFace, surveyLines, tileSurface } from './terrainMesh'
import { Vegetation } from './Vegetation'

function hillside(plane: Plane) {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    clippingPlanes: [plane],
    clipShadows: true,
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLand;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLand=position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
      #include <common>
      varying vec3 vLand;
      float grit(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        vec3 d=vec3(0.,1.,137.); float n=i.x+137.*i.y;
        vec4 v=fract(sin(n+d.xyyz+vec4(0.,0.,136.,1.))*43758.54);
        return mix(mix(v.x,v.y,f.x),mix(v.z,v.w,f.x),f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        vec2 p=vLand.xz+.19*vLand.y;
        float grain=.12*(grit(p*.82)-.5)+.13*(grit(p*.27)-.5)+.09*(grit(p*2.3)-.5);
        float exposure=smoothstep(.18,.63,length(vec2(dFdx(vLand.y),dFdy(vLand.y)))/max(.001,length(fwidth(vLand.xz))));
        float stratum=grit(vec2(vLand.x*.023+vLand.z*.031,vLand.y*.085))-.5;
        float strata=grit(vLand.xz*.013+stratum*2.)-.5;
        diffuseColor.rgb*=1.+grain+exposure*(stratum*.32+strata*.26);
        float distanceFade=smoothstep(500.,4100.,length(vLand.xz));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.19,.255,.30)*(1.+strata*.22),distanceFade*.65);`,
      )
  }
  return material
}
export function MultiScaleMountain({ atlas }: { atlas: TerrainAtlas }) {
  const mode = useShelterStore((s) => s.mode),
    floor = useShelterStore((s) => s.floor),
    z = useShelterStore((s) => s.sectionZ)
  const invalidate = useThree((s) => s.invalidate),
    gl = useThree((s) => s.gl)
  const front = useRef<Group>(null)
  const amount = useRef(mode === 'exterior' ? 1 : 0)
  const assembly = useMemo(() => {
    const tiles = [...atlas.tiles, ...atlas.insets]
    const geoms = tiles.map((tile) =>
      tileSurface(
        tile,
        tiles.filter((t) => t.parent === tile.id),
      ),
    )
    const backPlane = new Plane(new Vector3(0, 0, -1)),
      frontPlane = new Plane(new Vector3(0, 0, 1))
    const lines = [surveyLines(atlas.tiles[1], 20, 460, 140), surveyLines(atlas.tiles[2], 7, 140, 0)]
    return {
      geoms,
      lines,
      backPlane,
      frontPlane,
      back: hillside(backPlane),
      front: hillside(frontPlane),
      face: sectionMaterial('soil'),
    }
  }, [atlas])
  const face = useMemo(() => sectionFace(atlas.tiles[3], z), [atlas, z])
  useLayoutEffect(() => () => face.dispose(), [face])
  useLayoutEffect(
    () => () => {
      ;[...assembly.geoms, ...assembly.lines].forEach((g) => g.dispose())
      assembly.back.dispose()
      assembly.front.dispose()
      assembly.face.dispose()
    },
    [assembly],
  )
  const site = floor === 'ALL',
    solid = site && mode !== 'xray'
  const goal = Number(mode === 'exterior')
  useLayoutEffect(() => {
    assembly.backPlane.constant = z
    invalidate()
  }, [assembly, z, mode, floor, invalidate])
  useFrame((_, dt) => {
    const group = front.current
    if (!group) return
    const prior = amount.current
    const next = reduceMotion() ? goal : MathUtils.damp(prior, goal, 5, Math.min(dt, 0.12))
    amount.current = Math.abs(next - goal) < 0.004 ? goal : next
    const alpha = amount.current
    group.position.z = (1 - alpha) * 40
    group.visible = solid && alpha > 0
    assembly.frontPlane.constant = -z - group.position.z
    if (assembly.front.transparent !== alpha < 1) {
      assembly.front.transparent = alpha < 1
      assembly.front.needsUpdate = true
    }
    assembly.front.opacity = alpha
    assembly.front.depthWrite = alpha > 0.99
    if (prior !== alpha) {
      gl.shadowMap.needsUpdate = true
      invalidate()
    }
  })
  return (
    <group name="山地测区">
      <group visible={solid}>
        {assembly.geoms.map((g, i) => (
          <mesh
            key={i}
            visible={mode === 'exterior' || i === 3}
            geometry={g}
            material={assembly.back}
            receiveShadow
          />
        ))}
      </group>
      <group ref={front} name="南侧移出山体">
        {assembly.geoms.map((g, i) => (
          <mesh key={i} geometry={g} material={assembly.front} receiveShadow />
        ))}
      </group>
      {solid && mode === 'cutaway' && <mesh geometry={face} material={assembly.face} />}
      {site &&
        mode === 'xray' &&
        assembly.lines.map((g, i) => (
          <lineSegments key={i} geometry={g}>
            <lineBasicMaterial color="#a1b3b0" opacity={0.22} transparent depthWrite={false} />
          </lineSegments>
        ))}
      <Vegetation atlas={atlas} visible={site && mode === 'exterior'} />
    </group>
  )
}
