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
  function etching(finish: 'art_spurs' | 'art_fold', x: number, z: number, yaw: number) {
    const width = .914, height = 1.20, rail = .019
    const normal = Math.sin(yaw)
    // These frames are on east/west walls. Butt joints leave clear reveals around the warm paper.
    m.box('#fffdf5', [x + normal * .018, 1.78, z], [width, height, .012], finish, [0, yaw, 0])
    for (const side of [-1, 1]) {
      m.box('#443626', [x + normal * .016, 1.78 + side * (height + rail) / 2, z],
        [width + rail * 2, rail, .044], 'oak_int', [0, yaw, 0])
      m.box('#443626', [x + normal * .016, 1.78, z + side * (width + rail) / 2],
        [rail, height, .044], 'oak_int', [0, yaw, 0])
    }
  }
  etching('art_spurs', -15.692, 8.47, Math.PI / 2)
  etching('art_fold', -6.209, 8.98, -Math.PI / 2)
  framed('art_water', [-3.38, 2.09, 11.742], Math.PI, 0.51, 0.765)
  return m
}
