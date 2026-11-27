import { BackSide, BoxGeometry, Color, Mesh, MeshBasicMaterial, PMREMGenerator, Scene } from 'three'

/** Radiance proxy for a furnished B2 room. Captured once from seated eye height. */
export function bakeRoomEnvironment(pmrem: PMREMGenerator, size: number) {
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
  try {
    const target = pmrem.fromScene(studio, 0.04, 0.1, 10, { size })
    target.texture.name = 'B2 interior PMREM'
    return target
  } finally {
    cube.dispose()
    paints.forEach((p) => p.dispose())
  }
}
