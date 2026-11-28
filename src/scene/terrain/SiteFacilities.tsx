import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { nearSurfaceOpening } from '../../geometry/doors'
import {
  adits,
  eastTransfer,
  facilityAnchor,
  galleryChainage,
  refuge,
  refugeJunction,
  siteFacilities,
} from '../../data/siteFacilities'
import type { Adit } from '../../data/siteFacilities'
import { boreSections } from '../../geometry/sectionVoids'
import { freightCable } from '../../geometry/freightCable'
import { groundAt, pathLength, pointAlong } from '../../geometry/siteElevations'
import type { TerrainAtlas } from '../../geometry/siteElevations'
import type { Point3 } from '../../types/shelter'
import { useShelterStore } from '../../store/useShelterStore'
import { Model } from '../utils/Model'
import { ModelBuilder } from '../utils/modelBuilder'

const cement = '#b6b1a4',
  steel = '#525c5c',
  timber = '#9d7958',
  rust = '#82543a'
type Post = (dx: number, dy: number, dz: number) => Point3
function frame(x: number, y: number, z: number, angle = 0): Post {
  const c = Math.cos(angle),
    s = Math.sin(angle)
  return (u, h, v) => [x + u * c + v * s, y + h, z - u * s + v * c]
}

function drive(atlas: TerrainAtlas, m: ModelBuilder) {
  const route = atlas.road,
    total = pathLength(route)
  function edge(distance: number) {
    const a = pointAlong(route, distance),
      p = pointAlong(route, Math.max(0, distance - 0.25)),
      q = pointAlong(route, distance + 0.25)
    const az = Math.atan2(q[0] - p[0], q[2] - p[2])
    const at = frame(a[0], a[1] + 0.09, a[2], az)
    const bay = distance > total * 0.46 && distance < total * 0.48 ? 2 : 0
    return { at, left: at(-2.9, 0, 0), right: at(2.9 + bay, 0, 0) }
  }
  const count = Math.ceil(total / 2)
  let a = edge(0)
  for (let i = 1; i <= count; i++) {
    const b = edge((i / count) * total)
    m.quad(a.left, b.left, b.right, a.right, '#757672')
    m.quad(a.at(-3.8, -0.12, 0), b.at(-3.8, -0.12, 0), b.left, a.left, '#97948a')
    m.quad(a.at(-3.8, -0.12, 0), a.at(-3.8, -0.44, 0), b.at(-3.8, -0.44, 0), b.at(-3.8, -0.12, 0), '#827f75')
    m.quad(
      a.right,
      b.right,
      [b.right[0], b.right[1] - 0.85, b.right[2]],
      [a.right[0], a.right[1] - 0.85, a.right[2]],
      '#918b80',
    )
    if (i % 5 < 3) m.beam(a.at(0, 0.02, 0), b.at(0, 0.02, 0), 0.09, 0.015, '#d9d5bd')
    if ((i * total) / count > 25) {
      for (const [lo, hi] of [
        [0.54, 0.62],
        [0.62, 0.7],
        [0.7, 0.78],
        [0.78, 0.86],
      ]) {
        const lower = lo === 0.62 || lo === 0.78 ? 3.15 : 3.24,
          upper = hi === 0.62 || hi === 0.78 ? 3.15 : 3.24
        m.quad(a.at(lower, lo, 0), b.at(lower, lo, 0), b.at(upper, hi, 0), a.at(upper, hi, 0), '#a3a8a4')
      }
      if (i % 2 === 0) m.box(steel, b.at(3.25, 0.32, 0), [0.09, 0.72, 0.09], 'steel')
    }
    if ((i * total) / count > 31 && (i * total) / count < 65) {
      for (const [dx, h] of [
        [-3.7, 1.7],
        [-4.45, 2.7],
      ]) {
        const face = dx + 0.365
        m.quad(a.at(face, 0, 0), a.at(face, h, 0), b.at(face, h, 0), b.at(face, 0, 0), '#8e9086')
        m.quad(a.at(dx - 0.365, h, 0), b.at(dx - 0.365, h, 0), b.at(face, h, 0), a.at(face, h, 0), '#a1a193')
        for (let lift = 0.25; lift < h; lift += 0.35)
          m.line(a.at(face + 0.01, lift, 0), b.at(face + 0.01, lift, 0), '#666a60')
        for (let dz = 0; dz < 1.9; dz += 0.36)
          m.line(a.at(face + 0.01, 0, dz), a.at(face + 0.01, h, dz), '#666a60')
        if (i % 2 === 0) m.box(steel, b.at(dx + 0.38, h * 0.55, 0), [0.15, 0.15, 0.08], 'steel')
      }
    }
    a = b
  }
}
function avalanche(atlas: TerrainAtlas, m: ModelBuilder) {
  const path = atlas.road
  for (let i = -8; i <= 8; i += 2) {
    const a = pointAlong(path, galleryChainage + i),
      b = pointAlong(path, galleryChainage + i + 1)
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]),
      p = frame(...a, yaw)
    m.box(cement, p(-3.8, 2.3, 0), [0.42, 4.6, 2.02], 'stone', [0, yaw, 0])
    m.box(cement, p(0, 4.6, 0), [8.3, 0.46, 2.05], 'stone', [0, yaw, 0])
    m.box('#7f865d', p(0, 4.94, 0), [8.4, 0.29, 2.1], 'foliage', [0, yaw, 0])
    if (i % 4 === 0) m.box(cement, p(3.7, 2.25, 0), [0.38, 4.5, 0.54], 'stone', [0, yaw, 0])
    if (i === 0) m.box(steel, p(0, 4.17, 0), [7.2, 0.54, 0.33], 'steel', [0, yaw, 0])
  }
}
function portal(m: ModelBuilder, adit: Adit, doorsOnly: boolean) {
  const b = adit.points.at(-1)!,
    a = adit.points.at(-2)!
  const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]),
    p = frame(...b, yaw)
  const w = adit.width,
    h = adit.height
  if (doorsOnly) {
    m.box(rust, p(0, h * 0.48, -0.32), [w - 0.08, h * 0.96, 0.14], 'corten', [0, yaw, 0])
    if (adit.id === 'east')
      for (let u = -1; u <= 1; u += 0.22)
        m.box(steel, p(u, h / 2, -0.1), [0.045, h - 0.12, 0.06], 'steel', [0, yaw, 0])
    return
  }
  for (const side of [-1, 1]) {
    m.box(cement, p(side * (w / 2 + 0.29), h / 2, 0), [0.58, h, 0.95], 'stone', [0, yaw, 0])
    m.box(cement, p(side * (w / 2 + 2.35), 1.32, -0.21), [4.1, 2.64, 0.76], 'stone', [0, yaw, 0])
    for (let j = 0; j < 4; j++)
      m.box(steel, p(side * (w / 2 + 0.91 + j * 0.87), 0.38, 0.19), [0.12, 0.12, 0.07], 'steel', [0, yaw, 0])
  }
  m.box(cement, p(0, h + 0.19, 0), [w + 1.24, 0.38, 1.15], 'stone', [0, yaw, 0])
  if (adit.id === 'east') {
    m.part('round', 'steel', '#c3c8be', p(2.8, 0.85, 1), [0.2, 1.7, 0.2])
  }
}
function bore(m: ModelBuilder, adit: Adit) {
  const sections = boreSections(adit)
  const { width: w, height: h } = adit
  for (let i = 1; i < adit.points.length; i++) {
    const a = adit.points[i - 1],
      b = adit.points[i],
      d = Math.hypot(b[0] - a[0], b[2] - a[2])
    const yaw = Math.atan2(b[0] - a[0], b[2] - a[2])
    const p = (u: number, y: number, v: number): Point3 => {
      const start = sections[i - 1](u, y),
        end = sections[i](u, y),
        t = v / d
      return [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
        start[2] + (end[2] - start[2]) * t,
      ]
    }
    m.quad(p(-w / 2, 0, 0), p(-w / 2, 0, d), p(w / 2, 0, d), p(w / 2, 0, 0), '#999e98')
    for (const side of [-1, 1]) {
      const u = side * (w / 2 + 0.09)
      const spans =
        adit.id === 'east' && side === 1
          ? [
              [0, d / 2 - 1.15],
              [d / 2 + 1.15, d],
            ]
          : [[0, d]]
      for (const [lo, hi] of spans) m.quad(p(u, 0, lo), p(u, h, lo), p(u, h, hi), p(u, 0, hi), '#8c918c')
      m.beam(p(side * 0.74, 0.034, 0), p(side * 0.74, 0.034, d), 0.055, 0.05, '#58666a')
    }
    for (let station = 0; station < d; station += 4) {
      for (const side of [-1, 1])
        m.box(cement, p((side * w) / 2, h / 2, station), [0.14, h, 0.19], 'stone', [0, yaw, 0])
      m.box(cement, p(0, h, station), [w + 0.3, 0.18, 0.2], 'stone', [0, yaw, 0])
      if (station % 12 === 0)
        m.box('#e4d9b0', p(0, h - 0.14, station), [0.6, 0.08, 0.15], 'lamp', [0, yaw, 0])
    }
    // The clipped roof strip keeps the inspection side open in the X-ray drawing.
    m.quad(p(-w / 2, h, 0), p(-w / 2, h, d), p(0, h, d), p(0, h, 0), '#a6aaa1')
  }
  return m
}
export function eastBore() {
  const m = bore(new ModelBuilder('shotcrete'), adits.east),
    [x, y, z] = refuge
  m.box('#a7aea3', [x, y - 0.08, z], [7, 0.16, 5])
  m.box(cement, [x, y + 1.4, z - 2.42], [7, 2.8, 0.16])
  for (const k of [-1, 1]) m.box(cement, [x + k * 3.44, y + 1.4, z], [0.12, 2.8, 5])
  m.box('#b9c5ad', [x - 1.7, y + 0.45, z - 0.47], [2.1, 0.16, 0.82], 'wood')
  m.box(steel, [x + 1.7, y + 0.7, z - 1], [0.8, 1.4, 0.45], 'steel')
  for (const dx of [-0.3, 0.3])
    m.part('round', 'steel', '#8ba9ad', [x + 2.1 + dx, y + 0.8, z + 0.1], [0.34, 1.5, 0.34])
  m.part('round', 'steel', '#72979e', [x - 2.5, y + 0.58, z - 1.4], [0.72, 1.15, 0.72])
  m.box('#dcd9b2', [x, y + 2.48, z - 2.3], [1.2, 0.13, 0.18], 'lamp')
  for (const s of [-1, 1]) {
    m.box(cement, [x + s * 1.18, y + 1.36, (z + refugeJunction[2]) / 2], [0.15, 2.72, 2.4])
    m.box(steel, [x + s * 1.1, y + 1.33, z + 1.82], [0.12, 2.65, 0.14], 'steel')
  }
  for (let i = 1; i < eastTransfer.length; i++) {
    const a = eastTransfer[i - 1],
      b = eastTransfer[i]
    m.beam([a[0], a[1] + 0.025, a[2]], [b[0], b[1] + 0.025, b[2]], 0.07, 0.07, '#abc1ad')
  }
  return m
}
const westBore = () => bore(new ModelBuilder('shotcrete'), adits.west)

function landscape(atlas: TerrainAtlas) {
  const m = new ModelBuilder()
  for (const f of siteFacilities) {
    const [x, y, z] = facilityAnchor(f, atlas),
      p = frame(x, y, z)
    const hut = (w: number, d: number, h: number) => {
      m.box(cement, p(0, h / 2, 0), [w, h, d])
      m.box(steel, p(0, h + 0.14, 0), [w + 0.54, 0.28, d + 0.55], 'steel')
      m.box('#708d91', p(-w * 0.17, h * 0.58, d / 2 + 0.025), [w * 0.38, h * 0.34, 0.08], 'glass')
    }
    switch (f.kind) {
      case 'station':
      case 'eastBore':
      case 'refuge':
        break // Separate building and below-grade assemblies.
      case 'road':
        drive(atlas, m)
        break
      case 'gallery':
        avalanche(atlas, m)
        break
      case 'westPortal':
        portal(m, adits.west, false)
        break
      case 'eastPortal':
        portal(m, adits.east, false)
        break
      case 'gate': {
        const g = frame(x + 5, y, z)
        m.box(timber, g(0, 1.45, 0), [3.4, 2.9, 2.6], 'wood')
        m.box(steel, g(0, 3, 0), [4, 0.24, 3.3], 'steel')
        m.box('#849b9c', g(0, 1.72, 1.31), [2, 0.83, 0.06], 'glass')
        m.box('#ba6443', p(2.7, 0.67, 0), [0.35, 1.34, 0.38], 'steel')
        m.beam(p(2.7, 1.18, 0), p(-2.6, 1.18, 0), 0.12, 0.1, '#e0dfd3')
        break
      }
      case 'westIntake':
      case 'eastIntake':
        m.box(cement, p(0, 0.55, 0), [1.6, 1.1, 1.5])
        for (let j = 0; j < 6; j++) m.box('#919a97', p(0, 1.19 + j * 0.12, 0), [1.51, 0.065, 1.41], 'steel')
        m.box(steel, p(0, 1.99, 0), [1.75, 0.16, 1.65], 'steel')
        if (f.kind === 'eastIntake') m.beam(p(0, 2, 0), p(0, 3.8, 0), 0.07, 0.07, steel)
        break
      case 'exhaust':
        hut(3.6, 2.8, 2.6)
        m.part('round', 'steel', steel, p(-0.9, 3.4, 0), [0.64, 2.7, 0.64])
        break
      case 'spring':
        hut(3.8, 3.5, 2.6)
        m.box(cement, p(0, 0.35, 3), [5.3, 0.7, 0.32])
        m.box('#749296', p(0, 0.08, 2.45), [3.9, 0.16, 1.1])
        break
      case 'drain':
        for (const side of [-1, 1]) m.box(cement, p(side * 1.1, 0.75, 0), [0.38, 1.5, 2.1])
        m.box(cement, p(0, 1.6, 0), [2.65, 0.34, 2.3])
        for (let i = 0; i < 15; i++)
          m.part(
            'rock',
            'stone',
            '#8c8c7f',
            p(Math.sin(i * 4) * 2, 0.12, 1.25 + i * 0.18),
            [0.94, 0.53, 0.77],
            [0.2, i, 0.1],
          )
        break
      case 'solar':
        for (let row = 0; row < 4; row++)
          for (let c = 0; c < 10; c++) {
            const u = (c - 4.5) * 2.08,
              v = (row - 1.5) * 3
            m.box(steel, p(u, 0.64, v), [0.12, 1.28, 0.12], 'steel')
          }
        break
      case 'helipad':
        m.part('round', 'stone', '#868983', p(0, 0.07, 0), [21, 0.14, 21])
        for (const dx of [-1.8, 1.8]) m.box('#edeee2', p(dx, 0.155, 0), [0.77, 0.025, 6])
        m.box('#edeee2', p(0, 0.155, 0), [3.7, 0.025, 0.75])
        for (let i = 0; i < 40; i++) {
          const a = (i * Math.PI) / 20,
            b = ((i + 1) * Math.PI) / 20
          m.beam(
            p(8.6 * Math.sin(a), 0.17, 8.6 * Math.cos(a)),
            p(8.6 * Math.sin(b), 0.17, 8.6 * Math.cos(b)),
            0.22,
            0.035,
            '#d9ddd4',
          )
        }
        m.box(steel, p(10, 2, 8), [0.09, 4, 0.09], 'steel')
        m.beam(p(10, 4, 8), p(11.7, 3.65, 8), 0.36, 0.32, '#d37546')
        break
      case 'cable': {
        const { tops, spans } = freightCable(atlas)
        for (const [u, top, v] of tops) {
          const h = groundAt(atlas, u, v).height
          for (const dx of [-1.6, 1.6]) m.beam([u + dx, h, v], [u + dx * 0.58, top, v], 0.18, 0.19, steel)
          m.beam([u - 1.5, h + 1, v], [u + 0.95, top - 0.65, v], 0.14, 0.13, steel)
          m.box(steel, [u, top - 0.12, v], [2.15, 0.25, 0.32], 'steel')
        }
        for (const [i, points] of spans.entries()) {
          for (let j = 1; j < points.length; j++) m.line(points[j - 1], points[j], steel)
          if (i === 0 || i === 6) {
            const [u, top, v] = points[Math.floor(points.length / 2)]
            m.box(steel, [u, top - 0.27, v], [0.08, 0.55, 0.09], 'steel')
            m.box(rust, [u, top - 1.24, v], [1.5, 1.44, 1.9], 'steel')
          }
        }
        break
      }
      case 'relay':
        hut(1.4, 1.1, 1.7)
        m.beam(p(0, 0, 0), p(0, 7, 0), 0.14, 0.14, steel)
        m.part('round', 'steel', '#d3d1c5', p(0.28, 5.4, 0), [1.2, 0.18, 1.2], [0, 0, 1.3])
        break
      case 'sensors':
        for (const [u, v] of f.points) {
          const h = groundAt(atlas, u, v).height
          m.box('#888d79', [u, h + 0.26, v], [0.64, 0.52, 0.61])
          m.box(steel, [u + 0.21, h + 0.9, v], [0.035, 0.89, 0.035], 'steel')
        }
        break
      case 'pond':
        m.part('round', 'glass', '#557e81', [x, 0.25, z], [14, 0.2, 8.4])
        for (let i = 0; i < 36; i++) {
          const a = (i * 2 * Math.PI) / 36,
            u = x + 7.24 * Math.cos(a),
            v = z + 4.4 * Math.sin(a)
          m.part(
            'rock',
            'stone',
            '#989b89',
            [u, groundAt(atlas, u, v).height + 0.13, v],
            [1.5, 0.58, 1.13],
            [0.1, i, 0.18],
          )
        }
        break
    }
  }
  return m
}
function portalDoors() {
  const m = new ModelBuilder()
  for (const adit of Object.values(adits)) portal(m, adit, true)
  return m
}
export function SiteFacilities({ atlas }: { atlas: TerrainAtlas }) {
  const mode = useShelterStore((s) => s.mode),
    floor = useShelterStore((s) => s.floor)
  const walk = useShelterStore((s) => s.cameraState === 'walkthrough'),
    mount = useRef<Group>(null)
  const build = useMemo(() => () => landscape(atlas), [atlas])
  useFrame(({ camera }) => {
    if (mount.current)
      mount.current.visible =
        !walk || nearSurfaceOpening(camera.position.x, camera.position.y, camera.position.z)
  })
  return (
    <group ref={mount}>
      <group visible={!walk && mode === 'exterior' && floor === 'ALL'}>
        <Model build={portalDoors} />
      </group>
      <Model
        build={build}
        opacity={walk ? 1 : floor === 'ALL' ? (mode === 'exterior' ? 1 : mode === 'xray' ? 0.12 : 0) : 0}
      />
    </group>
  )
}
function tunnelSoffits() {
  const m = new ModelBuilder('shotcrete')
  for (const bore of Object.values(adits)) {
    const frames = boreSections(bore),
      w = bore.width / 2,
      h = bore.height
    for (let i = 1; i < frames.length; i++)
      m.quad(frames[i - 1](0, h), frames[i - 1](w, h), frames[i](w, h), frames[i](0, h), '#a1a6a0')
    const end = bore.points.at(-1)!,
      prev = bore.points.at(-2)!,
      angle = Math.atan2(end[0] - prev[0], end[2] - prev[2])
    const p = frame(...end, angle)
    m.box(cement, p(0, -0.085, 1.4), [bore.width + 0.35, 0.17, 2.8], 'stone', [0, angle, 0])
  }
  return m
}
export function TunnelModels() {
  const walk = useShelterStore((s) => s.cameraState === 'walkthrough')
  const floor = useShelterStore((s) => s.floor)
  // Both exterior portals have closed leaves. The rock hides the bore beyond them.
  const exposed = useShelterStore((s) => s.mode !== 'exterior')
  return (
    <group name="检修与疏散平硐" visible={exposed}>
      <group visible={walk}>
        <Model build={tunnelSoffits} />
      </group>
      <Model build={westBore} opacity={Number(floor === 'B1' || floor === 'ALL')} />
      <Model build={eastBore} opacity={Number(floor === 'B2' || floor === 'ALL')} />
    </group>
  )
}
