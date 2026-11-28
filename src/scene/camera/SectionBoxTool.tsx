import { useMemo, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useShelterStore } from '../../store/useShelterStore'
import type { BoxFace } from '../../types/shelter'
import type { SurveyRuntime } from './runtime'

const faces: [BoxFace, number][] = [
  ['west', 0],
  ['east', 0],
  ['bottom', 1],
  ['top', 1],
  ['north', 2],
  ['south', 2],
]
export function SectionBoxTool({ rt }: { rt: SurveyRuntime }) {
  const active = useShelterStore((s) => s.cameraState === 'sectionBox' && !s.routeOverview)
  const box = useShelterStore((s) => s.box),
    get = useThree((s) => s.get)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  const { west, east, bottom, top, north, south } = box
  const centre = new Vector3((west + east) / 2, (top + bottom) / 2, (north + south) / 2)
  const edges = useMemo(() => {
    const pts: number[] = []
    for (const y of [bottom, top]) for (const x of [west, east]) pts.push(x, y, north, x, y, south)
    for (const y of [bottom, top]) for (const z of [north, south]) pts.push(west, y, z, east, y, z)
    for (const x of [west, east]) for (const z of [north, south]) pts.push(x, bottom, z, x, top, z)
    return new Float32Array(pts)
  }, [west, east, bottom, top, north, south])
  function drag(e: ThreeEvent<PointerEvent>, face: BoxFace, axis: number, position: Vector3) {
    if (!active) return
    e.stopPropagation()
    cleanup.current?.()
    rt.controls?.stop()
    if (rt.controls) rt.controls.enabled = false
    const { camera, size } = get(),
      a = position.clone().project(camera),
      b = position.clone()
    b.setComponent(axis, b.getComponent(axis) + 1).project(camera)
    const dx = ((b.x - a.x) * size.width) / 2,
      dy = ((a.y - b.y) * size.height) / 2,
      len = dx * dx + dy * dy
    const start = box[face],
      sx = e.clientX,
      sy = e.clientY
    const move = (p: PointerEvent) =>
      useShelterStore
        .getState()
        .setBoxFace(face, start + ((p.clientX - sx) * dx + (p.clientY - sy) * dy) / Math.max(0.01, len))
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      if (rt.controls) rt.controls.enabled = true
      cleanup.current = null
    }
    cleanup.current = end
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  return (
    <group visible={active}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[edges, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#9a5448" depthTest={false} />
      </lineSegments>
      {faces.map(([face, axis]) => {
        const p = centre.clone().setComponent(axis, box[face])
        return (
          <mesh key={face} position={p} renderOrder={10} onPointerDown={(e) => drag(e, face, axis, p)}>
            <octahedronGeometry args={[0.68]} />
            <meshBasicMaterial color="#bc4234" depthTest={false} />
          </mesh>
        )
      })}
    </group>
  )
}
