import { defaultBlueprint } from '../data/defaultBlueprint'
import { useEffect, useRef, useState } from 'react'
import { FLOOR_ORDER } from '../data/floors'
import { photo, photographs, type ShotId } from '../data/photographs'
import { createViewLink, useShareNotice } from '../store/viewSession'
import { useOperationsStore } from '../store/useOperationsStore'
import { useShelterStore } from '../store/useShelterStore'
import { startTour } from '../store/useOpeningTour'
import { useShiftClock } from '../store/useShiftClock'
import type { CameraStateId } from '../types/shelter'
import { ElevationRuler } from './ElevationRuler'
import { FortressStatus, ScenarioField } from './FortressStatus'
import { PhotoButton, PhotoFrame } from './PhotoMode'
import { ShiftClock, useClockPlayback } from './ShiftClock'
import { WalkHud } from './WalkHud'
import '../styles/fortress.css'

const names: Record<CameraStateId, string> = {
  site: '外景', section: '剖面', plan: '平面', walkthrough: '漫游', floorOrbit: '楼层俯瞰', sectionBox: '局部剖切',
}
const views = ['site', 'section', 'plan', 'walkthrough'] as const
type Menu = 'status' | 'rooms' | 'help' | 'share'

function goToView(id: CameraStateId) {
  const s = useShelterStore.getState()
  if (id === 'walkthrough' && s.roomId) s.enterRoom()
  else s.setView(id)
}

export function Instruments() {
  useClockPlayback()
  const s = useShelterStore()
  const rooms = defaultBlueprint.rooms
  const scenario = useOperationsStore(o => o.scenario)
  const lockdown = useOperationsStore(o => o.lockdownStartedAt !== null ? 'running' : o.lockdownSeconds === 30 ? 'sealed' : 'open')
  const notice = useShareNotice(o => o.message)
  const sound = useShiftClock(o => o.sound)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [link, setLink] = useState('')
  const [receipt, setReceipt] = useState('')
  const tools = useRef<HTMLDivElement>(null)
  const walk = s.cameraState === 'walkthrough'
  const room = rooms.find(r => r.id === s.roomId)
  const location = s.shot ? photo(s.shot).title : s.floor === 'ALL' ? names[s.cameraState] : s.lastFloor + ' · ' + names[s.cameraState]
  const toggle = (id: Menu) => setMenu(v => v === id ? null : id)
  useEffect(() => {
    if (!menu) return
    const outside = (e: PointerEvent) => {
      if (!tools.current?.contains(e.target as Node)) setMenu(null)
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [menu])
  useEffect(() => {
    if (!receipt) return
    const timer = window.setTimeout(() => setReceipt(''), 3200)
    return () => clearTimeout(timer)
  }, [receipt])
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return
      const v = useShelterStore.getState(), k = e.key.toLowerCase()
      if (k === 'escape') {
        if (menu) setMenu(null)
        else if (v.roomId) v.focusRoom(null)
        else if (v.cameraState === 'walkthrough') v.setView('floorOrbit')
        else v.setView('site')
      } else if ((e.target as HTMLElement)?.matches('input,select,textarea,[role=slider]')) return
      else if (['1','2','3','4'].includes(k)) { goToView(views[Number(k) - 1]); setMenu(null) }
      else if (k === '[' || k === ']') {
        const index = FLOOR_ORDER.indexOf(v.lastFloor) + (k === '[' ? -1 : 1)
        v.selectFloor(FLOOR_ORDER[Math.max(0, Math.min(FLOOR_ORDER.length - 1, index))])
      } else if (k === 'h') v.toggleHud()
      else if (k === '?') setMenu(m => m === 'help' ? null : 'help')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [menu])
  async function share() {
    try {
      let arrival = ''
      const url = createViewLink(floor => { arrival = '链接将在 ' + floor + ' 到站后的轿厢内打开' })
      try { await navigator.clipboard.writeText(url); setMenu(null); setReceipt(arrival ? '已复制 · ' + arrival : '视角链接已复制') }
      catch { setLink(url); setMenu('share'); setReceipt(arrival) }
    } catch (error) { setReceipt(error instanceof Error ? error.message : '当前视角尚未就绪') }
  }
  return <div className={'hud fortress' + (walk || s.mode === 'xray' || s.time < '06:00' || s.time >= '18:30' ? ' night' : '')}
    hidden={!s.hud} data-scenario={scenario} data-lockdown={lockdown}>
    <header className="title-block">
      <h1>磐石山脊 · 私人高山堡垒</h1>
      <div className="title-line"><span>{walk ? <><b>{s.lastFloor}</b> · <span id="walk-room">电梯厅</span></> : location}</span><ScenarioField /></div>
    </header>
    <div className="view-tools" ref={tools}>
      <nav className="tabs" aria-label="主视角">
        {views.map((id, i) => <button key={id} aria-pressed={s.cameraState === id}
          onClick={() => { goToView(id); setMenu(null) }}>{names[id]} <sup>{i + 1}</sup></button>)}
      </nav>
      <div className="tool-row">
        <button aria-expanded={menu === 'status'} onClick={() => toggle('status')}>堡垒状态</button>
        <button aria-expanded={menu === 'rooms'} onClick={() => toggle('rooms')}>房间直达</button>
        <PhotoButton /><button onClick={share}>分享视角</button>
        <button aria-label="键位" aria-expanded={menu === 'help'} onClick={() => toggle('help')}>?</button>
      </div>
      {menu === 'status' && <FortressStatus close={() => setMenu(null)} />}
      {menu === 'share' && <div className="drawer view-menu"><label>复制视角链接<input aria-label="视角链接" value={link}
        readOnly autoFocus onFocus={e => e.currentTarget.select()}/></label></div>}
      {menu === 'rooms' && <div className="drawer view-menu">
        <label>房间直达<select aria-label="房间索引" value="" onChange={e => {
          s.focusRoom(e.target.value); s.enterRoom(); setMenu(null)
        }}><option value="" disabled>选择房间</option>{FLOOR_ORDER.map(id => <optgroup key={id} label={id}>
          {rooms.filter(r => r.floorId === id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>)}</select></label>
        <div className="lobby-shortcuts">
          <button onClick={() => { s.enterLobby('passenger', s.lastFloor); setMenu(null) }}>{s.lastFloor} 客梯厅</button>
          <button onClick={() => { s.enterLobby('freight', 'L1'); setMenu(null) }}>L1 货梯厅</button>
        </div>
        <label>摄影机位<select aria-label="固定摄影机位" value={s.shot ?? ''} onChange={e => {
          s.photograph(e.target.value as ShotId); setMenu(null)
        }}><option value="" disabled>选择机位</option>{Object.entries(photographs).map(([id, p]) =>
          <option key={id} value={id}>{p.title}</option>)}</select></label>
      </div>}
      {menu === 'help' && <div className="drawer help"><b>键位与漫游</b><dl>{[
        ['1 / 2 / 3 / 4', '外景 / 剖面 / 平面 / 漫游'], ['[ / ]', '上层 / 下层'], ['WASD / Shift', '移动 / 加速'],
        ['拖动 / 点地', '环顾 / 走到落点'], ['长按 E', '气闸平压'], ['走进电梯', '按楼层键乘梯'],
        ['H / O', '隐藏界面 / 播放开场导览'], ['Esc', '关闭或退出视角'],
      ].map(([key,label]) => <div key={key}><dt>{key}</dt><dd>{label}</dd></div>)}</dl>
        <button className="tour-play" onClick={() => { setMenu(null); startTour() }}>播放开场导览</button>
        <label><input type="checkbox" checked={sound} onChange={e => useShiftClock.setState({sound:e.target.checked})}/> 开启声景</label>
      </div>}
    </div>
    {!walk && <ElevationRuler />}
    {s.cameraState === 'section' && <label className="section-slider">剖面 <output>{s.sectionZ.toFixed(2)} m</output>
      <input aria-label="剖面位置" type="range" min="-9" max="8" step=".25" value={s.sectionZ} onChange={e => s.setSectionZ(+e.target.value)}/>
    </label>}
    {walk && <WalkHud />}
    {room && !menu && <section className="drawer room-sheet" aria-label="房间">
      <header className="sheet-head"><h2>{room.floorId} · {room.name}</h2><button aria-label="关闭房间" onClick={() => s.focusRoom(null)}>×</button></header>
      <label>室内机位<select value={s.anchorIndex} onChange={e => s.selectAnchor(+e.target.value)}>{room.cameraAnchors.map((a,i) =>
        <option key={a.name} value={i}>{a.name}</option>)}</select></label>
      <button onClick={s.enterRoom}>进入漫游</button>
    </section>}
    <ShiftClock />
    {(receipt || notice) && <output className="share-receipt" role="status">{receipt || notice}</output>}
    <PhotoFrame />
  </div>
}
