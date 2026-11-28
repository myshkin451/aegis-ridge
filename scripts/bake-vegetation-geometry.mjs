// Called by prepare-vegetation.py. Work on the original metric scan before normalizing each axis.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Scene } from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { MeshoptSimplifier } from 'meshoptimizer'
import { firGeometry } from '../src/scene/terrain/firGeometry'

const [directory, work, output] = process.argv.slice(-3)
const gltf = JSON.parse(await readFile(path.join(directory, 'boulder_01_1k.gltf')))
const data = await readFile(path.join(directory, 'boulder_01.bin'))
function accessor(index, format, width) {
  const a = gltf.accessors[index], b = gltf.bufferViews[a.bufferView]
  return new format(data.buffer, data.byteOffset + b.byteOffset + (a.byteOffset ?? 0), a.count * width)
}
const primitive = gltf.meshes[0].primitives[0]
const position = accessor(primitive.attributes.POSITION, Float32Array, 3)
const normal = accessor(primitive.attributes.NORMAL, Float32Array, 3)
const uv = accessor(primitive.attributes.TEXCOORD_0, Float32Array, 2)
const indices = accessor(primitive.indices, Uint32Array, 1)
const scan = await readFile(path.join(work, 'boulder.rgb'))

// The source has separate vertices on UV islands and hard edges. Weld position first, then
// sample and average the authored scan normals and albedo before surface-error simplification.
const vertices = new Map(), points = [], shades = [], normals = [], counts = []
const remap = new Uint32Array(position.length / 3)
for (let i = 0; i < remap.length; i++) {
  const xyz = Array.from(position.subarray(i*3, i*3+3))
  const key = xyz.map(value => Math.round(value * 1e6)).join(',')
  let dest = vertices.get(key)
  if (dest === undefined) {
    dest = points.length / 3
    vertices.set(key, dest)
    points.push(...xyz)
    shades.push(0, 0, 0)
    normals.push(0, 0, 0)
    counts.push(0)
  }
  const pixel = (Math.min(1023, Math.max(0, Math.floor(uv[i*2+1]*1024)))*1024 +
    Math.min(1023, Math.max(0, Math.floor(uv[i*2]*1024))))*3
  const luma = scan[pixel]*.2126 + scan[pixel+1]*.7152 + scan[pixel+2]*.0722
  for (let c = 0; c < 3; c++) {
    // Keep a little lichen and oxidation, bringing the local matrix towards a cool neutral grey.
    const channel = (.70 * luma + .30 * scan[pixel+c]) / 255
    shades[dest*3+c] += channel <= .04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4
    normals[dest*3+c] += normal[i*3+c]
  }
  remap[i] = dest
  counts[dest]++
}
const metric = Float32Array.from(points)
const welded = Uint32Array.from(indices, i => remap[i])
const { min, max } = gltf.accessors[primitive.attributes.POSITION]
const sizes = max.map((v,c) => v-min[c])
const scene = new Scene()
const paint = new MeshStandardMaterial({ vertexColors:true, roughness: 1 })
await MeshoptSimplifier.ready
for (const [name, faces] of [['near', 1250], ['mid', 270], ['far', 58]]) {
  const [reduced] = MeshoptSimplifier.simplify(welded, metric, 3, faces*3, 1)
  const lookup = new Map(), coords = [], colors = [], directions = [], out = []
  for (const src of reduced) {
    if (!lookup.has(src)) {
      lookup.set(src, coords.length/3)
      for (let c=0; c<3; c++) {
        coords.push((points[src*3+c]-min[c])/sizes[c]-.5)
        directions.push(normals[src*3+c]*sizes[c])
        colors.push(shades[src*3+c]/counts[src])
      }
    }
    out.push(lookup.get(src))
  }
  const geom = new BufferGeometry()
  geom.setAttribute('position', new Float32BufferAttribute(coords,3))
  geom.setAttribute('normal', new Float32BufferAttribute(directions,3))
  geom.normalizeNormals()
  geom.setAttribute('color', new Float32BufferAttribute(colors,3))
  geom.setIndex(out)
  const mesh = new Mesh(geom,paint)
  mesh.name = 'rock-'+name
  scene.add(mesh)
  console.log(mesh.name, coords.length/3, 'vertices,', reduced.length/3,'triangles')
}
const crown = firGeometry(false)
const mesh = new Mesh(crown, new MeshStandardMaterial())
mesh.name = 'fir-crown'
scene.add(mesh)
await writeFile(path.join(work,'crown.json'), JSON.stringify({
  positions: Array.from(crown.getAttribute('position').array),
  uvs: Array.from(crown.getAttribute('uv').array), indices: Array.from(crown.index.array),
}))
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer()
    this.onloadend?.()
  }
}
const glb = await new GLTFExporter().parseAsync(scene, { binary: true })
await writeFile(path.join(output, 'boulder-lods.glb'), new Uint8Array(glb))
