import { useShelterStore } from '../store/useShelterStore'

import { openMaintenance } from './OperationsSheet'


export function MepReadout() {
  const installed = useShelterStore(s => s.installedRooms)
  const network = useShelterStore((s) => s.mepNetwork)
  const hovered = useShelterStore((s) => s.hoveredValve)
  const selected = useShelterStore((s) => s.waterTrace)
  if (!network) return null
  const valve = hovered && network.nodes.find((node) => node.id === hovered)
  const edge = selected && network.edges.find((edge) => edge.id === selected)
  if (valve) {
    const rooms = network.affectedRooms(valve.id)
    return (
      <section className="drawer room-sheet valve-sheet" aria-label="阀门数据表" data-valve={valve.id}>
        <div className="sheet-head">
          <b>{valve.id}</b>
        </div>
        <dl>
          <div>
            <dt>介质</dt>
            <dd>{valve.medium}</dd>
          </div>
          <div>
            <dt>阀门状态</dt>
            <dd>常开</dd>
          </div>
          <div>
            <dt>受影响房间</dt>
            <dd>{rooms.map((id) => installed.find(r => r.id === id)?.name ?? id).join('、') || '无下游房间'}</dd>
          </div>
        </dl>
      </section>
    )
  }
  if (!edge) return null
  return (
    <section className="drawer room-sheet" aria-label="水路追踪" data-edge={edge.id}>
      <div className="sheet-head">
        <b>顺着水走</b>
        <button aria-label="结束水路追踪" onClick={() => useShelterStore.getState().setWaterTrace(null)}>
          ×
        </button>
      </div>
      <dl>
        <div>
          <dt>管段</dt>
          <dd>{edge.id}</dd>
        </div>
        <div>
          <dt>介质</dt>
          <dd>{edge.medium}</dd>
        </div>
        <div>
          <dt>沿线高亮</dt>
          <dd>{network.traceWater(edge.id).size} 段</dd>
        </div>
      </dl>
      <button onClick={() => openMaintenance(edge.id)}>隔离检修</button>
    </section>
  )
}
