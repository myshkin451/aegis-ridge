import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import type { MepNetwork } from '../../data/mepNetwork'
import { FLOORS } from '../../data/floors'
import type { FloorSelection, Point3 } from '../../types/shelter'
import type { Location, OperationsReport } from '../../store/useOperationsStore'
import { taggedEquipment } from '../rooms/picking'

/** Reuse one batch for visible red isolation, green takeover and the dashed freight itinerary. */
export function maintenanceOverlay(network: MepNetwork, cutLow: Vector3, cutHigh: Vector3) {
  const edges = new Map(network.edges.map((e) => [e.id, e]))
  const capacity = network.edges.reduce((sum, e) => sum + e.points.length - 1, 0) + 64
  const material = new MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false })
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, capacity)
  mesh.name = '检修回路、搬运线与设备边界'
  mesh.frustumCulled = false
  mesh.renderOrder = 15
  mesh.setColorAt(0, new Color('#e76150'))
  mesh.visible = false
  mesh.count = 0
  const up = new Vector3(0, 1, 0),
    a = new Vector3(),
    b = new Vector3(),
    mid = new Vector3(),
    direction = new Vector3(),
    size = new Vector3(),
    rotation = new Quaternion(),
    transform = new Matrix4()
  const red = new Color('#ed5642'),
    green = new Color('#43bd9a'),
    violet = new Color('#ba91ed')
  function bar(first: Vector3, second: Vector3, width: number, color: Color, lo: number, hi: number) {
    if (mesh.count >= capacity) return
    direction.subVectors(second, first)
    // Trim the centreline to the same clipping volume as the installed pipe, including
    // the active floor range for a cross-floor delivery route.
    let t0 = 0,
      t1 = 1
    for (const axis of ['x', 'y', 'z'] as const) {
      const min = axis === 'y' ? Math.max(cutLow.y, lo) : cutLow[axis]
      const max = axis === 'y' ? Math.min(cutHigh.y, hi) : cutHigh[axis]
      const start = first[axis],
        delta = direction[axis]
      if (Math.abs(delta) < 1e-6) {
        if (start < min || start > max) return
        continue
      }
      const tNear = (min - start) / delta,
        tFar = (max - start) / delta
      t0 = Math.max(t0, Math.min(tNear, tFar))
      t1 = Math.min(t1, Math.max(tNear, tFar))
      if (t1 < t0) return
    }
    const length = direction.length() * (t1 - t0)
    if (length < 0.0001) return
    mid.copy(first).addScaledVector(direction, (t0 + t1) / 2)
    rotation.setFromUnitVectors(up, direction.normalize())
    mesh.setMatrixAt(mesh.count, transform.compose(mid, rotation, size.set(width, length, width)))
    mesh.setColorAt(mesh.count++, color)
  }
  function update(result: OperationsReport['maintenance'], location: Location | null, floor: FloorSelection) {
    mesh.count = 0
    const lo = floor === 'ALL' ? -Infinity : FLOORS[floor].elevation - 0.02
    const hi = floor === 'ALL' ? Infinity : FLOORS[floor].elevation + FLOORS[floor].pitch
    const edgeWidth = floor === 'ALL' ? 0.2 : 0.115
    const routeWidth = floor === 'ALL' ? 0.2 : 0.13
    function edgePaths(ids: string[], color: Color) {
      for (const id of ids) {
        const edge = edges.get(id)
        if (!edge || (floor !== 'ALL' && edge.floor !== floor)) continue
        edge.points
          .slice(1)
          .forEach((p, i) => bar(a.set(...edge.points[i]), b.set(...p), edgeWidth, color, -Infinity, Infinity))
      }
    }
    edgePaths(result?.backupEdgeIds ?? [], green)
    const isolated = new Set(result?.isolatedEdgeIds)
    if (location?.edgeId) isolated.add(location.edgeId)
    edgePaths([...isolated], red)
    const route = result?.route ?? []
    const p0 = new Vector3(),
      p1 = new Vector3()
    for (let i = 1; i < route.length; i++) {
      a.set(...route[i - 1])
      b.set(...route[i])
      const length = a.distanceTo(b)
      for (let d = 0; d < length; d += 1.2) {
        p0.lerpVectors(a, b, d / length)
        p1.lerpVectors(a, b, Math.min(1, (d + 0.83) / length))
        bar(p0, p1, routeWidth, violet, lo, hi)
      }
    }
    function outline(tag: string | undefined, color: Color) {
      const unit = tag && taggedEquipment.get(tag)
      if (!unit || (floor !== 'ALL' && floor !== unit.room.floorId)) return
      const low = unit.box.min,
        high = unit.box.max
      const corners: Point3[] = []
      for (let i = 0; i < 8; i++)
        corners.push([i & 1 ? high.x : low.x, i & 2 ? high.y : low.y, i & 4 ? high.z : low.z])
      for (let i = 0; i < 8; i++)
        for (const mask of [1, 2, 4])
          if (!(i & mask)) bar(a.set(...corners[i]), b.set(...corners[i | mask]), 0.05, color, lo, hi)
    }
    outline(result?.backupEquipmentTag, green)
    outline(result?.id, red)
    if (location?.equipmentTag !== result?.id) outline(location?.equipmentTag, red)
    mesh.visible = mesh.count > 0
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
  }
  function dispose() {
    mesh.geometry.dispose()
    material.dispose()
    mesh.dispose()
  }
  function setNetwork(next: MepNetwork) {
    edges.clear()
    for (const edge of next.edges) edges.set(edge.id, edge)
  }
  return { mesh, update, dispose, setNetwork }
}
