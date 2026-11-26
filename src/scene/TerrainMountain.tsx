import { useShelterStore } from '../store/useShelterStore'
import { Model } from './utils/Model'
import { approachRoad, landscape, terrainBody } from './terrainGeometry'

const kept = () => terrainBody('kept')
const removed = () => terrainBody('removed')
const wire = () => terrainBody('wire')
const rearGrove = () => landscape('kept')
const frontGrove = () => landscape('removed')

export function TerrainMountain() {
  const floor = useShelterStore((s) => s.floor)
  const mode = useShelterStore((s) => s.mode)
  const site = floor === 'ALL'
  const solid = site && mode !== 'xray'
  const full = site && mode === 'exterior'
  return (
    <group name="山体与盘山道路">
      <Model build={kept} opacity={Number(solid)} />
      <Model build={removed} opacity={Number(full)} />
      <Model build={wire} opacity={site && mode === 'xray' ? 0.12 : 0} />
      <Model build={rearGrove} opacity={Number(solid)} />
      <Model build={frontGrove} opacity={Number(full)} />
      <Model build={approachRoad} opacity={Number(full)} />
    </group>
  )
}
