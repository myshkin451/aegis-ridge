import { FLOORS, FLOOR_ORDER, SLAB } from '../data/floors'
import { buffer, floorSection } from '../geometry/coords'
import { rulerTop, rulerBottom, rulerFraction } from '../geometry/viewGeometry'
import { useShelterStore } from '../store/useShelterStore'
import type { CSSProperties, PointerEvent } from 'react'
import { useRef } from 'react'
const segment = (top: number, bottom: number) =>
  ({
    '--start': rulerFraction(top) * 100 + '%',
    '--span': ((top - bottom) / (rulerTop - rulerBottom)) * 100 + '%',
  }) as CSSProperties
export function ElevationRuler() {
  const s = useShelterStore(),
    rail = useRef<HTMLDivElement>(null),
    drag = useRef(false)
  const current = s.lastFloor,
    base = FLOORS[current].elevation
  function move(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || !rail.current) return
    const r = rail.current.getBoundingClientRect(),
      horizontal = r.width > r.height
    const fraction = horizontal ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height
    s.setCutHeight(Math.round((rulerTop - fraction * (rulerTop - rulerBottom) - base) * 20) / 20)
  }
  return (
    <aside className="elevation" aria-label="楼层标高尺">
      <div className="ruler-head">
        <span>标高</span>
        <span>m</span>
      </div>
      <div className="rail" ref={rail}>
        <i className="band granite" style={segment(buffer.interfaceY, buffer.bottom)} />
        <i className="band cap" style={segment(0, buffer.interfaceY)} />
        <span className="rock-label" style={segment(0, buffer.bottom)}>
          6.0 m
        </span>
        {FLOOR_ORDER.map((id, i) => {
          const f = FLOORS[id],
            p = floorSection(id)
          return (
            <div
              key={id}
              className={'floor-mark' + (s.floor === id ? ' selected' : '')}
              style={segment(p.cap, p.slabBottom)}
            >
              <i className="band services" style={segment(p.plenumTop, p.ceiling)} />
              <i className="band slab" style={segment(p.floor, p.floor - SLAB)} />
              <button
                aria-label={id + ' ' + f.shortName}
                title={i + 1 + ' · ' + f.name}
                aria-pressed={s.floor === id}
                onClick={() => s.selectFloor(id)}
                style={segment(p.cap, p.floor)}
              >
                <b>{id}</b>
                <small>
                  {f.elevation > 0 ? '+' : f.elevation === 0 ? '±' : ''}
                  {f.elevation.toFixed(1)}
                </small>
              </button>
            </div>
          )
        })}
        <button
          type="button"
          role="slider"
          className="cut-cursor"
          aria-label="水平剖切高度"
          aria-valuemin={0.05}
          aria-valuemax={FLOORS[current].pitch - 0.02}
          aria-valuenow={s.cutHeight}
          aria-valuetext={current + ' FL+' + s.cutHeight.toFixed(3) + ' m'}
          style={{ '--start': rulerFraction(base + s.cutHeight) * 100 + '%' } as CSSProperties}
          onPointerDown={(e) => {
            if (s.cameraState !== 'plan' && s.cameraState !== 'floorOrbit') s.setView('plan')
            drag.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={move}
          onLostPointerCapture={() => {
            drag.current = false
          }}
          onKeyDown={(e) => {
            if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
              e.preventDefault()
              if (s.cameraState !== 'floorOrbit' && s.cameraState !== 'plan') s.setView('plan')
              s.setCutHeight(s.cutHeight + (['ArrowUp', 'ArrowRight'].includes(e.key) ? 0.05 : -0.05))
            }
          }}
        >
          <span>FL+{s.cutHeight.toFixed(3)}</span>
        </button>
      </div>
    </aside>
  )
}
