import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  Float32BufferAttribute,
  FrontSide,
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
import { cropLeafGeometry, type CropLeaf } from '../rooms/cropBeds'
import { makeCropMaterial } from '../terrain/foliageAssets'
import { beddingGeometry } from '../rooms/beddingGeometry'
import { foldedThrow } from '../rooms/foldedThrow'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import {
  fallbackBasin,
  fallbackPlant,
  fallbackToilet,
  isDomestic,
  registerDomesticMesh,
  type DomesticKind,
} from '../assets/domesticAssets'
import { proceduralChair, registerChairMesh } from '../assets/pilotAssets'
import type { Material, Object3D } from 'three'
import type { Point3 } from '../../types/shelter'
import { firGeometry, needleMaterial } from '../terrain/firGeometry'
import { pbrMaterial } from '../materials/pbrLibrary'
import type { Finish } from '../materials/pbrLibrary'

const standardBedding = { 'standard-pillow': 'pillow', 'standard-duvet': 'duvet' } as const
type Shape =
  | 'box'
  | 'round'
  | 'cone'
  | 'rock'
  | 'bud'
  | 'fir'
  | 'distantFir'
  | 'leaf'
  | 'cushion'
  | 'shade'
  | 'dining-chair'
  | 'throw'
  | 'standard-throw'
  | keyof typeof standardBedding
  | CropLeaf
  | DomesticKind
interface Stamp {
  matrix: Matrix4
  color: Color
  tag?: string
  cutLabel?: string
}
interface Batch {
  shape: Shape
  finish: Finish
  stamps: Stamp[]
  decal: boolean
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
  constructor(private readonly faceFinish: Finish = 'stone') {}
  private placement?: { origin: Point3; tag: string }

  /** Append a tagged module to the floor batches without creating a draw call per device. */
  equipment(tag: string, origin: Point3, draw: () => void) {
    this.placement = { origin, tag }
    try {
      draw()
    } finally {
      this.placement = undefined
    }
  }
  private placed(p: Point3): Point3 {
    const origin = this.placement?.origin
    return origin ? [p[0] + origin[0], p[1] + origin[1], p[2] + origin[2]] : p
  }

  private batches = new Map<string, Batch>()
  private vertices: number[] = []
  private faceColors: number[] = []
  private closedRanges: [number, number][] = []
  private lines: number[] = []
  private lineColors: number[] = []

  part(
    shape: Shape,
    finish: Finish,
    tint: Tint,
    centre: Point3,
    size: Point3,
    rotation?: Point3 | Quaternion,
    cutLabel?: string,
    decal = false,
  ) {
    const key = shape + '/' + finish + (decal ? '/decal' : '')
    let batch = this.batches.get(key)
    if (!batch) {
      batch = { shape, finish, stamps: [], decal }
      this.batches.set(key, batch)
    }
    const q =
      rotation instanceof Quaternion
        ? rotation
        : new Quaternion().setFromEuler(new Euler(...((rotation ?? [0, 0, 0]) as Point3)))
    batch.stamps.push({
      matrix: new Matrix4().compose(new Vector3(...this.placed(centre)), q, new Vector3(...size)),
      color: new Color(tint),
      tag: this.placement?.tag,
      cutLabel,
    })
  }

  box(tint: Tint, centre: Point3, size: Point3, finish: Finish = 'stone', rotation?: Point3, cutLabel?: string) {
    this.part('box', finish, tint, centre, size, rotation, cutLabel)
  }

  /** Printed markings use their own material batch so walls keep their actual depth. */
  decalBox(tint: Tint, centre: Point3, size: Point3, finish: Finish, rotation?: Point3) {
    this.part('box', finish, tint, centre, size, rotation, undefined, true)
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
    this.lines.push(...this.placed(a), ...this.placed(b))
    const { r, g, b: blue } = new Color(tint)
    this.lineColors.push(r, g, blue, r, g, blue)
  }

  tri(a: Point3, b: Point3, c: Point3, tint: Tint) {
    this.vertices.push(...this.placed(a), ...this.placed(b), ...this.placed(c))
    const { r, g, b: blue } = new Color(tint)
    this.faceColors.push(r, g, blue, r, g, blue, r, g, blue)
  }

  quad(a: Point3, b: Point3, c: Point3, d: Point3, tint: Tint) {
    this.tri(a, b, d, tint)
    this.tri(b, c, d, tint)
  }

  closedFaces(draw: () => void) {
    const first = this.vertices.length / 3
    draw()
    this.closedRanges.push([first, this.vertices.length / 3 - first])
  }

  build(): BuiltModel {
    const object = new Group()
    const geometries = new Set<BufferGeometry>()
    const materials = new Set<Material>()
    const instances: InstancedMesh[] = []
    const unregister: (() => void)[] = []
    const textures: { dispose(): void }[] = []
    const shapes = new Map<Shape, BufferGeometry>()
    const paints = new Map<string, MeshStandardMaterial>()
    for (const { shape, finish, stamps, decal } of this.batches.values()) {
      const ordinaryBedding = shape === 'standard-pillow' || shape === 'standard-duvet'
      const fallbackShape = ordinaryBedding ? 'cushion' : shape
      let geom = shapes.get(fallbackShape)
      if (!geom) {
        switch (fallbackShape) {
          case 'dining-chair':
            geom = proceduralChair()
            break
          case 'wc-bowl':
            geom = fallbackToilet()
            break
          case 'houseplant':
            geom = fallbackPlant()
            break
          case 'throw':
          case 'standard-throw': {
            const support = fallbackShape === 'throw' ? 'duvet' : 'cushion'
            const quilt =
              shapes.get(support) ??
              (support === 'duvet' ? beddingGeometry('duvet') : new RoundedBoxGeometry(1, 1, 1, 2, 0.12))
            shapes.set(support, quilt)
            geometries.add(quilt)
            // The deeply corrugated survey quilt needs 1.3 mm more clearance between sampling knots.
            geom = foldedThrow(quilt, support === 'duvet' ? 0.018 : 0.012)
            break
          }
          case 'pillow':
          case 'duvet':
            geom = beddingGeometry(fallbackShape)
            break
          case 'basin':
            geom = fallbackBasin()
            break
          case 'sofa-cushion':
          case 'cushion':
            geom = new RoundedBoxGeometry(1, 1, 1, 2, 0.12)
            break
          case 'pleated-shade':
          case 'shade':
            geom = new CylinderGeometry(0.34, 0.5, 1, 32, 1, true)
            break
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
            geom = firGeometry(fallbackShape === 'distantFir')
            break
          case 'crop-broad':
          case 'crop-serrated':
          case 'crop-compound':
            geom = cropLeafGeometry(fallbackShape)
            break
          case 'leaf': {
            geom = new BufferGeometry()
            geom.setAttribute(
              'position',
              new Float32BufferAttribute(
                [
                  0, -0.4, -0.5, -0.44, 0.01, -0.12, 0, 0.11, -0.04, 0.44, 0.01, -0.12, -0.38, 0.15, 0.26, 0,
                  0.38, 0.5, 0.38, 0.15, 0.26,
                ],
                3,
              ),
            )
            geom.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 5, 2, 5, 6, 2, 6, 3])
            geom.computeVertexNormals()
            break
          }
          case 'bud':
            geom = new IcosahedronGeometry(0.5, 0)
            break
        }
        shapes.set(fallbackShape, geom)
        geometries.add(geom)
      }
      const crop = shape === 'crop-broad' || shape === 'crop-serrated' || shape === 'crop-compound'
      const closedFoliage = finish === 'foliage' && shape !== 'leaf' && !crop
      const paintKey = crop
        ? 'crop-atlas'
        : finish + (shape === 'box' ? '-edge' : '') + (closedFoliage ? '-hull' : '') + (decal ? '-decal' : '')
      let mat = paints.get(paintKey)
      if (!mat) {
        if (crop) mat = makeCropMaterial()
        else if (finish === 'needles') {
          const needles = needleMaterial()
          textures.push(needles.map)
          mat = needles.material
        } else mat = pbrMaterial(finish, shape === 'box')
        // Shrubs are closed icosahedra. Only the thin hydroponic leaves need two-sided shading.
        if (closedFoliage) mat.side = FrontSide
        if (decal) {
          mat.polygonOffset = true
          mat.polygonOffsetFactor = -1
          mat.polygonOffsetUnits = -1
        }
        paints.set(paintKey, mat)
        materials.add(mat)
      }
      const mesh = new InstancedMesh(geom, mat, stamps.length)
      stamps.forEach(({ matrix, color }, i) => {
        mesh.setMatrixAt(i, matrix)
        mesh.setColorAt(i, color)
      })
      if (stamps.some((stamp) => stamp.tag)) {
        mesh.userData.equipmentTags = stamps.map((stamp) => stamp.tag)
        mesh.userData.batchTags = [...new Set(mesh.userData.equipmentTags)]
      }
      mesh.userData.closedSolid = !crop
      mesh.userData.finish = finish
      mesh.userData.shape = shape
      if (stamps.some(stamp => stamp.cutLabel))
        mesh.userData.cutLabels = stamps.map(stamp => stamp.cutLabel)
      mesh.castShadow = !decal && finish !== 'glass' && finish !== 'lamp'
      mesh.receiveShadow = finish !== 'glass'
      mesh.computeBoundingSphere()
      if (shape === 'dining-chair') unregister.push(registerChairMesh(mesh))
      if (shape === 'throw' || shape === 'standard-throw')
        unregister.push(registerDomesticMesh(mesh, 'folded-throw'))
      const installedShape = ordinaryBedding ? standardBedding[shape] : shape
      if (isDomestic(installedShape)) {
        mesh.userData.domesticKind = installedShape
        unregister.push(registerDomesticMesh(mesh, installedShape))
      }
      object.add(mesh)
      instances.push(mesh)
    }
    if (this.vertices.length) {
      const geom = coloredGeometry(this.vertices, this.faceColors)
      geom.computeVertexNormals()
      const mat = pbrMaterial(this.faceFinish, false, true)
      const mesh = new Mesh(geom, mat)
      mesh.userData.closedRanges = this.closedRanges
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
        unregister.forEach((release) => release())
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
