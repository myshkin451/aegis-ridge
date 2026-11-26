import { lazy, Suspense, useRef } from 'react'
import { TopBar } from './ui/TopBar'
import { FloorSlicer } from './ui/FloorSlicer'
import { BUFFER_DEPTH, FLOORS, FLOOR_ORDER, UNDERGROUND } from './data/floors'
import { siteFacilities } from './data/siteFacilities'
import { footprint } from './geometry/coords'
import { useShelterStore } from './store/useShelterStore'

const total = FLOOR_ORDER.reduce((sum, id) => sum + footprint(FLOORS[id].bounds).area, 0)
const ShelterCanvas = lazy(async () => ({ default: (await import('./scene/ShelterCanvas')).ShelterCanvas }))

export default function App() {
  const station = useRef<HTMLDivElement>(null),
    rock = useRef<HTMLDivElement>(null)
  const floorMarks = useRef<HTMLDivElement>(null)
  const needle = useRef<SVGGElement>(null),
    ruler = useRef<HTMLSpanElement>(null),
    rulerText = useRef<HTMLSpanElement>(null)
  const selected = useShelterStore((s) => s.floor)
  const mode = useShelterStore((s) => s.mode),
    sectionZ = useShelterStore((s) => s.sectionZ),
    setZ = useShelterStore((s) => s.setSectionZ)
  const focus = useShelterStore((s) => s.facilityId)
  const f = selected === 'ALL' ? null : FLOORS[selected]
  const elevation = f ? (f.elevation > 0 ? '+' : f.elevation === 0 ? '±' : '') + f.elevation.toFixed(1) : null
  return (
    <div className="console">
      <TopBar />
      <main className="viewport" aria-label="可交互的避难所建筑沙盘">
        <div className="canvas-wrap">
          <Suspense
            fallback={
              <div className="graphics-message" role="status">
                正在载入三维沙盘…
              </div>
            }
          >
            <ShelterCanvas instruments={{ station, rock, floorMarks, needle, ruler, rulerText }} />
          </Suspense>
        </div>
        <div ref={station} className="world-note station-note" aria-hidden="true">
          <i />
          <span>
            <b>地表科研站</b>
            <small>L1 — L2</small>
          </span>
        </div>
        <div ref={rock} className="world-note rock-note" aria-hidden="true">
          <i />
          <span>
            <b>复合防护层</b>
            <small>{BUFFER_DEPTH.toFixed(1)} m</small>
          </span>
        </div>
        <div ref={floorMarks} hidden aria-hidden="true">
          {UNDERGROUND.map((id) => (
            <div key={id} className="section-level">
              <span>
                {id}　{FLOORS[id].elevation.toFixed(1)} m
              </span>
            </div>
          ))}
        </div>
        <FloorSlicer />
        {mode === 'cutaway' && selected === 'ALL' && (
          <aside className="section-key" aria-label="地质剖面图例">
            <label>
              剖面位置 <output>Z {sectionZ.toFixed(2)} m</output>
              <input
                aria-label="剖面位置"
                type="range"
                min="-9"
                max="8"
                step=".25"
                value={sectionZ}
                onChange={(e) => setZ(Number(e.target.value))}
              />
            </label>
            <div>╱ 表土　⁺· 风化岩　＋ 花岗岩</div>
            <div>
              △ 钢筋混凝土　<span>▽ 地下水位</span>
            </div>
          </aside>
        )}

        <div className="drawing-info" aria-live="polite">
          <span className="drawing-mark" aria-hidden="true" />
          <div>
            <h2>
              {f?.name ??
                siteFacilities.find((site) => site.id === focus)?.name ??
                (mode === 'cutaway'
                  ? '南向地质剖面'
                  : mode === 'xray'
                    ? '平硐与垂直交通'
                    : '观测站与山地场址')}
            </h2>
            <p>
              {f ? (
                <>
                  <b>{f.id}</b>
                  <i />
                  标高 <b>{elevation} m</b>
                  <i />
                  <b>{footprint(f.bounds).area} m²</b>
                </>
              ) : (
                <>
                  地表 <b>2</b> 层<i />
                  地下 <b>4</b> 层<i />
                  <b>{total.toLocaleString('en-US')} m²</b>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="north" title="方位指北针" aria-label="指北针">
          <svg viewBox="-5 -5 46 46" width="46" height="46" aria-hidden="true">
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth=".65" opacity=".4" />
            <g ref={needle}>
              <text x="18" y="0" textAnchor="middle" fill="#343a38" fontSize="6">
                N
              </text>
              <path d="m18 4 4 17-4-3-4 3z" fill="#343a38" />
              <path d="m18 31-4-11 4 2 4-2z" fill="#65717a" />
            </g>
          </svg>
        </div>
      </main>
      <div className="scale">
        <span ref={ruler} className="scale-rule" />
        <span ref={rulerText}>5 m</span>
      </div>
    </div>
  )
}
