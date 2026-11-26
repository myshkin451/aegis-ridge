import { Detailed } from '@react-three/drei'
import { useMemo } from 'react'
import { siteFacilities } from '../../data/siteFacilities'
import { randomSource } from '../../geometry/random'
import { groundAt } from '../../geometry/siteElevations'
import type { TerrainAtlas } from '../../geometry/siteElevations'
import { Model } from '../utils/Model'
import { ModelBuilder } from '../utils/modelBuilder'

function stand(atlas: TerrainAtlas) {
  const random = randomSource(87142)
  const plots = new Map<string, { cx: number; cz: number; detail: ModelBuilder; distant: ModelBuilder }>()
  const facilities = siteFacilities
    .filter((f) => !['road', 'eastBore', 'cable'].includes(f.kind))
    .flatMap((f) => f.points)
  function planted(x: number, z: number) {
    if (Math.abs(x) < 23 && Math.abs(z) < 18) return false
    if (facilities.some(([a, b]) => Math.hypot(x - a, z - b) < 13)) return false
    return !atlas.road.slice(1).some(([u, , v], i) => {
      const [a, , b] = atlas.road[i],
        dx = u - a,
        dz = v - b
      const t = Math.max(0, Math.min(1, ((x - a) * dx + (z - b) * dz) / (dx * dx + dz * dz)))
      return Math.hypot(x - a - t * dx, z - b - t * dz) < 6
    })
  }
  for (let i = 0; i < 6200; i++) {
    const span = i < 900 ? 260 : 1500
    const x = (random() - 0.5) * span,
      z = (random() - 0.5) * span
    const s = groundAt(atlas, x, z),
      y = s.height,
      north = (1 - Math.cos(s.aspect)) / 2
    const grove = Math.sin(x / 37 + Math.sin(z / 28)) * Math.cos(z / 47) + s.flow * 0.8 + s.curvature * 0.15
    if (!planted(x, z)) continue
    const cx = (Math.floor(x / 320) + 0.5) * 320,
      cz = (Math.floor(z / 320) + 0.5) * 320,
      key = cx + ',' + cz
    let plot = plots.get(key)
    if (!plot) {
      plot = { cx, cz, detail: new ModelBuilder(), distant: new ModelBuilder() }
      plots.set(key, plot)
    }
    const m = plot.detail,
      u = x - cx,
      v = z - cz
    if (s.slope > 32 || grove < -0.46) {
      if (random() < 0.36) {
        const r = 0.3 + random() * 1.6
        m.part(
          'rock',
          'stone',
          '#99978a',
          [u, y + 0.16 * r, v],
          [r * 1.4, r * 0.8, r],
          [0.12, random() * 6, 0.18],
        )
      }
    } else if (
      grove > 0.03 &&
      y < 238 + 70 * north &&
      s.slope < 31 &&
      (Math.hypot(x, z) > 85 || (s.curvature > 0.12 && s.flow > 0.2 && random() < 0.32))
    ) {
      const h = (3.5 + random() * 5.7) * (0.85 + 0.15 * north),
        w = h * (0.22 + random() * 0.06)
      m.box('#514c3f', [u, y + h * 0.31, v], [0.14, h * 0.62, 0.14], 'wood')
      const shades = ['#475d47', '#4e644e', '#394f43', '#586b54']
      const tint = shades[Math.floor(random() * shades.length)],
        angle = random() * Math.PI * 2
      const depth = w * (1.9 + random() * 0.38)
      m.part('fir', 'needles', tint, [u, y + h * 0.52, v], [w * 2.3, h, depth], [0.025, angle, 0.035])
      plot.distant.part(
        'distantFir',
        'needles',
        tint,
        [u, y + h * 0.52, v],
        [w * 2.3, h, depth],
        [0.025, angle, 0.035],
      )
    } else if (s.slope < 28 && s.flow + 0.4 * north > 0.33) {
      m.part('bud', 'foliage', '#697557', [u, y + 0.27, v], [1.3, 0.84, 0.93], [0, random() * 6, 0.2])
    }
  }
  return [...plots.values()].map((plot) => ({
    ...plot,
    nearModel: () => plot.detail,
    farModel: () => plot.distant,
  }))
}
export function Vegetation({ atlas, visible }: { atlas: TerrainAtlas; visible: boolean }) {
  const plots = useMemo(() => stand(atlas), [atlas])
  return (
    <group visible={visible}>
      {plots.map((p) => (
        <Detailed key={p.cx + ',' + p.cz} position={[p.cx, 0, p.cz]} distances={[0, 340, 1450]}>
          <Model build={p.nearModel} />
          <Model build={p.farModel} />
          <group />
        </Detailed>
      ))}
    </group>
  )
}
