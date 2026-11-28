import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Object3D } from 'three'
import { roomsOn } from '../../data/defaultBlueprint'
import { FLOORS } from '../../data/floors'
import { siteFacilities, facilityAnchor, galleryChainage } from '../../data/siteFacilities'
import { footprint } from '../../geometry/coords'
import { doors, nearSurfaceOpening } from '../../geometry/doors'
import { pathLength, pointAlong, type TerrainAtlas } from '../../geometry/siteElevations'
import { lockdownElapsed, useOperationsStore } from '../../store/useOperationsStore'
import { useShelterStore } from '../../store/useShelterStore'
import { pbrMaterial, type Finish } from '../materials/pbrLibrary'
import { closureProgress } from '../../data/lockdown'

const upper = footprint(FLOORS.L2.bounds)
const roomPlan = (id: string, floor: 'L1' | 'L2') =>
  footprint(roomsOn(floor).find((room) => room.id === id)!.bounds)
const garden = roomPlan('l2_greenhouse', 'L2')
const observatory = roomPlan('l2_observatory', 'L2')
const lobby = roomPlan('l1_lobby', 'L1')
const entry = doors.find((door) => door.id === 'entry')!
const roof = FLOORS.L2.elevation + FLOORS.L2.pitch

type Pose = { posts: number; gate: number; entry: number; slats: number; roof: number }
type Joint = (part: Object3D, pose: Pose) => void
interface Member {
  finish: Finish
  color: string
  width: number
  height: number
  depth: number
  move: Joint
}
function movingParts(atlas: TerrainAtlas) {
  const members: Member[] = []
  function add(finish: Finish, color: string, w: number, h: number, d: number, move: Joint) {
    members.push({ finish, color, width: w, height: h, depth: d, move })
  }
  function roadFrame(distance: number) {
    const [x, y, z] = pointAlong(atlas.road, distance)
    const next = pointAlong(atlas.road, distance + 1)
    const yaw = Math.atan2(next[0] - x, next[2] - z)
    return { x, y, z, yaw }
  }
  const gate = roadFrame(galleryChainage)
  const entrance = roadFrame(pathLength(atlas.road) - 6)
  for (const offset of [-2.1, -0.7, 0.7, 2.1])
    add('steel', '#d3ae72', 0.29, 0.96, 0.29, (o, p) => {
      o.position.set(
        entrance.x + offset * Math.cos(entrance.yaw),
        entrance.y - 0.38 + 0.96 * p.posts,
        entrance.z - offset * Math.sin(entrance.yaw),
      )
      o.rotation.y = entrance.yaw
    })
  // Stacked leaves telescope from the existing header, staying inside the gallery roof.
  for (let i = 0; i < 10; i++)
    add('steel', i % 2 ? '#747e7c' : '#697572', 6.8, 0.392, 0.1, (o, p) => {
      o.position.set(
        gate.x + Math.sin(gate.yaw) * (0.25 - i * 0.02),
        gate.y + 4.13 - (0.18 + i * 0.39) * p.gate,
        gate.z + Math.cos(gate.yaw) * (0.25 - i * 0.02),
      )
      o.rotation.y = gate.yaw
    })

  for (const side of [-1, 1]) {
    // The entrance leaves park on either side of the door behind the public glazing.
    add('steel', '#677477', entry.width / 2 - 0.012, entry.height - 0.04, 0.14, (o, p) => {
      o.position.set(
        entry.base[0] + side * entry.width * (0.75 - 0.5 * p.entry),
        entry.height / 2,
        entry.base[2] - 0.58,
      )
    })
  }
  // L2 Observatory south recessed panoramic bay: 6 armored larch slats park compactly at the head when open and close flush.
  const obsSouthW = 11.3,
    obsSouthX = -4.85
  for (let i = 0; i < 6; i++) {
    add('wood', i % 3 ? '#aa8966' : '#ad9171', obsSouthW, 0.075, 0.365, (o, p) => {
      const openY = FLOORS.L2.elevation + 2.86 + i * 0.052
      const closedY = FLOORS.L2.elevation + 1.13 + i * 0.365
      o.position.set(obsSouthX, openY + (closedY - openY) * p.slats, upper.z1 - 0.08)
      o.rotation.x = p.slats * (Math.PI / 2)
    })
  }
  // L2 Observatory west recessed bay (z = -5.6..3.4): 18 vertical armored larch slats rotate flush closed.
  for (let i = 0; i < 18; i++) {
    add('wood', i % 3 ? '#aa8966' : '#a18464', 0.49, 2.02, 0.085, (o, p) => {
      o.position.set(upper.x0 + 0.08, FLOORS.L2.elevation + 2.08, -5.35 + i * 0.5)
      o.rotation.y = p.slats * (Math.PI / 2)
    })
  }
  // L1 Lobby south glazing (x = 4.95..13.05): 4 armored larch-clad thermal shutter panels descend from the header in cold/lockdown.
  for (let i = 0; i < 4; i++) {
    const xc = 4.95 + (i + 0.5) * (8.1 / 4)
    add('wood', i % 2 ? '#ae916e' : '#a38566', 8.1 / 4 - 0.06, 2.6, 0.08, (o, p) => {
      const drop = p.slats
      o.position.set(xc, 3.13 - 1.3 * drop, lobby.z1 - 0.08)
      o.scale.y = Math.max(0.02, 2.6 * drop)
    })
  }
  // L1 Garage west clerestory armor drop-shutters (5 recessed slots at x = -16, y = 2.45..3.20).
  const slotSpan = 13.2 / 5
  for (let i = 0; i < 5; i++) {
    const zc = -7.6 + (i + 0.5) * slotSpan
    add('steel', '#5a6668', 0.075, 0.74, slotSpan - 0.72, (o, p) => {
      const drop = Math.max(p.slats, p.roof)
      o.position.set(-16 + 0.11, 3.2 - 0.375 * drop, zc)
      o.scale.y = Math.max(0.02, 0.74 * drop)
    })
  }
  // L2 Greenhouse south & east vertical thermal storm armor (descends from eave box over glazing in cold/lockdown).
  for (let i = 0; i < 4; i++) {
    const xc = 2 + (i + 0.5) * (8.8 / 4)
    add('steel', i % 2 ? '#a2aaa6' : '#96a09d', 8.8 / 4 - 0.06, 2.4, 0.065, (o, p) => {
      o.position.set(xc, FLOORS.L2.elevation + 3.47 - 1.2 * p.roof, upper.z1 - 0.04)
      o.scale.y = Math.max(0.02, 2.4 * p.roof)
    })
  }
  for (let i = 0; i < 6; i++) {
    const zc = -8.4 + (i + 0.5) * (13.2 / 6)
    add('steel', i % 2 ? '#a2aaa6' : '#96a09d', 0.065, 2.4, 13.2 / 6 - 0.06, (o, p) => {
      o.position.set(upper.x1 - 0.04, FLOORS.L2.elevation + 3.47 - 1.2 * p.roof, zc)
      o.scale.y = Math.max(0.02, 2.4 * p.roof)
    })
  }

  const span = garden.w / 2
  const rise = FLOORS.L2.pitch - FLOORS.L2.clearHeight
  for (let bay = 0; bay < 2; bay++)
    for (const side of [-1, 1]) {
      const ridge = garden.x0 + span * (bay + 0.5)
      const tilt = -side * Math.atan2(rise, span / 2)
      const length = Math.hypot(span / 2, rise)
      for (let i = 0; i < 7; i++)
        add('steel', i % 3 ? '#b4b7af' : '#a3aba7', length / 7 + 0.018, 0.045, garden.d - 0.07, (o, p) => {
          const run = length * (1 - (i + 0.5) / 7)
          o.position.set(
            ridge + side * (span / 2 - run * Math.cos(tilt) * p.roof),
            roof - rise + 0.13 + run * Math.abs(Math.sin(tilt)) * p.roof + i * 0.006,
            garden.z,
          )
          o.rotation.z = tilt
        })
    }
  for (const cx of [observatory.x - 3.85, observatory.x + 5.15]) {
    const cz = upper.z0 + 1.05
    const wing = (o: Object3D, p: Pose, dx: number, dy: number, dz: number) => {
      const tilt = 0.19 * (1 - p.roof) + 0.018 * p.roof
      o.rotation.x = tilt
      o.position.set(
        cx + dx,
        roof + 1.4 - 0.76 * p.roof + dy * Math.cos(tilt) - dz * Math.sin(tilt),
        cz + dy * Math.sin(tilt) + dz * Math.cos(tilt),
      )
    }
    add('steel', '#9ba5a4', 5.95, 0.16, 3.15, (o, p) => wing(o, p, 0, 0, 0))
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++)
        add('solar', (i + j) % 3 ? '#405c70' : '#354f64', 5.8 / 6 - 0.06, 0.045, 0.955, (o, p) =>
          wing(o, p, ((i - 2.5) * 5.8) / 6, 0.11, j - 1),
        )
    for (const dx of [-1.9, 1.9])
      add('steel', '#707d7e', 0.12, 1, 0.12, (o, p) => {
        const h = 1.01 - 0.76 * p.roof
        o.position.set(cx + dx, roof + 0.31 + h / 2, cz)
        o.scale.y = h
      })
  }
  const solar = siteFacilities.find((f) => f.kind === 'solar')!
  const [sx, sy, sz] = facilityAnchor(solar, atlas)
  for (let row = 0; row < 4; row++)
    for (let c = 0; c < 10; c++) {
      const x = sx + (c - 4.5) * 2.08,
        z = sz + (row - 1.5) * 3
      for (const seam of [false, true])
        add(
          seam ? 'steel' : 'solar',
          seam ? '#a1aaad' : '#42596a',
          seam ? 0.025 : 2.01,
          seam ? 0.02 : 0.075,
          2.03,
          (o, p) => {
            o.rotation.x = 0.32 * (1 - p.roof)
            o.position.set(x, sy + 1.35 + (seam ? 0.046 : 0), z)
          },
        )
    }
  return members
}

function buildDrive(atlas: TerrainAtlas) {
  const parts = movingParts(atlas)
  const geometry = new BoxGeometry()
  const root = new Group()
  root.name = '气象防护构件'
  root.userData.skipWalk = true
  const batches = [...new Set(parts.map((p) => p.finish))].map((finish) => {
    const rows = parts.filter((p) => p.finish === finish)
    const mesh = new InstancedMesh(geometry, pbrMaterial(finish, true), rows.length)
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    rows.forEach((p, i) => mesh.setColorAt(i, new Color(p.color)))
    root.add(mesh)
    return { mesh, rows }
  })
  const object = new Object3D()
  const update = (seconds: number, cold: boolean) => {
    const p = {
      posts: closureProgress(seconds, 0, 2.8),
      gate: closureProgress(seconds, 1.2, 5),
      entry: closureProgress(seconds, 5, 10),
      slats: Math.max(cold ? 0.92 : 0, closureProgress(seconds, 10, 15)),
      roof: Math.max(cold ? 1 : 0, closureProgress(seconds, 15, 20)),
    }
    for (const { mesh, rows } of batches) {
      rows.forEach((row, i) => {
        object.rotation.set(0, 0, 0)
        object.scale.set(row.width, row.height, row.depth)
        row.move(object, p)
        object.updateMatrix()
        mesh.setMatrixAt(i, object.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
  }
  update(0, false)
  return {
    root,
    update,
    dispose() {
      geometry.dispose()
      for (const { mesh } of batches) {
        mesh.dispose()
        mesh.material.dispose()
      }
    },
  }
}

export function StationClosures({ atlas }: { atlas: TerrainAtlas }) {
  const drive = useMemo(() => buildDrive(atlas), [atlas])
  const previous = useRef({ time: -1, cold: false })
  useLayoutEffect(() => () => drive.dispose(), [drive])
  useFrame(({ camera }) => {
    const view = useShelterStore.getState(),
      op = useOperationsStore.getState()
    const t = lockdownElapsed(op)
    const cold = view.cold || op.scenario === 'cryo'
    drive.root.visible =
      view.mode === 'exterior' ||
      (view.cameraState === 'walkthrough' &&
        nearSurfaceOpening(camera.position.x, camera.position.y, camera.position.z))
    if (drive.root.visible && (previous.current.time !== t || previous.current.cold !== cold)) {
      drive.update(t, cold)
      previous.current = { time: t, cold }
    }
  })
  return <primitive object={drive.root} />
}
