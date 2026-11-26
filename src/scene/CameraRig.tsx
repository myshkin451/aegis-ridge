import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { ComponentRef, RefObject } from 'react'
import { MathUtils, OrthographicCamera, Vector3 } from 'three'
import { FLOORS, UNDERGROUND } from '../data/floors'
import type { Point3 } from '../types/shelter'
import { useShelterStore } from '../store/useShelterStore'
import { buffer, footprint, getFloorElevation, undergroundPlan } from './utils/coords'
import { reduceMotion } from './utils/Model'

export interface Instruments {
  station: RefObject<HTMLDivElement | null>
  rock: RefObject<HTMLDivElement | null>
  floorMarks: RefObject<HTMLDivElement | null>
  needle: RefObject<SVGGElement | null>
  ruler: RefObject<HTMLSpanElement | null>
  rulerText: RefObject<HTMLSpanElement | null>
}

const views = {
  panorama: { target: [0, -6.9, -2], offset: [-48, 32, 70], width: 78, height: 58.5 },
  surface: { target: [-1, 4, -1], offset: [-31, 19, 50], width: 47, height: 30 },
  section: { target: [0, -10, -1], offset: [-22, 12, 56], width: 52, height: 36 },
} satisfies Record<string, { target: Point3; offset: Point3; width: number; height: number }>
const station = footprint(FLOORS.L2.bounds)
const stationAnchor = new Vector3(station.x1 - 0.8, getFloorElevation('L2') + FLOORS.L2.pitch, station.z1 - 1)
const rockAnchor = new Vector3(undergroundPlan.x0 + 1.7, (buffer.bottom + buffer.top) / 2, undergroundPlan.z1)
const floorAnchors = UNDERGROUND.map(
  (id) => new Vector3(undergroundPlan.x1, getFloorElevation(id), undergroundPlan.z1),
)
const projected = new Vector3()

export function CameraRig({ instruments }: { instruments: Instruments }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size),
    invalidate = useThree((s) => s.invalidate)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const flight = useRef<{ position: Vector3; target: Vector3; zoom: number } | null>(null)
  const first = useRef(true)
  const floor = useShelterStore((s) => s.floor),
    preset = useShelterStore((s) => s.preset)
  const revision = useShelterStore((s) => s.cameraRevision),
    mode = useShelterStore((s) => s.mode)

  useLayoutEffect(() => {
    const c = controls.current
    if (!c || !size.width || !size.height) return
    const v =
      floor === 'ALL'
        ? views[preset]
        : {
            target: [-0.5, getFloorElevation(floor) + 0.4, -0.3] as Point3,
            offset: [-18, 40, 41] as Point3,
            width: 43,
            height: 34,
          }
    const mobile = size.width < 700
    const rail = mobile ? 24 : size.width < 1000 ? 145 : 205
    const zoom = Math.max(
      1.5,
      Math.min((size.width - rail) / v.width, (size.height - (mobile ? 120 : 62)) / v.height),
    )
    const target = new Vector3(...v.target),
      position = new Vector3(...v.offset).add(target)
    camera.setViewOffset(
      size.width,
      size.height,
      mobile ? 0 : -rail * 0.32,
      mobile ? 18 : 0,
      size.width,
      size.height,
    )
    if (first.current || reduceMotion()) {
      camera.position.copy(position)
      c.target.copy(target)
      camera.zoom = zoom
      camera.updateProjectionMatrix()
      c.update()
      flight.current = null
    } else flight.current = { target, position, zoom }
    first.current = false
    invalidate()
  }, [camera, invalidate, size.width, size.height, floor, preset, revision])

  useFrame((_, delta) => {
    const c = controls.current
    if (!c) return
    const goal = flight.current
    if (goal) {
      const t = 1 - Math.exp(-8 * Math.min(delta, 0.1))
      camera.position.lerp(goal.position, t)
      c.target.lerp(goal.target, t)
      camera.zoom = MathUtils.lerp(camera.zoom, goal.zoom, t)
      if (
        camera.position.distanceToSquared(goal.position) < 0.0002 &&
        Math.abs(camera.zoom - goal.zoom) < 0.006
      ) {
        camera.position.copy(goal.position)
        c.target.copy(goal.target)
        camera.zoom = goal.zoom
        flight.current = null
      }
      camera.updateProjectionMatrix()
      c.update()
      invalidate()
    }
    camera.updateMatrixWorld()
    const frameNote = (element: HTMLDivElement | null, anchor: Vector3, visible: boolean, left: boolean) => {
      if (!element) return
      projected.copy(anchor).project(camera)
      const x = ((projected.x + 1) * size.width) / 2,
        y = ((1 - projected.y) * size.height) / 2
      const fits =
        x > (left ? 235 : 65) && x < size.width - (left ? 70 : 153) && y > 51 && y < size.height - 60
      element.style.visibility = visible && fits ? 'visible' : 'hidden'
      if (visible && fits)
        element.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'
    }
    const notes = size.width > 850 && floor === 'ALL' && mode !== 'xray' && camera.position.z > c.target.z
    frameNote(instruments.station.current, stationAnchor, notes && preset !== 'section', false)
    frameNote(
      instruments.rock.current,
      rockAnchor,
      notes && mode === 'cutaway' && preset !== 'surface' && camera.position.x < c.target.x,
      true,
    )
    const marks = instruments.floorMarks.current
    if (marks) {
      const show =
        floor === 'ALL' && preset === 'section' && size.width > 850 && camera.position.z > c.target.z
      marks.hidden = !show
      if (show)
        floorAnchors.forEach((anchor, i) =>
          frameNote(marks.children[i] as HTMLDivElement, anchor, true, false),
        )
    }
    instruments.needle.current?.setAttribute(
      'transform',
      'rotate(' + MathUtils.radToDeg(c.getAzimuthalAngle()) + ' 18 18)',
    )
    const length = camera.zoom * 5 < 85 ? 5 : 2
    if (instruments.ruler.current)
      instruments.ruler.current.style.width = (length * camera.zoom).toFixed(1) + 'px'
    if (instruments.rulerText.current) instruments.rulerText.current.textContent = length + ' m'
  })
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.13}
      rotateSpeed={0.68}
      zoomSpeed={0.88}
      minZoom={1.5}
      maxZoom={95}
      minPolarAngle={0.11}
      maxPolarAngle={Math.PI * 0.495}
      onStart={() => {
        flight.current = null
      }}
    />
  )
}
