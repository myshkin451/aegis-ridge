import { useEffect, useRef, useState } from 'react'
import { defaultBlueprint, roomsOn } from '../data/defaultBlueprint'
import { FLOORS, FLOOR_ORDER } from '../data/floors'
import { photo, photographs } from '../data/photographs'
import type { ShotId } from '../data/photographs'
import { siteFacilities } from '../data/siteFacilities'
import { footprint } from '../geometry/coords'
import { boxLimits } from '../geometry/viewGeometry'
import type { BoxFace, CameraStateId } from '../types/shelter'
import { systems, useShelterStore } from '../store/useShelterStore'
import { ElevationRuler } from './ElevationRuler'
import { ConditionField, OperationsSheet, openMaintenance } from './OperationsSheet'
import { useOperationsStore } from '../store/useOperationsStore'
import { MepReadout } from './MepReadout'

const names: Record<CameraStateId, string> = {
  site: '现场',
  section: '剖面',
  sectionBox: '剖切盒',
  plan: '平面',
  floorOrbit: '楼层俯瞰',
  walkthrough: '漫游',
}
const drawings: Record<CameraStateId, string> = {
  site: '观测站与山地场址',
  section: '南向地质剖面',
  sectionBox: '建筑局部剖切',
  plan: '水平剖切平面',
  floorOrbit: '楼层轴测',
  walkthrough: '第一人称巡览',
}
const codes: Record<CameraStateId, string> = {
  site: 'S–101',
  section: 'A–201',
  sectionBox: 'A–202',
  plan: 'A–103',
  floorOrbit: 'A–301',
  walkthrough: 'W–101',
}
const labels = {
  power: '强电',
  data: '弱电与智控',
  water: '给排水',
  air: '三防新风',
  freight: '重载物流',
  structure: '结构与防护',
}
const boxNames: Record<BoxFace, string> = {
  west: '西',
  east: '东',
  bottom: '底',
  top: '顶',
  north: '北',
  south: '南',
}
const views: CameraStateId[] = ['site', 'section', 'sectionBox', 'plan', 'floorOrbit', 'walkthrough']
function Sheet({ close }: { close: () => void }) {
  const s = useShelterStore(),
    room = defaultBlueprint.rooms.find((r) => r.id === s.roomId)
  if (!room) return null
  const f = FLOORS[room.floorId],
    p = footprint(room.bounds),
    h = room.clearHeightOverride ?? f.clearHeight,
    unit = room.equipment.find((e) => e.tagCode === s.equipmentTag) ?? room.equipment[0],
    dive = s.cameraState === 'site' && room.floorId.startsWith('B')
  return (
    <section className="drawer room-sheet" aria-label="房间数据表">
      <div className="sheet-head">
        <b>{room.name}</b>
        <button onClick={close} aria-label="关闭数据表">
          ×
        </button>
      </div>
      <dl>
        {[
          ['楼层', f.id],
          ['面积', p.area + ' m²'],
          [
            '装机用电合计',
            Number(room.equipment.reduce((sum, u) => sum + u.inputPowerKw, 0).toFixed(3)) + ' kW',
          ],
          ['地面标高', f.elevation.toFixed(3) + ' m'],
          ['净高 / 夹层', h.toFixed(2) + ' / ' + (f.pitch - h - 0.3).toFixed(2) + ' m'],
          [
            '干湿分区',
            { dry: '干区', wet: '湿区', semi_wet: '半湿区', strict_dry_electrical: '绝对干区' }[
              room.wetDryZone
            ],
          ],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <label>
        设备位号
        <select
          aria-label="设备位号"
          value={unit.tagCode}
          onChange={(e) => s.focusRoom(room.id, e.target.value)}
        >
          {room.equipment.map((u) => (
            <option key={u.tagCode} value={u.tagCode}>
              {u.tagCode}　{u.name}
            </option>
          ))}
        </select>
      </label>
      <dl aria-label="设备设计工况">
        {[
          ['设备', unit.name],
          ['额定用电', unit.inputPowerKw + ' kW'],
          ...(unit.generatedPowerKw > 0 ? [['额定发电', unit.generatedPowerKw + ' kW']] : []),
          [
            '热电效率',
            unit.thermalEfficiency === null ? '不适用' : (unit.thermalEfficiency * 100).toFixed(1) + '%',
          ],
          ['散热负荷', Number(unit.heatKw.toFixed(2)) + ' kW'],
          ...(unit.heatRejectionKw ? [['额定排热能力', unit.heatRejectionKw + ' kW']] : []),
          ['额定产氧', unit.o2RateKgPerDay + ' kg/d'],
          ['宽 × 高 × 深', unit.moduleSizeM.join(' × ') + ' m'],
          ['设计质量', unit.weightKg.toLocaleString('zh-CN') + ' kg'],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="design-basis">概念设计额定值。{unit.notes}</p>
      <label>
        室内机位
        <select
          aria-label="室内机位"
          value={s.anchorIndex}
          onChange={(e) => s.selectAnchor(Number(e.target.value))}
        >
          {room.cameraAnchors.map((a, i) => (
            <option key={a.name} value={i}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <div className="sheet-actions">
        <button onClick={s.enterRoom}>
          {dive ? '竖井下潜' : '掀顶落地'}　进入漫游 <kbd>5</kbd>
        </button>
        <button onClick={() => openMaintenance(unit.tagCode)}>隔离检修</button>
      </div>
    </section>
  )
}
function WalkHud() {
  const floor = useShelterStore((s) => s.lastFloor)
  const send = (detail: object) => window.dispatchEvent(new CustomEvent('ars-walk', { detail }))
  return (
    <>
      <span className="crosshair" />
      <output id="equipment-sight" className="equipment-sight" />
      <div className="walk-map">
        <svg viewBox="-18 -14 36 28" aria-label="当前层平面与朝向">
          {roomsOn(floor).map((room) => {
            const r = footprint(room.bounds)
            return <rect key={room.id} x={r.x0} y={r.z0} width={r.w} height={r.d} />
          })}
          <g id="map-heading">
            <path d="M0 0 -1.7 3.6 1.7 3.6Z" />
            <circle r=".6" />
          </g>
        </svg>
        <span>
          {floor}　<span id="walk-altitude" />
        </span>
      </div>
      <button
        id="pressure-control"
        hidden
        className="pressure-control"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          send({ hold: true })
        }}
        onLostPointerCapture={() => send({ hold: false })}
      >
        <svg viewBox="0 0 36 24" width="36">
          <path d="M3 19a15 15 0 0 1 30 0" fill="none" stroke="currentColor" />
          <g id="pressure-hand">
            <path d="M18 18v-12" stroke="currentColor" />
          </g>
        </svg>
        <span id="pressure-text" />
      </button>
      <button
        className="joystick"
        aria-label="触屏移动摇杆"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          const r = e.currentTarget.getBoundingClientRect()
          send({
            x: Math.max(-1, Math.min(1, (2 * (e.clientX - r.left)) / r.width - 1)),
            y: Math.max(-1, Math.min(1, (2 * (e.clientY - r.top)) / r.height - 1)),
          })
        }}
        onLostPointerCapture={() => send({ x: 0, y: 0 })}
      >
        移动
      </button>
    </>
  )
}
export function Instruments() {
  const panel = useOperationsStore((s) => s.panel)
  const scenario = useOperationsStore((s) => s.scenario)
  const people = useOperationsStore((s) => s.people)
  const isolatedId = useOperationsStore((s) => s.isolatedId)
  const lockdown = useOperationsStore((s) =>
    s.lockdownStartedAt !== null ? 'running' : s.lockdownSeconds === 30 ? 'sealed' : 'open',
  )
  const s = useShelterStore(),
    [open, setOpen] = useState<'views' | 'help' | null>(null),
    [legend, setLegend] = useState<boolean | null>(null),
    [compact, setCompact] = useState(() => matchMedia('(max-width: 740px)').matches),
    [face, setFace] = useState<BoxFace>('east')
  const menu = useRef<HTMLDivElement>(null),
    [hint, setHint] = useState(() => {
      try {
        return !sessionStorage.getItem('ars-keys')
      } catch {
        return true
      }
    })
  const walk = s.cameraState === 'walkthrough',
    xray = s.mode === 'xray',
    context = s.cameraState !== 'site' || xray,
    showLayers = legend ?? (!walk && !compact)
  useEffect(() => {
    const query = matchMedia('(max-width: 740px)')
    const resize = () => setCompact(query.matches)
    query.addEventListener('change', resize)
    return () => query.removeEventListener('change', resize)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      setHint(false)
      try {
        sessionStorage.setItem('ars-keys', '1')
      } catch {
        /* private browsing */
      }
    }, 6500)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(null)
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [])
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return
      const v = useShelterStore.getState(),
        k = e.key.toLowerCase()
      if (k === 'escape') {
        if (open) {
          setOpen(null)
          return
        }
        if (useOperationsStore.getState().panel) {
          useOperationsStore.getState().open(null)
          return
        }
        if (v.waterTrace) {
          v.setWaterTrace(null)
          return
        }
        if (v.roomId) {
          v.focusRoom(null)
          return
        }
        if (v.cameraState === 'walkthrough') v.setView('floorOrbit')
        else if (v.cameraState !== 'site' || v.mode === 'xray') v.setView('site')
        return
      }
      if (
        (e.target as HTMLElement)?.matches('input:not([type=checkbox]),select,textarea,[role=slider]') &&
        !['h', '?'].includes(k)
      )
        return
      if (k === '[' || k === ']') {
        const index = FLOOR_ORDER.indexOf(v.lastFloor) + (k === '[' ? -1 : 1)
        v.selectFloor(FLOOR_ORDER[Math.max(0, Math.min(FLOOR_ORDER.length - 1, index))])
      } else if (k === '1') v.setView('site')
      else if (k === '2') v.setView('section')
      else if (k === '3') v.setView('plan')
      else if (k === '4') v.setMode('xray')
      else if (k === 'v') v.setView(views[(views.indexOf(v.cameraState) + 1) % views.length])
      else if (k === 'm') v.togglePlenum()
      else if (k === 'x') v.setMode(v.mode === 'xray' ? 'exterior' : 'xray')
      else if (k === '5') {
        if (v.roomId) v.enterRoom()
        else v.setView('walkthrough')
      } else if (k === 'f') v.refocus()
      else if (k === 'h') v.toggleHud()
      else if (k === '?') {
        if (!v.hud) v.toggleHud()
        setOpen((o) => (o === 'help' ? null : 'help'))
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [open])
  const night = xray || walk || s.time === '19:30' || s.time === '22:00'
  const title = s.routeOverview ? '检修搬运全程' : s.shot
    ? photo(s.shot).title
    : (siteFacilities.find((f) => f.id === s.facilityId)?.name ??
      (xray ? '竖井与平硐透视' : drawings[s.cameraState]))
  const lens = s.shot ? photo(s.shot).lens : s.cameraState === 'site' || s.cameraState === 'section' ? 65 : 35
  const projection = walk
    ? '透视 · ' + (s.shot ? lens : 60) + '°'
    : s.cameraState === 'plan' || (s.cameraState === 'section' && !s.sectionPerspective)
      ? '正交投影'
      : '透视 · ' + lens + ' mm'
  return (
    <div
      className={'hud' + (night ? ' night' : '')}
      hidden={!s.hud}
      data-scenario={scenario}
      data-people={people}
      data-lockdown={lockdown}
      data-isolation={isolatedId ?? ''}
    >
      <header className="title-block" aria-label="工程图签">
        <h1>磐石山脊高山生态与气象观测站</h1>
        <strong className="station-code">ARS-01</strong>
        <div className="drawing-name">
          <span className="sheet-code">{xray ? 'M–001' : codes[s.cameraState]}</span>
          <b>{walk ? <span id="walk-room">{title}</span> : title}</b>
        </div>
        <span className="numeric">{projection}</span>
        <span className="numeric">{walk ? <span id="flight-level" /> : '±0.000 = 海拔 1450.000 m'}</span>
        <ConditionField />
      </header>
      <div className="view-tools" ref={menu}>
        <nav className="tabs" aria-label="视图切换">
          {(['site', 'section', 'plan', 'xray', 'walkthrough'] as const).map((id, i) => (
            <button
              key={id}
              aria-pressed={id === 'xray' ? xray : !xray && s.cameraState === id}
              onClick={() => {
                id === 'xray' ? s.setMode('xray') : s.setView(id)
                setOpen(null)
              }}
            >
              {id === 'xray' ? 'X 光' : names[id]}
              <sup>{i + 1}</sup>
            </button>
          ))}
        </nav>
        <div className="tool-row">
          {(['health', 'maintenance'] as const).map((kind) => (
            <button
              key={kind}
              aria-pressed={panel === kind}
              onClick={() => {
                setOpen(null)
                useOperationsStore.getState().open(panel === kind ? null : kind)
              }}
            >
              {kind === 'health' ? '工程体检' : '模拟隔离检修'}
            </button>
          ))}
          <button aria-expanded={open === 'views'} onClick={() => setOpen(open === 'views' ? null : 'views')}>
            机位与图幅 ▾
          </button>
          <button aria-label="快捷键" onClick={() => setOpen(open === 'help' ? null : 'help')}>
            ?
          </button>
        </div>
        {open === 'views' && (
          <div className="drawer view-menu">
            <div className="subviews">
              {(['sectionBox', 'floorOrbit'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    s.setView(v)
                    setOpen(null)
                  }}
                >
                  {names[v]}
                </button>
              ))}
              <button
                onClick={() => {
                  s.frame('panorama')
                  setOpen(null)
                }}
              >
                场址总览
              </button>
            </div>
            {walk && s.lastFloor === 'B2' && (
              <button aria-pressed={s.walkCeiling} onClick={s.toggleWalkCeiling}>
                {s.walkCeiling ? '收起' : '显示'} B2 吊顶与灯槽
              </button>
            )}
            <label>
              定位外围设施
              <select
                aria-label="定位外围设施"
                value={s.facilityId ?? ''}
                onChange={(e) => {
                  if (e.target.value) {
                    s.focusFacility(Number(e.target.value))
                    setOpen(null)
                  }
                }}
              >
                <option value="">选择测点</option>
                {siteFacilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {String(f.id).padStart(2, '0')}　{f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              房间索引
              <select
                aria-label="房间索引"
                value={s.roomId ?? ''}
                onChange={(e) => {
                  s.focusRoom(e.target.value || null)
                  setOpen(null)
                }}
              >
                <option value="">选择房间</option>
                {FLOOR_ORDER.map((id) => (
                  <optgroup key={id} label={id}>
                    {roomsOn(id).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              固定摄影机位
              <select
                aria-label="固定摄影机位"
                value={s.shot ?? ''}
                onChange={(e) => {
                  if (e.target.value) {
                    s.photograph(e.target.value as ShotId)
                    setOpen(null)
                  }
                }}
              >
                <option value="">选择机位</option>
                {Object.entries(photographs).map(([id, p]) => (
                  <option key={id} value={id}>
                    {id.startsWith('shot-') && `${id.slice(5)}　`}{p.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {open === 'help' && (
          <div className="drawer help">
            <b>键盘与漫游</b>
            <dl>
              {[
                ['1–5', '现场 / 剖面 / 平面 / X 光 / 漫游'],
                ['[ / ]', '上一层 / 下一层'],
                ['V / X', '循环视图 / X 光'],
                ['M / F / H', '夹层 / 聚焦 / 隐藏图签'],
                ['Esc', '打断过渡 / 拉出'],
                ['WASD / ⇧', '水平飞行或步行 / 加速'],
                ['Q / E', '透视视角下降 / 上升'],
                ['点地 / 拖动', '移动 / 转头，双击锁定鼠标'],
                ['长按 E', '气闸平压开门'],
                ['按住 Alt', '透视墙面与吊顶。走廊仰视超过 30° 可看夹层'],
                ['点管 / 悬停阀门', '追踪水路 / 查看下游房间'],
              ].map(([k, t]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{t}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
      {!walk && <ElevationRuler />}
      {context && !s.routeOverview && (
        <aside className={'legend' + (walk ? ' walk-legend' : '') + (showLayers ? ' open' : '')}>
          <button className="legend-title" aria-expanded={showLayers} onClick={() => setLegend(!showLayers)}>
            线型图例 <span>{showLayers ? '−' : '＋'}</span>
          </button>
          <div className="legend-items" hidden={!showLayers}>
            {systems.map((id) => (
              <label key={id}>
                <input
                  checked={s.layers[id]}
                  type="checkbox"
                  onChange={() => s.toggleLayer(id)}
                />
                <i className={'swatch ' + id} />
                {labels[id]}
              </label>
            ))}
            <label>
              <input type="checkbox" checked={s.plenum} onChange={s.togglePlenum} />
              <i className="swatch plenum" />
              机电夹层 <kbd>M</kbd>
            </label>
          </div>
        </aside>
      )}
      {s.cameraState === 'section' && (
        <div className="cut-tools">
          <label>
            剖面位置 <output>Z {s.sectionZ.toFixed(2)} m</output>
            <input
              aria-label="剖面位置"
              type="range"
              min="-9"
              max="8"
              step=".25"
              value={s.sectionZ}
              onChange={(e) => s.setSectionZ(+e.target.value)}
            />
          </label>
          <button onClick={s.toggleProjection}>{s.sectionPerspective ? '切至正交' : '切至透视'}</button>
          <small>＋ 花岗岩　△ 混凝土　▽ 水位</small>
        </div>
      )}
      {s.cameraState === 'sectionBox' && !s.routeOverview && (
        <div className="cut-tools">
          <label>
            剖切盒{' '}
            <select aria-label="剖切面" value={face} onChange={(e) => setFace(e.target.value as BoxFace)}>
              {Object.entries(boxNames).map(([k, n]) => (
                <option value={k} key={k}>
                  {n}面
                </option>
              ))}
            </select>{' '}
            <output>{s.box[face].toFixed(2)} m</output>
            <input
              aria-label="剖切面位置"
              type="range"
              min={
                ['bottom', 'top'].includes(face)
                  ? boxLimits.bottom
                  : ['east', 'west'].includes(face)
                    ? boxLimits.west
                    : boxLimits.north
              }
              max={
                ['bottom', 'top'].includes(face)
                  ? boxLimits.top
                  : ['east', 'west'].includes(face)
                    ? boxLimits.east
                    : boxLimits.south
              }
              step=".1"
              value={s.box[face]}
              onChange={(e) => s.setBoxFace(face, +e.target.value)}
            />
          </label>
        </div>
      )}
      {!walk && hint && !context && <span className="key-hint">按 V 切换视图　? 查看按键</span>}
      <div className="readouts">
        <div className="compass">
          <svg viewBox="0 0 32 36" width="32" height="36" aria-label="指北针">
            <g id="north-needle">
              <text x="16" y="8" textAnchor="middle">
                N
              </text>
              <path d="M16 11 21 28 16 24 11 28Z" fill="none" stroke="currentColor" />
              <path d="M16 11v13l-5 4Z" fill="currentColor" />
            </g>
          </svg>
        </div>
        <span id="cursor-coords">X —　 Z —　 ▽ —　 轴 —</span>
        <div className="ruler-scale" id="scale-bar">
          <div className="marks">
            <i />
            <i />
            <i />
          </div>
          <span>0</span>
          <span id="scale-quarter" />
          <span id="scale-half" />
          <span id="scale-full" />
        </div>
      </div>
      {walk && <WalkHud />}
      {panel ? (
        <OperationsSheet key={panel} />
      ) : (
        <>
          {s.roomId && !s.hoveredValve && <Sheet close={() => s.focusRoom(null)} />}
          <MepReadout />
        </>
      )}
    </div>
  )
}
