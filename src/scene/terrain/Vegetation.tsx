import { Detailed } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { useQuality } from '../atmosphere/RenderPipeline'
import type { TerrainAtlas } from '../../geometry/siteElevations'
import { Model, reduceMotion } from '../utils/Model'
import { ModelBuilder } from '../utils/modelBuilder'
import { getFoliageAssets, vegetationV3 } from './foliageAssets'
import { surveyPlantings } from './vegetationStand'
import { buildAlpineVegetation } from './alpineVegetation'

function legacyStand(atlas: TerrainAtlas) {
  const plots = new Map<string, { cx: number; cz: number; detail: ModelBuilder; distant: ModelBuilder }>()
  for (const p of surveyPlantings(atlas)) {
    const cx = (Math.floor(p.x / 320) + 0.5) * 320,
      cz = (Math.floor(p.z / 320) + 0.5) * 320
    const key = cx + ',' + cz
    let plot = plots.get(key)
    if (!plot) {
      plot = { cx, cz, detail: new ModelBuilder(), distant: new ModelBuilder() }
      plots.set(key, plot)
    }
    const m = plot.detail,
      u = p.x - cx,
      v = p.z - cz,
      y = p.y
    if (p.kind === 'rock') {
      const r = p.radius
      m.part('rock', 'lichen', '#99978a', [u, y + 0.16 * r, v], [r * 1.4, r * 0.8, r], [0.12, p.yaw, 0.18])
    } else if (p.kind === 'fir') {
      m.box('#514c3f', [u, y + p.height * 0.31, v], [0.14, p.height * 0.62, 0.14], 'wood')
      for (const model of [m, plot.distant])
        model.part(
          model === m ? 'fir' : 'distantFir',
          'needles',
          p.tint,
          [u, y + p.height * 0.52, v],
          [p.width, p.height, p.depth],
          [p.lean, p.yaw, 0.035],
        )
    } else m.part('bud', 'foliage', '#697557', [u, y + 0.27, v], [1.3, 0.84, 0.93], [0, p.yaw, 0.2])
  }
  return [...plots.values()].map((p) => ({ ...p, nearModel: () => p.detail, farModel: () => p.distant }))
}

type Props = { atlas: TerrainAtlas; visible: boolean }

function LegacyStand({ atlas, visible }: Props) {
  const quality = useQuality(),
    plots = useMemo(() => legacyStand(atlas), [atlas])
  return (
    <group visible={visible}>
      {plots.map((p) => (
        <Detailed
          key={p.cx + ',' + p.cz}
          position={[p.cx, 0, p.cz]}
          distances={[0, quality.trees, 650 + quality.trees * 2]}
        >
          <Model build={p.nearModel} />
          <Model build={p.farModel} />
          <group />
        </Detailed>
      ))}
    </group>
  )
}

function AlpineStand({ atlas, visible }: Props) {
  const quality = useQuality()
  const stand = useMemo(
    () => buildAlpineVegetation(atlas, getFoliageAssets(), quality.trees),
    [atlas, quality],
  )
  const still = useMemo(reduceMotion, [])
  useLayoutEffect(() => () => stand.dispose(), [stand])
  useFrame(({ camera, clock }) => {
    if (visible) stand.update(camera.position, still ? 0 : clock.elapsedTime)
  }, -0.3)
  return <primitive object={stand.group} visible={visible} dispose={null} />
}

export function Vegetation(props: Props) {
  return vegetationV3 ? <AlpineStand {...props} /> : <LegacyStand {...props} />
}
