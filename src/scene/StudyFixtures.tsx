import { useLayoutEffect, useMemo, useRef } from 'react'
import { Box3, CanvasTexture, Frustum, Group, Matrix4, SRGBColorSpace, Vector3 } from 'three'
import { useFrame } from '@react-three/fiber'
import { roomsOn } from '../data/defaultBlueprint'
import { CORRIDOR, FLOORS } from '../data/floors'
import { footprint, shaftPlans } from '../geometry/coords'
import { randomSource } from '../geometry/random'
import type { UndergroundId } from '../types/shelter'
import { Model } from './utils/Model'
import { ModelBuilder } from './utils/modelBuilder'
import { floorLight } from './materials/pbrLibrary'
import { useShelterStore } from '../store/useShelterStore'

export function Inscription({
  text,
  position,
  width,
  height,
  color = '#eeeae1',
  background = '#343c3c',
  reverse = false,
  flat = false,
}: {
  text: string
  position: [number, number, number]
  width: number
  height: number
  color?: string
  background?: string
  reverse?: boolean
  flat?: boolean
}) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 768
    c.height = Math.max(64, Math.round((c.width * height) / width))
    const ctx = c.getContext('2d')!
    ctx.fillStyle = background
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = color
    ctx.font = '600 ' + Math.round(c.height * 0.76) + 'px "Arial Narrow","PingFang SC",sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, c.width / 2, c.height * 0.53, c.width * 0.95)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [text, width, height, color, background])
  useLayoutEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh
      position={position}
      rotation-y={reverse ? Math.PI : 0}
      rotation-x={flat ? -Math.PI / 2 : 0}
      userData={{ annotation: true }}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}
function farmStudy() {
  const m = new ModelBuilder(),
    rand = randomSource(21530)
  const farm = footprint(roomsOn('B3').find((r) => r.id === 'b3_hydroponics')!.bounds)
  for (const [i, x] of [farm.x - 6.3, farm.x - 2.8, farm.x + 2.8, farm.x + 6.3].entries()) {
    const levels = i === 0 || i === 3 ? 2 : 5,
      z = farm.z + 0.4,
      depth = farm.d - 2.6
    for (const dx of [-0.7, 0.7])
      for (const dz of [-depth / 2, 0, depth / 2]) {
        m.box('#a7b0ac', [x + dx, 1.21, z + dz], [0.055, 2.42, 0.06], 'steel')
        m.box('#646e69', [x + dx, 0.08, z + dz], [0.15, 0.16, 0.14], 'steel')
      }
    for (let j = 0; j < levels; j++) {
      const y = 0.34 + j * (levels === 2 ? 0.98 : 0.48)
      m.box('#aebcb3', [x, y, z], [1.54, 0.13, depth], 'steel')
      m.box('#414e44', [x, y + 0.072, z], [1.37, 0.06, depth - 0.1], 'epoxy')
      for (const dx of [-0.46, 0.46])
        m.box('#ffdcf2', [x + dx, y + (levels === 2 ? 0.79 : 0.43), z], [0.056, 0.035, depth - 0.12], 'lamp')
      for (let dz = -depth / 2 + 0.26; dz < depth / 2 - 0.1; dz += 0.39)
        for (const dx of [-0.42, 0, 0.42]) {
          const px = x + dx + (rand() - 0.5) * 0.12,
            pz = z + dz + (rand() - 0.5) * 0.11
          for (let k = 0; k < 5; k++) {
            const a = rand() * 6.28,
              t = rand(),
              r = 0.08 + t * 0.035
            m.part(
              'leaf',
              'foliage',
              t > 0.76 ? '#9eaf68' : t > 0.34 ? '#6b904e' : '#487044',
              [px + Math.sin(a) * r, y + 0.17 + t * 0.04, pz + Math.cos(a) * r],
              [0.16 + t * 0.1, 0.16 + t * 0.06, 0.34 + t * 0.09],
              [0, a, 0],
            )
          }
        }
    }
  }
  return m
}
function fixtures(id: UndergroundId) {
  const m = new ModelBuilder(),
    route = footprint(CORRIDOR),
    tint = floorLight[id]
  for (let x = route.x0 + 1.8; x < route.x1; x += 3.8) {
    for (const z of [route.z0 + 0.22, route.z1 - 0.22]) {
      m.box('#414b4b', [x, 2.91, z], [2.86, 0.11, 0.18], 'steel')
      m.box(tint, [x, 2.842, z], [2.68, 0.031, 0.1], 'lamp')
    }
  }
  for (const x of [-13, -9, 5, 9, 13]) {
    m.box('#485057', [x, 2.86, -11.8], [2.74, 0.14, 0.24], 'steel')
    m.box(tint, [x, 2.79, -11.66], [2.6, 0.075, 0.12], 'lamp')
    m.box(tint, [x, 0.15, -11.78], [1.24, 0.035, 0.07], 'lamp')
  }
  // Matte ceiling rafts leave the services above the corridor readable where the M layer is exposed.
  return m
}
const freight = shaftPlans.find((s) => s.id === 'freight')!
function FarmBay() {
  const root = useRef<Group>(null),
    view = useShelterStore((s) => s.cameraState)
  const portal = useMemo(
    () =>
      new Box3(
        new Vector3(-8.05, FLOORS.B3.elevation, -0.03),
        new Vector3(-5.95, FLOORS.B3.elevation + 2.5, 0.18),
      ),
    [],
  )
  const frustum = useMemo(() => new Frustum(), []),
    matrix = useMemo(() => new Matrix4(), [])
  useFrame(({ camera }) => {
    if (!root.current) return
    const p = camera.position
    if (view !== 'walkthrough' || (p.z >= -0.1 && p.x >= -16 && p.x <= 2)) {
      root.current.visible = true
      return
    }
    // The glazed frontage also exposes the bay from the B3 corridor.
    const corridor = Math.abs(p.y - FLOORS.B3.elevation - 1.65) < 1.9 && p.z >= -2.1 && p.z < 0
    frustum.setFromProjectionMatrix(
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    )
    root.current.visible = corridor || frustum.intersectsBox(portal)
  })
  return (
    <group ref={root}>
      <Model build={farmStudy} />
    </group>
  )
}
export function StudyFixtures({ id }: { id: UndergroundId }) {
  const build = useMemo(() => () => fixtures(id), [id])
  const view = useShelterStore((s) => s.cameraState),
    mode = useShelterStore((s) => s.mode)
  return (
    <>
      <Model build={build} />
      {view === 'section' && (
        <pointLight position={[0, 2.4, -8]} color={floorLight[id]} intensity={18} distance={16} decay={2} />
      )}
      {id === 'B3' && <FarmBay />}
      {(view === 'walkthrough' || mode === 'xray') && (
        <Inscription text={id} position={[freight.x, 1.62, freight.z0 + 0.13]} width={2.1} height={1.2} />
      )}
      {view === 'walkthrough' && id === 'B3' && (
        <>
          <Inscription text="B3　分层水培" width={2.35} height={0.34} position={[-7, 2.69, -0.013]} reverse />
          <Inscription text="B3　农业试验区" width={3.6} height={0.48} position={[-7, 1.75, 11.76]} reverse />
          <pointLight position={[-7, 2.45, 4]} color="#ffe1f1" intensity={16} distance={16} decay={2} />
        </>
      )}
    </>
  )
}
export function WalkCeiling({ id }: { id: UndergroundId }) {
  const build = useMemo(
    () => () => {
      const m = new ModelBuilder()
      for (const room of roomsOn(id)) {
        const r = footprint(room.bounds),
          h = room.clearHeightOverride ?? FLOORS[id].clearHeight
        m.box('#c5c6bd', [r.x, h + 0.025, r.z], [r.w - 0.02, 0.05, r.d - 0.02])
        for (let x = r.x0 + 1.4; x < r.x1 - 0.4; x += 3.3)
          m.box(floorLight[id], [x, h - 0.008, r.z], [0.07, 0.025, r.d - 0.48], 'lamp')
      }
      const r = footprint(CORRIDOR)
      m.box('#b9bdb9', [r.x, 3.035, r.z], [r.w, 0.07, r.d])
      return m
    },
    [id],
  )
  return <Model build={build} />
}
