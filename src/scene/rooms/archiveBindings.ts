import { roomsOn } from '../../data/defaultBlueprint'
import { ModelBuilder } from '../utils/modelBuilder'

/** Installed shelf bays and editions. The cover, spine tooling and title slip share these dimensions. */
export const archiveVolumes = Array.from({ length: 48 }, (_, slot) => {
  const bay = Math.floor(slot / 6),
    level = slot % 6
  return Array.from({ length: ((bay + level) % 4) + 9 }, (_, i) => ({
    x: -4.51 + bay * 1.29 - 0.53 + i * 0.077,
    bottom: 0.184 + level * 0.45,
    width: 0.061 + ((bay + i) % 3) * 0.006,
    height: 0.28 + ((bay + level + i) % 4) * 0.027,
    edition: i + 2 * bay + level,
    volume: i + 1,
    series: bay,
  }))
}).flat()
const inks = ['#785341', '#567064', '#806d4f', '#5e6373', '#6e584d', '#6c7361', '#465c69', '#71666a']
const digits = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg']
const segments = [
  ['a', 0, 1, true],
  ['b', 0.48, 0.5, false],
  ['c', 0.48, -0.5, false],
  ['d', 0, -1, true],
  ['e', -0.48, -0.5, false],
  ['f', -0.48, 0.5, false],
  ['g', 0, 0, true],
] as const

export function archiveSpines() {
  const builder = new ModelBuilder()
  const installation = roomsOn('B2')
    .flatMap((r) => r.equipment)
    .find((e) => e.tagCode === 'LIB-201')!
  builder.equipment(installation.tagCode, installation.position, () => {
    for (const v of archiveVolumes) {
      const front = 0.235
      builder.box(inks[v.series], [v.x, v.bottom + v.height / 2, front], [v.width, v.height, 0.012], 'fabric')
      const mid = v.bottom + v.height * 0.53
      builder.box('#d5cbb3', [v.x, mid, front + 0.007], [v.width - 0.012, 0.063, 0.003], 'plaster')
      const text = String(v.volume)
      for (const [index, digit] of [...text].entries()) {
        const center = v.x + (index - (text.length - 1) / 2) * 0.016
        for (const [key, dx, dy, horizontal] of segments)
          if (digits[Number(digit)].includes(key))
            builder.box(
              '#423c31',
              [center + dx * 0.012, mid + dy * 0.011, front + 0.0091],
              horizontal ? [0.011, 0.0021, 0.001] : [0.0021, 0.0095, 0.001],
              'plaster',
            )
      }
      for (const height of [0.029, v.height - 0.025])
        builder.box(
          '#c1ab81',
          [v.x, v.bottom + height, front + 0.007],
          [v.width - 0.006, 0.003, 0.002],
          'fabric',
        )
    }
  })
  return builder
}
