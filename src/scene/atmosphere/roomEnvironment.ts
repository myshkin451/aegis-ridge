import {
  BackSide,
  BoxGeometry,
  Color,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  RGBAFormat,
  Scene,
  type WebGLRenderTarget,
} from 'three'
import { FLOORS } from '../../data/floors'
import { footprint } from '../../geometry/coords'
import type { FloorId } from '../../types/shelter'

export const reflectionRooms = ['living', 'station', 'service', 'farm'] as const
type Room = (typeof reflectionRooms)[number]
const floorRoom: Record<FloorId, Room> = {
  L1: 'station',
  L2: 'station',
  B1: 'service',
  B2: 'living',
  B3: 'farm',
  B4: 'service',
}
const stationBounds = { L1: footprint(FLOORS.L1.bounds), L2: footprint(FLOORS.L2.bounds) }
export function reflectionRoomAt(floor: FloorId, x: number, y: number, z: number): Room | undefined {
  if (floor === 'L1' || floor === 'L2') {
    const r = stationBounds[floor]
    if (
      x < r.x0 ||
      x > r.x1 ||
      z < r.z0 ||
      z > r.z1 ||
      y < FLOORS[floor].elevation ||
      y > FLOORS[floor].elevation + FLOORS[floor].pitch
    )
      return
  } else if (y >= -6) return
  return floorRoom[floor]
}

/** CubeUV packs filtered roughness levels in one non-mipmapped RGBA16F image. */
export function reflectionBytes(target: WebGLRenderTarget) {
  const t = target.texture
  if (t.type !== HalfFloatType || t.format !== RGBAFormat || t.generateMipmaps)
    throw new Error('Unsupported indoor PMREM storage')
  return target.width * target.height * 8
}

/** Radiance proxy for each distinct building interior. Captured once from seated eye height. */
export function bakeRoomEnvironment(pmrem: PMREMGenerator, size: number, profile: Room) {
  const studio = new Scene()
  const cube = new BoxGeometry()
  const paints: MeshBasicMaterial[] = []
  function panel(
    tint: string,
    luminance: number,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    inside = false,
  ) {
    const paint = new MeshBasicMaterial({ color: new Color(tint).multiplyScalar(luminance) })
    if (inside) paint.side = BackSide
    paints.push(paint)
    const mesh = new Mesh(cube, paint)
    mesh.position.set(x, y, z)
    mesh.scale.set(w, h, d)
    studio.add(mesh)
  }
  if (profile === 'living') {
    panel('#d4c5ac', 0.48, 0, 0, 0, 6, 3.4, 5.4, true)
    panel('#926947', 0.52, 0, -1.62, 0, 5.95, 0.1, 5.35)
    panel('#bd9870', 0.66, -2.81, -0.82, 0, 0.12, 1.55, 5.2)
    panel('#fff2d8', 3.6, 0.3, 1.5, -0.4, 2.6, 0.06, 0.58)
    panel('#ffe1b2', 2.9, 2.81, 0.18, 0.7, 0.08, 0.42, 1.65)
    panel('#f5e9d8', 1.1, -1.55, 0.34, 2.55, 1.58, 0.95, 0.06)
    // The mirror looks down the washroom toward the glazed enclosure, mullions and its linear light.
    panel('#c9d4ca', 0.82, -0.78, 0.02, 2.52, 2.0, 1.8, 0.04)
    for (const x of [-1.69, -0.72, 0.2]) panel('#554e43', 0.44, x, 0.02, 2.46, 0.043, 1.85, 0.035)
    panel('#6c6356', 0.64, -0.78, 0.87, 2.46, 2.1, 0.045, 0.035)
    panel('#fff3d9', 4.1, -0.75, 0.43, 2.44, 1.28, 0.11, 0.035)
  } else {
    const station = profile === 'station',
      farm = profile === 'farm'
    panel(
      station ? '#cdc4b5' : farm ? '#d9d9d0' : '#a9acaa',
      station ? 0.63 : farm ? 0.39 : 0.43,
      0,
      0,
      0,
      6,
      3.4,
      5.4,
      true,
    )
    panel(station ? '#868079' : farm ? '#a39d91' : '#696e6a', 0.47, 0, -1.62, 0, 5.95, 0.1, 5.35)
    // Glazed observation bays have a broad luminous opening and slender mullions.
    if (station) {
      panel('#c4d6db', 1.24, 0.1, 0.35, 2.57, 5.4, 1.7, 0.05)
      for (const x of [-2.2, -0.64, 0.92, 2.48]) panel('#656660', 0.58, x, 0.36, 2.5, 0.065, 1.8, 0.06)
      panel('#ad8a63', 0.73, -2.84, -0.55, 0, 0.09, 1.8, 5.2)
    } else if (farm) {
      // Tracks and subdued foliage flank the aisle, with small pink-white grow emitters.
      for (const side of [-1, 1]) {
        panel('#8a9b75', 0.43, side * 2.72, -0.1, 0, 0.13, 2.24, 4.7)
        for (const y of [-0.55, 0.23, 1.02]) {
          panel('#8d9490', 0.62, side * 2.58, y, 0, 0.16, 0.1, 4.7)
          panel('#f1d8e2', 1.8, side * 2.55, y + 0.06, 0, 0.12, 0.035, 4.38)
        }
      }
    } else {
      panel('#838c88', 0.6, -2.72, 0.1, 0.3, 0.34, 2.45, 3.7)
      for (const z of [-1.08, 0.09, 1.26]) panel('#555e5c', 0.48, -2.48, 0.1, z, 0.12, 2.28, 0.037)
    }
    for (const x of [-1.7, 1.7])
      panel(farm ? '#ffe7f2' : '#ede9df', farm ? 1.85 : 2.65, x, 1.54, 0, 0.24, 0.05, 3.75)
  }
  try {
    const target = pmrem.fromScene(studio, 0.04, 0.1, 10, { size })
    target.texture.name = profile + ' interior PMREM'
    return target
  } finally {
    cube.dispose()
    paints.forEach((p) => p.dispose())
  }
}
