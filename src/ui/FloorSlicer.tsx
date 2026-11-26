import { Layers3, PanelTop } from 'lucide-react'
import { FLOORS, FLOOR_ORDER } from '../data/floors'
import { useShelterStore } from '../store/useShelterStore'

export function FloorSlicer() {
  const selected = useShelterStore((s) => s.floor),
    select = useShelterStore((s) => s.selectFloor)
  const plenum = useShelterStore((s) => s.plenum),
    toggle = useShelterStore((s) => s.togglePlenum)
  return (
    <aside className="slicer" aria-label="楼层剥离">
      <div className="rail-caption">
        <Layers3 size={14} />
        <h2>楼层剥离</h2>
      </div>
      <div className="floor-buttons">
        <button
          className="floor-row all-floors"
          aria-pressed={selected === 'ALL'}
          onClick={() => select('ALL')}
        >
          <b>ALL</b>
          <span>全部楼层</span>
        </button>
        {FLOOR_ORDER.map((id) => (
          <button
            key={id}
            className={'floor-row ' + (id === 'B1' ? 'subsurface' : '')}
            aria-pressed={selected === id}
            onClick={() => select(id)}
            title={FLOORS[id].name}
          >
            <b>{id}</b>
            <span>{FLOORS[id].shortName}</span>
          </button>
        ))}
      </div>
      <button
        className="plenum-control"
        role="switch"
        aria-checked={plenum}
        aria-label="显示机电夹层"
        onClick={toggle}
      >
        <PanelTop size={14} />
        <span>机电夹层</span>
        <i className="switch-track">
          <i />
        </i>
      </button>
    </aside>
  )
}
