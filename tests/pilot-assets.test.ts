import { readFileSync, statSync } from 'node:fs'
import { fieldPrints, finishScans, mipBytes, packScan, printLayerOffset, scanSize } from '../src/scene/assets/finishScans'
import { describe, expect, it } from 'vitest'
import { residentialLayouts } from '../src/data/roomLayouts/residential'
import { commonsPlacements } from '../src/data/roomLayouts/commonsPlacements'
import { pbrMaterial, type Finish } from '../src/scene/materials/pbrLibrary'

const dining = residentialLayouts.b2_commons.equipment.find((e) => e.visualKind === 'dining-table')!

describe('the B2 hybrid asset path', () => {
  it('places eight GLB dining chairs facing the table, inside their walk-collision envelopes', () => {
    const chairs = commonsPlacements.filter(p => p.asset === 'dining-chair')
    expect(chairs).toHaveLength(8)
    for (const chair of chairs) {
      const [x, , z] = chair.position
      expect(Math.sign(Math.sin(chair.yaw!))).toBe(Math.sign(dining.position[0] - x))
      expect(dining.collisionBoxes).toContainEqual({
        center: [x - dining.position[0], .50, z - dining.position[2]], size: [.59, 1, .46],
      })
    }
  })

  it('uses single-axis projection for scanned box faces and triplanar projection for soft goods', () => {
    const finishes: Finish[] = [
      'oak_int',
      'plaster',
      'fabric',
      'tile',
      'ceramic',
      'mirror',
      'pvc_clean',
      'rubber_gym',
      ...fieldPrints.map((art) => art.finish),
    ]
    for (const finish of finishes) {
      const material = pbrMaterial(finish)
      const scanned = finishScans.some(scan => scan.finish === finish)
      const box = pbrMaterial(finish, true)
      expect(material.customProgramCacheKey()).toBe(scanned ? 'ars-scan-curved' : 'ars-solid')
      expect(box.customProgramCacheKey()).toBe(scanned ? 'ars-scan-box' : 'ars-solid')
      box.dispose()
      material.dispose()
    }
  })
})


it('packs linear roughness and both normal pairs correctly when scan downloads finish out of order', () => {
  const pixels = new Uint8Array((finishScans.length + 3) * 4)
  const rgba = (...channels: number[]) => new Uint8ClampedArray(channels)
  for (const i of [5, 3, 1, 4, 2, 0]) {
    packScan(pixels, i, rgba(i, i + 1, i + 2, 255), rgba(30 + i, 60 + i, 250, 255), rgba(90 + i, 0, 0, 255))
  }
  expect(Array.from(pixels)).toEqual([
    0, 1, 2, 90, 1, 2, 3, 91, 2, 3, 4, 92, 3, 4, 5, 93, 4, 5, 6, 94, 5, 6, 7, 95,
    30, 60, 31, 61, 32, 62, 33, 63, 34, 64, 35, 65,
  ])
})

it('ships six complete scan trios, five 1K art prints and both GLBs within the round budget', () => {
  const paths = [...finishScans.flatMap((scan) => [...scan.files]), ...fieldPrints.map((print) => print.file)]
  const local = (path: string) => new URL('../public/assets/' + path, import.meta.url)
  expect(finishScans.map((s) => s.finish)).toEqual(['oak_int', 'fabric', 'plaster', 'tile', 'formed_concrete', 'honed_granite'])
  expect(new Set(paths).size).toBe(23)
  for (const path of paths) {
    const file = readFileSync(local(path))
    expect(file.toString('ascii', 8, 16), path).toBe('WEBPVP8 ')
    const w = file.readUInt16LE(26) & 0x3fff, h = file.readUInt16LE(28) & 0x3fff
    expect(Math.max(w, h), path).toBe(scanSize)
    if (!path.startsWith('art/')) expect(Math.min(w, h), path).toBe(scanSize)
  }
  const download = [...paths, 'pilot/dining-chair.glb', 'pilot/domestic.glb']
    .reduce((sum, path) => sum + statSync(local(path)).size, 0)
  expect(download).toBeLessThanOrEqual(4_000_000)
  expect(mipBytes(scanSize, printLayerOffset + fieldPrints.length)).toBe(78_293_656)
})
