import { DoubleSide, Ray, Vector3 } from 'three'
import { roomAt } from '../../geometry/viewGeometry'
import { defaultBlueprint, roomsOn } from '../../data/defaultBlueprint'
import { BRANCH_CORRIDOR, CORRIDOR, FLOORS, SERVICE_NICHE, UNDERGROUND } from '../../data/floors'
import { footprint, shaftPlans } from '../../geometry/coords'
import { doors } from '../../geometry/doors'
import {
  bedrooms,
  eastLink,
  escapeLobby,
  quietHall,
  westVestibule,
  type PlanRect,
} from '../../geometry/residentialPlan'
import type { FloorId, RoomInstance, UndergroundId } from '../../types/shelter'
import { doorBlocks, WALK, type WalkCollision } from './walkCollision'

const freight = shaftPlans.find((s) => s.id === 'freight')!
const surveyInterval = 0.12
const clearance = surveyInterval / 2 + 0.001
export const routeKey = (x: number, z: number) => x + '/' + z

type FloorSurvey = (x: number, z: number, simplify: boolean) => Vector3[] | undefined
const floorSurveys = new WeakMap<WalkCollision, Map<FloorId, FloorSurvey>>()

const inside = (r: PlanRect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
const publicZone = 'circulation'

/** The gross quarters footprint includes shared circulation and individual private rooms.
 * Label both here so an open internal door never makes the adjoining room a shortcut. */
function circulationZones(floor: FloorId) {
  const common: PlanRect[] = [footprint(CORRIDOR), footprint(BRANCH_CORRIDOR)]
  if (floor === 'B2') common.push(westVestibule, quietHall, eastLink, escapeLobby)
  const rooms = roomsOn(floor).map((r) => ({ id: r.id, ...footprint(r.bounds) }))
  const niche = { id: 'service-niche', ...footprint(SERVICE_NICHE) }
  const zones = [...(floor === 'B2' ? bedrooms : []), ...rooms, ...shaftPlans, niche]
  return (x: number, z: number) => {
    if (common.some((r) => inside(r, x, z))) return publicZone
    return zones.find((r) => inside(r, x, z))?.id
  }
}

/** Reconnect a visitor's current feet to the precomputed predecessor tree after manual walking. */
export function routeToWalkPosition(world: WalkCollision, floor: FloorId, eye: Vector3) {
  if (Math.abs(eye.y - WALK.eye - FLOORS[floor].elevation) > WALK.step) return
  return floorSurveys.get(world)?.get(floor)?.(eye.x, eye.z, false)
}

/** Find a vertical opening below the removable ceiling. A visitor can stand under a suspended
 * trolley or track even when a vertical camera lift there would intersect it. */
export function pathToOpenCeiling(world: WalkCollision, floor: FloorId, eye: Vector3) {
  const floorY = FLOORS[floor].elevation,
    ray = new Ray(new Vector3(), new Vector3(0, 1, 0))
  const clearAbove = (p: Vector3) => {
    const height = roomAt(floor, p.x, p.z)?.clearHeightOverride ?? FLOORS[floor].clearHeight
    const distance = floorY + height - 0.1 - p.y
    if (distance <= 0) return false
    for (const x of [-0.1, 0.1])
      for (const z of [-0.1, 0.1]) {
        ray.origin.set(p.x + x, p.y, p.z + z)
        if (world.raycastFirst(ray, DoubleSide, 0, distance)) return false
      }
    return true
  }
  if (clearAbove(eye)) return []
  const route = routeToWalkPosition(world, floor, eye)
  if (!route) return
  const approach: Vector3[] = []
  for (let i = route.length - 1; i > 0; i--) {
    const a = route[i],
      b = route[i - 1],
      distance = a.distanceTo(b)
    const steps = Math.ceil(distance / 0.25),
      sample = new Vector3()
    for (let j = 1; j <= steps; j++) {
      sample.lerpVectors(a, b, j / steps)
      if (clearAbove(sample)) return [...approach, sample]
    }
    approach.push(b)
  }
}

/** Survey each underground floor once on the same collision BVH used by the human capsule. */
export function surveyRoomRoutes(world: WalkCollision, rooms = defaultBlueprint.rooms) {
  const routes = new Map<string, Vector3[]>()
  for (const floor of UNDERGROUND) for (const _ of surveyRoomFloor(world, rooms, floor, routes)) { /* initial survey */ }
  return routes
}

/** Re-survey only edited floors in short slices, keeping the capsule collision live throughout. */
export function* surveyRoomFloor(world: WalkCollision, rooms: RoomInstance[], floor: UndergroundId, routes: Map<string, Vector3[]>) {
    const surveys = floorSurveys.get(world) ?? new Map<FloorId, FloorSurvey>()
    floorSurveys.set(world, surveys)
    surveys.delete(floor)
    for (const key of routes.keys()) if (key.startsWith(floor)) routes.delete(key)
    const zoneAt = circulationZones(floor)
    const installedDoors = doors.filter((d) => d.floor === floor)
    const y = FLOORS[floor].elevation,
      p = footprint(FLOORS[floor].bounds),
      step = 0.4
    const nx = Math.round(p.w / step),
      nz = Math.round(p.d / step)
    const index = (x: number, z: number) =>
      Math.min(nx - 1, Math.max(0, Math.floor((x - p.x0) / step))) +
      nx * Math.min(nz - 1, Math.max(0, Math.floor((z - p.z0) / step)))
    const point = (i: number) =>
      new Vector3(p.x0 + ((i % nx) + 0.5) * step, y, p.z0 + (Math.floor(i / nx) + 0.5) * step)
    const clear = (a: Vector3, b: Vector3, allowed?: string) => {
      const steps = Math.ceil(a.distanceTo(b) / surveyInterval)
      for (let i = 0; i <= steps; i++) {
        const t = steps ? i / steps : 0
        const x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t
        if (allowed) {
          const zone = zoneAt(x, z)
          if (zone !== publicZone && zone !== allowed) return false
        }
        if (i === 0) continue
        if (!world.stands(x, y, z, clearance)) return false
        if (installedDoors.some((d) => doorBlocks(d, x, z, 1, WALK.radius + clearance))) return false
      }
      return true
    }
    const start = index(freight.x, -1),
      parent = new Int16Array(nx * nz).fill(-1)
    const zones = Array.from({ length: parent.length }, (_, i) => {
      const p = point(i)
      return zoneAt(p.x, p.z)
    })
    parent[start] = start
    const queue = [start]
    for (let j = 0; j < queue.length; j++) {
      if ((j & 31) === 0) yield
      const id = queue[j],
        col = id % nx
      const from = point(id)
      for (const next of [col ? id - 1 : -1, col < nx - 1 ? id + 1 : -1, id - nx, id + nx]) {
        if (next < 0 || next >= parent.length || parent[next] !== -1) continue
        // Once a path leaves public circulation it can only advance inside its destination.
        if (!zones[next] || (zones[id] !== publicZone && zones[next] !== zones[id])) continue
        const v = point(next)
        if (!world.stands(v.x, y, v.z, clearance)) parent[next] = -2
        else if (clear(from, v)) {
          parent[next] = id
          queue.push(next)
        }
      }
    }
    const survey: FloorSurvey = (x, z, simplify) => {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return
      const targetZone = zoneAt(x, z)
      if (!targetZone) return
      const end = new Vector3(x, y, z),
        cell = index(x, z)
      let k = cell
      if (parent[k] < 0 || !clear(point(k), end, targetZone)) {
        // Check only the local 5 × 5 cells when the closest cell is across a partition.
        let nearest = 1
        k = -1
        for (let iz = -2; iz <= 2; iz++)
          for (let ix = -2; ix <= 2; ix++) {
            const col = (cell % nx) + ix,
              i = cell + nx * iz + ix
            if (col < 0 || col >= nx || i < 0 || i >= parent.length || parent[i] < 0) continue
            const candidate = point(i),
              distance = candidate.distanceToSquared(end)
            if (distance < nearest && clear(candidate, end, targetZone)) {
              k = i
              nearest = distance
            }
          }
      }
      if (k < 0) return
      // Consecutive collinear edges have already been checked on the BVH. Returning from a
      // mid-walk position needs only these turns and a few local BVH checks on the transition frame.
      const reversed = [end]
      let lastDirection = 0
      while (k !== start) {
        const next = parent[k],
          direction = next - k
        if (direction !== lastDirection) reversed.push(point(k))
        lastDirection = direction
        k = next
      }
      const route = [new Vector3(freight.x, y, -1), point(start), ...reversed.reverse()]
      const corners = [route[0]]
      for (let i = 0; i < route.length - 1; ) {
        let j = simplify ? route.length - 1 : i + 1
        while (j > i + 1 && !clear(route[i], route[j], targetZone)) j--
        if (route[j].distanceToSquared(corners[corners.length - 1]) > 1e-6) corners.push(route[j])
        i = j
      }
      for (const corner of corners) corner.y += WALK.eye
      return corners
    }
    surveys.set(floor, survey)
    for (const room of rooms.filter(r => r.floorId === floor))
      for (const anchor of room.cameraAnchors) {
        yield
        const [x, , z] = anchor.position,
          path = survey(x, z, true)
        if (path) routes.set(floor + routeKey(x, z), path)
      }
}
