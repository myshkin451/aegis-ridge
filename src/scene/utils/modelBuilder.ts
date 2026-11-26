import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three'
import type { Material, MeshStandardMaterialParameters, Object3D } from 'three'
import type { Point3 } from '../../types/shelter'
import { firGeometry, needleMaterial } from '../terrain/firGeometry'
import { graniteMaterial } from './granite'

type Shape = 'box' | 'round' | 'cone' | 'rock' | 'bud' | 'fir' | 'distantFir'
type Finish = 'stone' | 'steel' | 'wood' | 'glass' | 'foliage' | 'needles' | 'lamp' | 'solar'
const finishes: Record<Finish, MeshStandardMaterialParameters> = {
  stone: { roughness: 0.92, metalness: 0.05 },
  steel: { roughness: 0.48, metalness: 0.49 },
  wood: { roughness: 0.83 },
  glass: { roughness: 0.12, metalness: 0.18, transparent: true, opacity: 0.28, depthWrite: false },
  needles: { roughness: 1 },
  foliage: { roughness: 1, flatShading: true },
  lamp: { roughness: 0.35, emissive: '#ffdc9a', emissiveIntensity: 0.6 },
  solar: { roughness: 0.29, metalness: 0.46 },
}
interface Stamp {
  matrix: Matrix4
  color: Color
}
interface Batch {
  shape: Shape
  finish: Finish
  stamps: Stamp[]
}
export type Tint = string | Color
export interface BuiltModel {
  object: Group
  shadowCasters: Object3D[]
  casts: boolean
  materials: { material: Material; alpha: number; depth: boolean }[]
  dispose: () => void
}

/** Each immutable subassembly owns its GPU resources. All repeated parts share instanced draws. */
export class ModelBuilder {
  constructor(private readonly faceFinish: 'plain' | 'granite' = 'plain') {}
  private batches = new Map<string, Batch>()
  private vertices: number[] = []
  private faceColors: number[] = []
  private lines: number[] = []
  private lineColors: number[] = []

  part(
    shape: Shape,
    finish: Finish,
    tint: Tint,
    centre: Point3,
    size: Point3,
    rotation?: Point3 | Quaternion,
  ) {
    const key = shape + '/' + finish
    let batch = this.batches.get(key)
    if (!batch) {
      batch = { shape, finish, stamps: [] }
      this.batches.set(key, batch)
    }
    const q =
      rotation instanceof Quaternion
        ? rotation
        : new Quaternion().setFromEuler(new Euler(...((rotation ?? [0, 0, 0]) as Point3)))
    batch.stamps.push({
      matrix: new Matrix4().compose(new Vector3(...centre), q, new Vector3(...size)),
      color: new Color(tint),
    })
  }

  box(tint: Tint, centre: Point3, size: Point3, finish: Finish = 'stone', rotation?: Point3) {
    this.part('box', finish, tint, centre, size, rotation)
  }

  beam(a: Point3, b: Point3, width: number, depth: number, tint: Tint, finish: Finish = 'steel') {
    const v = new Vector3(...b).sub(new Vector3(...a))
    const length = v.length()
    if (length < 0.001) return
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), v.normalize())
    this.part(
      'box',
      finish,
      tint,
      [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      [width, length, depth],
      q,
    )
  }

  line(a: Point3, b: Point3, tint: Tint) {
    this.lines.push(...a, ...b)
    const { r, g, b: blue } = new Color(tint)
    this.lineColors.push(r, g, blue, r, g, blue)
  }

  tri(a: Point3, b: Point3, c: Point3, tint: Tint) {
    this.vertices.push(...a, ...b, ...c)
    const { r, g, b: blue } = new Color(tint)
    this.faceColors.push(r, g, blue, r, g, blue, r, g, blue)
  }

  quad(a: Point3, b: Point3, c: Point3, d: Point3, tint: Tint) {
    this.tri(a, b, d, tint)
    this.tri(b, c, d, tint)
  }

  build(): BuiltModel {
    const object = new Group()
    const geometries = new Set<BufferGeometry>()
    const materials = new Set<Material>()
    const instances: InstancedMesh[] = []
    const textures: { dispose(): void }[] = []
    const shapes = new Map<Shape, BufferGeometry>()
    const paints = new Map<Finish, MeshStandardMaterial>()
    for (const { shape, finish, stamps } of this.batches.values()) {
      let geom = shapes.get(shape)
      if (!geom) {
        switch (shape) {
          case 'box':
            geom = new BoxGeometry(1, 1, 1)
            break
          case 'round':
            geom = new CylinderGeometry(0.5, 0.5, 1, 20)
            break
          case 'cone':
            geom = new CylinderGeometry(0.035, 0.5, 1, 9)
            break
          case 'rock':
            geom = new DodecahedronGeometry(0.5)
            break
          case 'fir':
          case 'distantFir':
            geom = firGeometry(shape === 'distantFir')
            break
          case 'bud':
            geom = new IcosahedronGeometry(0.5, 0)
            break
        }
        shapes.set(shape, geom)
        geometries.add(geom)
      }
      let mat = paints.get(finish)
      if (!mat) {
        if (finish === 'needles') {
          const needles = needleMaterial()
          textures.push(needles.map)
          mat = needles.material
        } else mat = new MeshStandardMaterial(finishes[finish])
        paints.set(finish, mat)
        materials.add(mat)
      }
      const mesh = new InstancedMesh(geom, mat, stamps.length)
      stamps.forEach(({ matrix, color }, i) => {
        mesh.setMatrixAt(i, matrix)
        mesh.setColorAt(i, color)
      })
      mesh.castShadow = finish !== 'glass' && finish !== 'lamp'
      mesh.receiveShadow = finish !== 'glass'
      mesh.computeBoundingSphere()
      object.add(mesh)
      instances.push(mesh)
    }
    if (this.vertices.length) {
      const geom = coloredGeometry(this.vertices, this.faceColors)
      geom.computeVertexNormals()
      const granite = this.faceFinish === 'granite' ? graniteMaterial() : null
      if (granite) textures.push(granite.map)
      const mat =
        granite?.material ??
        new MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.04 })
      const mesh = new Mesh(geom, mat)
      mesh.castShadow = mesh.receiveShadow = true
      geometries.add(geom)
      materials.add(mat)
      object.add(mesh)
    }
    if (this.lines.length) {
      const geom = coloredGeometry(this.lines, this.lineColors)
      const mat = new LineBasicMaterial({ vertexColors: true, toneMapped: false })
      geometries.add(geom)
      materials.add(mat)
      object.add(new LineSegments(geom, mat))
    }
    return {
      object,
      shadowCasters: object.children.filter((child) => child.castShadow),
      casts: true,
      materials: [...materials].map((material) => ({
        material,
        alpha: material.opacity,
        depth: material.depthWrite,
      })),
      dispose() {
        instances.forEach((mesh) => mesh.dispose())
        geometries.forEach((geom) => geom.dispose())
        materials.forEach((mat) => mat.dispose())
        textures.forEach((texture) => texture.dispose())
      },
    }
  }
}

function coloredGeometry(positions: number[], colors: number[]) {
  const geom = new BufferGeometry()
  geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geom.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geom.computeBoundingSphere()
  return geom
}
