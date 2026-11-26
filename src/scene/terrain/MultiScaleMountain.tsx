import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, MathUtils, Plane, Vector3 } from 'three'
import { useShelterStore } from '../../store/useShelterStore'
import type { TerrainAtlas } from '../../geometry/siteElevations'
import { nearSurfaceOpening } from '../../geometry/doors'
import { reduceMotion } from '../utils/Model'
import { sectionMaterial } from '../materials/sectionShader'
import { sectionFace, surveyLines, tileSurface } from './terrainMesh'
import { pbrMaterial } from '../materials/pbrLibrary'
import { Vegetation } from './Vegetation'

function hillside(plane: Plane) {
  const material = pbrMaterial('terrain', false, true)
  material.clippingPlanes = [plane]
  material.clipShadows = true
  return material
}
export function MultiScaleMountain({ atlas }: { atlas: TerrainAtlas }) {
  const mode = useShelterStore((s) => s.mode),
    floor = useShelterStore((s) => s.floor),
    z = useShelterStore((s) => s.sectionZ)
  const invalidate = useThree((s) => s.invalidate),
    gl = useThree((s) => s.gl)
  const full = useRef<Group>(null),
    back = useRef<Group>(null)
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
      whole: pbrMaterial('terrain', false, true),
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
      assembly.whole.dispose()
      assembly.face.dispose()
    },
    [assembly],
  )
  const cameraState = useShelterStore((s) => s.cameraState)
  const site = floor === 'ALL' && cameraState !== 'sectionBox',
    solid = site && mode !== 'xray'
  const goal = Number(mode === 'exterior')
  useLayoutEffect(() => {
    assembly.backPlane.constant = z
    invalidate()
  }, [assembly, z, mode, floor, invalidate])
  useFrame(({ camera }, dt) => {
    const group = front.current
    if (!group) return
    const prior = amount.current
    const next = reduceMotion() ? goal : MathUtils.damp(prior, goal, 5, Math.min(dt, 0.12))
    amount.current = Math.abs(next - goal) < 0.004 ? goal : next
    const alpha = amount.current
    group.position.z = (1 - alpha) * 40
    const intact = solid && alpha === 1 && mode === 'exterior'
    if (full.current) {
      const opening =
        cameraState === 'walkthrough' &&
        nearSurfaceOpening(camera.position.x, camera.position.y, camera.position.z)
      full.current.visible = (solid && mode === 'exterior') || opening
      // Distant tiles never intersect the architectural section. Only split the 80 m cut block.
      full.current.children[3].visible = intact || opening
    }
    if (back.current) back.current.visible = solid && !intact
    group.visible = solid && alpha > 0 && !intact
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
      <group ref={full} visible={false}>
        {assembly.geoms.map((g, i) => (
          <mesh key={i} geometry={g} material={assembly.whole} receiveShadow />
        ))}
      </group>
      <group ref={back} visible={solid}>
        {assembly.geoms.map((g, i) => (
          <mesh key={i} visible={i === 3} geometry={g} material={assembly.back} receiveShadow />
        ))}
      </group>
      <group ref={front} name="南侧移出山体">
        {assembly.geoms.map((g, i) => (
          <mesh key={i} visible={i === 3} geometry={g} material={assembly.front} receiveShadow />
        ))}
      </group>
      <mesh visible={solid && mode === 'cutaway'} geometry={face} material={assembly.face} />
      {assembly.lines.map((g, i) => (
        <lineSegments key={i} geometry={g} visible={site && mode === 'xray'}>
          <lineBasicMaterial color="#a1b3b0" opacity={0.22} transparent depthWrite={false} />
        </lineSegments>
      ))}
      <Vegetation atlas={atlas} visible={site && mode === 'exterior'} />
    </group>
  )
}
