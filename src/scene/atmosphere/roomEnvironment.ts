import {
  Color, CubeCamera, DirectionalLight, HalfFloatType, HemisphereLight, InstancedMesh, Light, Matrix4, Line, Mesh, Object3D, OrthographicCamera,
  PlaneGeometry, PMREMGenerator, RGBAFormat, Scene, ShaderMaterial, Sphere, WebGLCubeRenderTarget, WebGLRenderTarget,
  type Texture, type WebGLRenderer,
} from 'three'
import { defaultBlueprint } from '../../data/defaultBlueprint'
import { FLOORS, UNDERGROUND } from '../../data/floors'
import { lightingRoomAt } from '../../data/lighting'
import { equipmentSolids } from '../../geometry/equipment'
import { footprint } from '../../geometry/coords'
import { bedrooms, laundry, publicBath, quietHall, type PlanRect } from '../../geometry/residentialPlan'
import type { FloorId } from '../../types/shelter'
import { useShelterStore } from '../../store/useShelterStore'
import { setChairWalkthrough, walkingMaterials } from '../assets/pilotAssets'
import { roomWashStrength } from '../materials/pbrLibrary'

interface Probe { id: string; floor: FloorId; x: number; z: number; reach: number }
const eyeHeight = 1.55
function centre(id: string, floor: FloorId, r: PlanRect): Probe {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2
  const solids = defaultBlueprint.rooms.filter((room) => room.floorId === floor)
    .flatMap((room) => room.equipment.flatMap(equipmentSolids))
    .filter((b) => Math.abs(eyeHeight - b.center[1]) <= b.size[1] / 2 + 0.06)
  const xs = new Set([cx]), zs = new Set([cz])
  for (const { center: [x, , z], size: [w, , d] } of solids) {
    for (const edge of [x - w / 2 - 0.2, x + w / 2 + 0.2]) if (edge > r.x0 + 0.2 && edge < r.x1 - 0.2) xs.add(edge)
    for (const edge of [z - d / 2 - 0.2, z + d / 2 + 0.2]) if (edge > r.z0 + 0.2 && edge < r.z1 - 0.2) zs.add(edge)
  }
  // Optical centre is the room centre, displaced only when an installed cabinet occupies it.
  let px = cx, pz = cz, best = Infinity
  for (const x of xs) for (const z of zs) {
    const distance = (x - cx) ** 2 + (z - cz) ** 2
    if (distance >= best || solids.some((b) =>
      Math.abs(x - b.center[0]) < b.size[0] / 2 + 0.12 && Math.abs(z - b.center[2]) < b.size[2] / 2 + 0.12)) continue
    px = x
    pz = z
    best = distance
  }
  const reach = Math.hypot(Math.max(px - r.x0, r.x1 - px), Math.max(pz - r.z0, r.z1 - pz)) + 5
  return { id, floor, x: px, z: pz, reach }
}
export const reflectionRooms: Probe[] = [
  ...defaultBlueprint.rooms.map((r) => centre(r.id, r.floorId,
    r.id === 'b2_bath_laundry' ? laundry : r.id === 'b2_quarters' ? quietHall : footprint(r.bounds))),
  ...bedrooms.map((b) => centre(b.id, 'B2', b)),
  centre('b2-public-bath', 'B2', publicBath),
  ...UNDERGROUND.map((floor) => ({ id: floor + '-hall', floor, x: -2, z: -1, reach: 21 })),
]
const floorBounds = new Map(Object.values(FLOORS).map((f) => [f.id, footprint(f.bounds)]))
export function reflectionRoomAt(floor: FloorId, x: number, y: number, z: number) {
  const b = floorBounds.get(floor)!
  if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 ||
      y < FLOORS[floor].elevation || y > FLOORS[floor].elevation + FLOORS[floor].pitch) return
  return lightingRoomAt(floor, x, z)
}

/** CubeUV packs filtered roughness levels in one non-mipmapped RGBA16F image. */
export function reflectionBytes(target: WebGLRenderTarget) {
  const t = target.texture
  if (t.type !== HalfFloatType || t.format !== RGBAFormat || t.generateMipmaps)
    throw new Error('Unsupported room PMREM storage')
  return target.width * target.height * 8
}

// Keep complete instances intersecting the probe's finite cubemap range, including geometry
// visible through a door or glazing. The live instancing buffers are restored before the first frame.
function captureBatch(mesh: InstancedMesh) {
  const count = mesh.count
  const matrices = mesh.instanceMatrix.array.slice()
  const colors = mesh.instanceColor?.array.slice()
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
  const sphere = new Sphere(), matrix = new Matrix4()
  const bounds = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    mesh.getMatrixAt(i, matrix)
    sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(matrix.premultiply(mesh.matrixWorld))
    bounds.set([sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius], i * 4)
  }
  return {
    select(x: number, y: number, z: number, reach: number) {
      let kept = 0
      for (let i = 0; i < count; i++) {
        const j = i * 4
        if ((bounds[j] - x) ** 2 + (bounds[j + 1] - y) ** 2 + (bounds[j + 2] - z) ** 2 > (reach + bounds[j + 3]) ** 2) continue
        mesh.instanceMatrix.array.set(matrices.subarray(i * 16, i * 16 + 16), kept * 16)
        if (colors) mesh.instanceColor!.array.set(colors.subarray(i * 3, i * 3 + 3), kept * 3)
        kept++
      }
      mesh.visible = kept > 0
      mesh.count = kept
      mesh.instanceMatrix.needsUpdate = true
      if (colors) mesh.instanceColor!.needsUpdate = true
    },
    restore() {
      mesh.count = count
      mesh.instanceMatrix.array.set(matrices)
      mesh.instanceMatrix.needsUpdate = true
      if (colors) {
        mesh.instanceColor!.array.set(colors)
        mesh.instanceColor!.needsUpdate = true
      }
    },
  }
}

/** Capture the installed shell, doors, walkthrough fit-out and luminaires in their world transforms.
 * Select the floor before rendering six faces so terrain and distant levels never enter an indoor draw.
 * The live scene's material, light count and CubeUV layout are preserved throughout the survey. */
export function captureRooms(gl: WebGLRenderer, scene: Scene, pmrem: PMREMGenerator, size: number,
  output: Map<string, WebGLRenderTarget>) {
  const hdr = new WebGLCubeRenderTarget(size, { type: HalfFloatType, generateMipmaps: false })
  const cube = new CubeCamera(0.06, 40, hdr)
  const oldClear = gl.autoClear, updateMatrices = scene.matrixWorldAutoUpdate
  scene.updateMatrixWorld(true)
  scene.matrixWorldAutoUpdate = false
  gl.autoClear = true
  const original = new Map<Object3D, boolean>()
  const lightPaths = new Set<Object3D>()
  const strengths = new Map<Light, number>()
  const receivers: Object3D[] = []
  scene.traverse((o) => {
    original.set(o, o.visible)
    if (o instanceof Light) {
      strengths.set(o, o.intensity)
      for (let p: Object3D | null = o; p; p = p.parent) lightPaths.add(p)
    }
    if (o.receiveShadow) {
      receivers.push(o)
      o.receiveShadow = false
    }
  })
  const daylight = scene.getObjectByName('Bedroom sky windows')
  const pool = scene.getObjectByName('Installed room lighting')!
  const aimRoom = pool.userData.aimRoom as (room: string, time: string, emergency: boolean) => void
  const bg = scene.background, skyStrength = scene.environmentIntensity
  const wash = roomWashStrength.value, wasWalking = walkingMaterials.value
  const shadowUpdate = gl.shadowMap.needsUpdate
  const indoorBackground = new Color('#6f665a'), stationBackground = new Color('#c6d8e0')
  gl.shadowMap.needsUpdate = false
  setChairWalkthrough(true)
  try {
    for (const id of Object.keys(FLOORS) as FloorId[]) {
      const station = id === 'L1' || id === 'L2'
      const root = scene.getObjectByName(station ? '科研观测站' : id)!
      const allowed = new Set(lightPaths)
      for (let p: Object3D | null = root.parent; p; p = p.parent) allowed.add(p)
      function include(o: Object3D, fitout = false) {
        fitout ||= o.name.startsWith('室内-')
        // On the surface retain the installed exterior and its current weather shutters.
        if (station && !fitout && !original.get(o)) return
        if (o instanceof Line || (o instanceof Mesh && !Array.isArray(o.material) && !o.material.opacity))
          return
        allowed.add(o)
        for (const child of o.children) include(child, fitout)
      }
      include(root)
      if (id === 'B2') daylight?.traverse((o) => allowed.add(o))
      for (const obj of original.keys()) obj.visible = allowed.has(obj)
      for (const [l, value] of strengths) {
        if (l instanceof DirectionalLight) l.intensity = station ? value : 0
        if (l instanceof HemisphereLight) l.intensity = station ? 1.1 : 0.55
      }
      scene.background = station ? stationBackground : indoorBackground
      scene.environmentIntensity = station ? 0.35 : 0.15
      roomWashStrength.value = station ? 1 : 0.12
      const batches = [...allowed].filter((o): o is InstancedMesh => o instanceof InstancedMesh && o.count > 16)
        .map(captureBatch)
      try {
        for (const probe of reflectionRooms) {
          if (probe.floor !== id) continue
          aimRoom(probe.id, '10:30', false)
          pool.updateMatrixWorld(true)
          const y = FLOORS[id].elevation + eyeHeight
          cube.position.set(probe.x, y, probe.z)
          for (const batch of batches) batch.select(probe.x, y, probe.z, probe.reach)
          cube.update(gl, scene)
          const target = pmrem.fromCubemap(hdr.texture)
          target.texture.name = probe.id + ' · surveyed HDR'
          output.set(probe.id, target)
        }
      } finally {
        batches.forEach((batch) => batch.restore())
      }
    }
  } finally {
    hdr.dispose()
    gl.autoClear = oldClear
    scene.matrixWorldAutoUpdate = updateMatrices
    for (const [obj, visible] of original) obj.visible = visible
    for (const o of receivers) o.receiveShadow = true
    aimRoom(gl.domElement.dataset.interiorShadowRoom ?? '', useShelterStore.getState().time, false)
    for (const [light, value] of strengths) light.intensity = value
    gl.shadowMap.needsUpdate = shadowUpdate
    scene.background = bg
    scene.environmentIntensity = skyStrength
    roomWashStrength.value = wash
    setChairWalkthrough(wasWalking)
  }
}

/** Blend two equally-sized linear HDR atlases once per transition frame. Materials still sample
 * a single ordinary CubeUV texture. The spare holds the current mix if another doorway interrupts. */
export class ReflectionMixer {
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera()
  private readonly geometry = new PlaneGeometry(2, 2)
  private readonly material = new ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { start: { value: null as Texture | null }, end: { value: null as Texture | null }, weight: { value: 0 } },
    vertexShader: 'varying vec2 st; void main(){st=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D start,end; uniform float weight; varying vec2 st; void main(){gl_FragColor=mix(texture2D(start,st),texture2D(end,st),weight);}',
  })
  private current: Texture
  private from: Texture
  private buffers: [WebGLRenderTarget, WebGLRenderTarget]
  private output: WebGLRenderTarget
  mix = 1
  readonly bytes: number
  constructor(gl: WebGLRenderer, initial: WebGLRenderTarget) {
    this.current = this.from = initial.texture
    this.buffers = [initial.clone(), initial.clone()]
    for (const buffer of this.buffers) {
      buffer.depthBuffer = false
      buffer.viewport.set(0, 0, buffer.width, buffer.height)
      buffer.scissorTest = false
    }
    this.bytes = 2 * reflectionBytes(initial)
    this.output = this.buffers[0]
    this.scene.add(new Mesh(this.geometry, this.material))
    // Instantiate both render targets and link the only blend program before interaction.
    for (const buffer of this.buffers) this.draw(gl, initial.texture, initial.texture, 1, buffer)
  }
  private draw(gl: WebGLRenderer, a: Texture, b: Texture, weight: number, target: WebGLRenderTarget) {
    const previous = gl.getRenderTarget()
    const u = this.material.uniforms
    u.start.value = a
    u.end.value = b
    u.weight.value = weight
    gl.setRenderTarget(target)
    gl.render(this.scene, this.camera)
    gl.setRenderTarget(previous)
  }
  update(gl: WebGLRenderer, target: Texture, dt: number) {
    if (this.current !== target) {
      this.from = this.mix === 1 ? this.current : this.output.texture
      if (this.from === this.output.texture)
        this.output = this.buffers[this.output === this.buffers[0] ? 1 : 0]
      this.current = target
      this.mix = 0
    }
    this.mix = Math.min(1, this.mix + Math.min(dt, 0.1) / 0.32)
    if (this.mix === 1) return target
    this.draw(gl, this.from, target, this.mix * this.mix * (3 - 2 * this.mix), this.output)
    return this.output.texture
  }
  dispose() {
    this.material.dispose()
    this.geometry.dispose()
    this.buffers.forEach((b) => b.dispose())
  }
}
