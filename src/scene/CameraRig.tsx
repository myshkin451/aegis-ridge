import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { ComponentRef, RefObject } from 'react'
import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import { FLOORS, UNDERGROUND } from '../data/floors'
import type { Point3 } from '../types/shelter'
import { useShelterStore } from '../store/useShelterStore'
import { buffer, footprint, getFloorElevation, undergroundPlan } from '../geometry/coords'
import { siteFacilities, facilityAnchor } from '../data/siteFacilities'
import type { TerrainAtlas } from '../geometry/siteElevations'
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
  panorama: { target: [65, -60, 152], offset: [-0.38, 0.63, 1], width: 780, height: 490 },
  surface: { target: [0, 13, 0], offset: [-120, 16, -40], width: 77, height: 47 },
  section: { target: [0, -10, -2], offset: [0, 0.0001, 1], width: 71, height: 45 },
} satisfies Record<string, { target: Point3; offset: Point3; width: number; height: number }>
const station = footprint(FLOORS.L2.bounds)
const stationAnchor = new Vector3(station.x1 - 0.8, getFloorElevation('L2') + FLOORS.L2.pitch, station.z1 - 1)
const rockAnchor = new Vector3(undergroundPlan.x0 + 1.7, (buffer.bottom + buffer.top) / 2, undergroundPlan.z1)
const floorAnchors = UNDERGROUND.map(
  (id) => new Vector3(undergroundPlan.x1, getFloorElevation(id), undergroundPlan.z1),
)
const projected = new Vector3()

export function CameraRig({ instruments, atlas }: { instruments: Instruments; atlas: TerrainAtlas }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera | PerspectiveCamera
  const size = useThree((s) => s.size),
    invalidate = useThree((s) => s.invalidate)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const flight = useRef<{ position: Vector3; target: Vector3; zoom: number } | null>(null)
  const lastCamera = useRef<typeof camera | null>(null)
  const facilityId = useShelterStore((s) => s.facilityId)
  const floor = useShelterStore((s) => s.floor),
    preset = useShelterStore((s) => s.preset)
  const revision = useShelterStore((s) => s.cameraRevision),
    mode = useShelterStore((s) => s.mode)

  useLayoutEffect(() => {
    const c = controls.current
    if (!c || !size.width || !size.height) return
    let v =
      floor === 'ALL'
        ? views[preset]
        : {
            target: [-0.5, getFloorElevation(floor) + 0.4, -0.3] as Point3,
            offset: [-18, 40, 41] as Point3,
            width: 43,
            height: 38,
          }
    const facility = siteFacilities.find((f) => f.id === facilityId)
    if (facility) {
      const anchor = facilityAnchor(facility, atlas)
      const span =
        facility.kind === 'eastBore'
          ? 330
          : facility.kind === 'station'
            ? 70
            : facility.kind === 'road'
              ? 205
              : facility.kind === 'solar' || facility.kind === 'helipad'
                ? 49
                : 30
      v = {
        target: [anchor[0], anchor[1] + 1.4, anchor[2]],
        offset: facility.kind === 'eastPortal' ? [1, 0.32, 0.45] : [-0.62, 0.54, 0.92],
        width: span,
        height: span * 0.6,
      }
    } else if (mode === 'xray' && floor === 'ALL' && preset === 'panorama') {
      v = { target: [109, -13, 0], offset: [0.23, 0.69, 1], width: 390, height: 130 }
    }
    const mobile = size.width < 700
    const rail = mobile ? 28 : size.width < 1000 ? 150 : 190
    const pixelsPerMetre = Math.min(
      (size.width - rail) / v.width,
      (size.height - (mobile ? 145 : 75)) / v.height,
    )
    const perspective = camera instanceof PerspectiveCamera
    const zoom = perspective ? 1 : Math.max(0.075, pixelsPerMetre)
    const distance = perspective
      ? size.height / (2 * pixelsPerMetre * Math.tan(MathUtils.degToRad(camera.fov / 2)))
      : Math.max(100, v.width * 1.45)
    const target = new Vector3(...v.target)
    const position = new Vector3(...v.offset).normalize().multiplyScalar(distance).add(target)
    camera.setViewOffset(
      size.width,
      size.height,
      mobile ? 0 : -rail * 0.32,
      mobile ? 18 : 0,
      size.width,
      size.height,
    )
    if (lastCamera.current !== camera || reduceMotion()) {
      camera.position.copy(position)
      c.target.copy(target)
      camera.zoom = zoom
      camera.updateProjectionMatrix()
      c.update()
      flight.current = null
    } else flight.current = { target, position, zoom }
    lastCamera.current = camera
    invalidate()
  }, [camera, invalidate, size.width, size.height, floor, preset, revision, facilityId, atlas, mode])

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
    const px =
      camera instanceof PerspectiveCamera
        ? (size.height * camera.zoom) /
          (2 * camera.position.distanceTo(c.target) * Math.tan(MathUtils.degToRad(camera.fov / 2)))
        : camera.zoom
    const length = [1, 2, 5, 10, 20, 50, 100, 200, 500].filter((v) => v * px < 100).at(-1) ?? 1
    if (instruments.ruler.current) instruments.ruler.current.style.width = (length * px).toFixed(1) + 'px'
    if (instruments.rulerText.current) instruments.rulerText.current.textContent = length + ' m'
  })
  return (
    <OrbitControls
      ref={controls}
      camera={camera}
      makeDefault
      enableDamping
      dampingFactor={0.13}
      rotateSpeed={0.68}
      zoomSpeed={0.88}
      minZoom={0.06}
      minDistance={3}
      maxDistance={10000}
      maxZoom={95}
      minPolarAngle={0.11}
      maxPolarAngle={Math.PI * 0.5}
      onStart={() => {
        flight.current = null
      }}
    />
  )
}
