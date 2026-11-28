import { Vector3 } from 'three'
import { FLOORS, UNDERGROUND } from '../../data/floors'
import { useShelterStore } from '../../store/useShelterStore'
import { doors } from '../../geometry/doors'
import { stairRun } from '../../geometry/stairs'
import type { FloorId } from '../../types/shelter'
import type { CrewMember } from '../../data/crew'
import { routeKey } from './roomRoutes'
import { WALK } from './walkCollision'

type Stop = CrewMember['route'][number]
export function inspectionStop(stop: Stop) {
  const room = useShelterStore.getState().installedRooms.find(r => r.id === stop.roomId)!
  const anchor = room.cameraAnchors[stop.anchor ?? 0] ?? room.cameraAnchors[0]
  return { room, anchor, floor: room.floorId }
}

// Doors and landings come from the installed stair, including the actual turn on every half-landing.
function stairsBetween(from: FloorId, to: FloorId, hub: Vector3) {
  const points: Vector3[] = []
  const order = UNDERGROUND.map(String)
  const a = order.indexOf(from), b = order.indexOf(to)
  if (a < 0 || b < 0) return []
  const forward = a > b
  const door = doors.find(d => d.floor === from && d.zones.includes('escape'))!
  const nearHall = (id: FloorId) => new Vector3(door.base[0], FLOORS[id].elevation, hub.z)
  points.push(nearHall(from))
  for (let i = a; i !== b; i += forward ? -1 : 1) {
    const lower = UNDERGROUND[forward ? i : i + 1]
    const plates = stairRun('escape', lower)!.plates
    const steps = plates.map(p => new Vector3(
      p.centre[0], FLOORS[lower].elevation + p.centre[1] + p.size[1] / 2, p.centre[2],
    ))
    points.push(...(forward ? steps : steps.reverse()))
  }
  points.push(nearHall(to), new Vector3(hub.x, FLOORS[to].elevation, hub.z))
  return points
}

/** Join the two verified room approaches through shared circulation. Points are at foot level. */
export function inspectionPath(routes: Map<string, Vector3[]>, from: Stop | undefined, to: Stop) {
  const pathFor = (stop: Stop) => {
    const { floor, anchor } = inspectionStop(stop)
    const [x, , z] = anchor.position
    return routes.get(floor + routeKey(x, z))?.map(v => new Vector3(v.x, v.y - WALK.eye, v.z))
  }
  const next = pathFor(to)
  if (!next?.length) return
  if (!from) return next
  const back = pathFor(from)
  if (!back?.length) return
  const source = inspectionStop(from).floor, dest = inspectionStop(to).floor
  if (source === dest) {
    let shared = 0
    while (shared + 1 < Math.min(back.length, next.length) && back[shared + 1].equals(next[shared + 1])) shared++
    return [...back.slice(shared).reverse(), ...next.slice(shared + 1)]
  }
  return [...back.reverse(), ...stairsBetween(source, dest, next[0]), ...next.slice(1)]
}
