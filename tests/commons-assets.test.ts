import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { commonsPlacements } from '../src/data/roomLayouts/commonsPlacements'

interface ModelDocument {
  asset: { copyright: string }
  extensionsRequired: string[]
  buffers: { uri?: string }[]
  images?: { mimeType: string; bufferView: number }[]
  materials: { alphaMode?: string; pbrMetallicRoughness: { baseColorTexture?: { index: number } } }[]
  textures?: { extensions: { EXT_texture_webp: { source: number } } }[]
  bufferViews: { byteOffset?: number; byteLength: number }[]
}

function unpack(name: string) {
  const file = readFileSync(new URL('../public/assets/commons/' + name + '.glb', import.meta.url))
  expect(file.toString('ascii', 0, 4)).toBe('glTF')
  expect(file.readUInt32LE(8)).toBe(file.length)
  const jsonEnd = 20 + file.readUInt32LE(12)
  const doc: ModelDocument = JSON.parse(file.toString('utf8', 20, jsonEnd))
  return { doc, binary: file.subarray(jsonEnd + 8) }
}

describe('B2 installed GLB assets', () => {
  it('ships all placed meshes and their original PBR resources in self-contained CC0 models', () => {
    const manifest = readFileSync(new URL('../public/assets/MANIFEST.md', import.meta.url), 'utf8')
    for (const name of new Set(commonsPlacements.map((p) => p.asset))) {
      const { doc } = unpack(name)
      expect(doc.buffers.every((b) => !b.uri)).toBe(true)
      expect(doc.extensionsRequired).toContain('KHR_draco_mesh_compression')
      const source = doc.asset.copyright.match(/https:\/\/polyhaven\.com\/a\/\w+/)?.[0]
      expect(source).toBeTruthy()
      const record = manifest.split('\n').find((line) => line.includes('(commons/' + name + '.glb)'))
      expect(record).toContain(source)
      expect(record).toContain('CC0 1.0')
      if (name === 'mug') continue // The original cup uses a solid ceramic glaze.
      expect(doc.extensionsRequired).toContain('EXT_texture_webp')
      expect(doc.images?.every((image) => image.mimeType === 'image/webp')).toBe(true)
    }
  })

  it('preserves the actual alpha channel of both scanned plants inside the WebP bitstream', () => {
    for (const name of ['fern', 'plant']) {
      const { doc, binary } = unpack(name)
      const mask = doc.materials.find((m) => m.alphaMode === 'MASK')!
      const texture = doc.textures![mask.pbrMetallicRoughness.baseColorTexture!.index]
      const image = doc.images![texture.extensions.EXT_texture_webp.source]
      const view = doc.bufferViews[image.bufferView]
      const offset = view.byteOffset ?? 0
      const stream = binary.subarray(offset, offset + view.byteLength)
      expect(stream.toString('ascii', 8, 16)).toBe('WEBPVP8X')
      expect(stream[20] & 0x10).toBe(0x10)
    }
  })
})
