import { ModelBuilder } from '../utils/modelBuilder'
import type { Finish } from '../materials/pbrLibrary'
import type { Point3 } from '../../types/shelter'

/** Mounts are in B2 floor-local metres. Each +Z artwork face points into its room. */
export function roomArtwork() {
  const m = new ModelBuilder()
  function framed(finish: Finish, [x, y, z]: Point3, yaw: number, width: number, height: number) {
    const nx = Math.sin(yaw),
      nz = Math.cos(yaw)
    const box = (color: string, depth: number, w: number, h: number, t: number, paint: Finish) =>
      m.box(color, [x + depth * nx, y, z + depth * nz], [w, h, t], paint, [0, yaw, 0])
    box('#765c44', 0, width + 0.081, height + 0.081, 0.024, 'oak_int')
    box('#eee8d9', 0.014, width + 0.051, height + 0.051, 0.004, 'plaster')
    box('#ffffff', 0.018, width, height, 0.004, finish)
  }
  framed('art_herbarium', [0.563, 1.76, 11.742], Math.PI, 0.46, 0.69)
  framed('art_ridge', [-6.161, 1.98, 6.03], -Math.PI / 2, 2.13, 1.42)
  framed('art_water', [-3.38, 2.09, 11.742], Math.PI, 0.51, 0.765)
  return m
}
