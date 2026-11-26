import { useLayoutEffect, useMemo } from 'react'
import {
  Color,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { CORRIDOR, FLOORS, UNDERGROUND } from '../data/floors'
import { footprint, shaftPlans } from '../geometry/coords'
import type { Point3, ShaftId } from '../types/shelter'
import { useShelterStore } from '../store/useShelterStore'
import type { SystemId } from '../store/useShelterStore'

const paths: [SystemId, ShaftId, number, string][] = [
  ['power', 'electrical', -0.52, '#F08A35'],
  ['data', 'electrical', 0.52, '#3FB6C9'],
  ['water', 'wet', -0.44, '#5BA6E3'],
  ['water', 'wet', 0.06, '#A487D0'],
  ['air', 'wet', 0.38, '#4CB886'],
  ['freight', 'freight', 0, '#E2BF3C'],
]
function traces() {
  const route = footprint(CORRIDOR)
  return paths.map(([id, shaft, offset, color]) => {
    const s = shaftPlans.find((v) => v.id === shaft)!,
      segments: [Point3, Point3][] = []
    const line = (a: Point3, b: Point3) => segments.push([a, b])
    const x = s.x + offset,
      z = s.z + offset * 0.25
    for (const side of id === 'air' ? [-0.09, 0.09] : [0]) {
      line([x + side, FLOORS.B4.elevation + 0.18, z], [x + side, FLOORS.L1.elevation, z])
      for (const [j, floor] of UNDERGROUND.entries()) {
        const y = FLOORS[floor].elevation + (id === 'freight' ? 2.85 : 3.26) + side
        const end = id === 'water' || id === 'air' ? route.x0 + 0.5 : route.x1 - 0.5
        line([x + side, y, z], [x + side, y, route.z + offset])
        line([x + side, y, route.z + offset], [end, y, route.z + offset])
        if (id === 'water')
          for (let tick = route.x0 + 1; tick < x; tick += 3)
            line([tick, y - 0.13, route.z + offset], [tick, y + 0.13, route.z + offset])
        if (id === 'freight') line([route.x0 + 0.3, y, route.z], [x, y, route.z])
        if (id === 'data') line([end, y, route.z + offset], [end, y, -4 - j * 0.1])
      }
    }
    const matrices: Matrix4[] = [],
      up = new Vector3(0, 1, 0)
    const dash = id === 'data' ? 0.38 : id === 'freight' ? 1.1 : color === '#A487D0' ? 1.7 : Infinity
    for (const [a, b] of segments) {
      const start = new Vector3(...a),
        dir = new Vector3(...b).sub(start),
        length = dir.length()
      if (length < 0.001) continue
      dir.normalize()
      const turn = new Quaternion().setFromUnitVectors(up, dir)
      for (let at = 0; at < length; at += dash + 0.23) {
        const span = Math.min(dash, length - at),
          mid = start.clone().addScaledVector(dir, at + span / 2)
        matrices.push(new Matrix4().compose(mid, turn, new Vector3(1, span, 1)))
      }
    }
    const radius = id === 'freight' ? 0.08 : 0.058
    const g = new CylinderGeometry(radius, radius, 1, 6),
      m = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(3.7) })
    const lines = new InstancedMesh(g, m, matrices.length)
    matrices.forEach((matrix, i) => lines.setMatrixAt(i, matrix))
    lines.computeBoundingSphere()
    lines.userData.emits = true
    return { id, lines }
  })
}
export function CoreTraces() {
  const layers = useShelterStore((s) => s.layers)
  const lines = useMemo(traces, [])
  useLayoutEffect(
    () => () =>
      lines.forEach(({ lines: l }) => {
        l.dispose()
        l.geometry.dispose()
        l.material.dispose()
      }),
    [lines],
  )
  return (
    <>
      {lines.map(({ id, lines }) => (
        <primitive key={lines.uuid} object={lines} visible={layers[id]} />
      ))}
    </>
  )
}
