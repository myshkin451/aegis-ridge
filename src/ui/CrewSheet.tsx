import { useEffect, useState } from 'react'
import { crew, crewById, type CrewMember } from '../data/crew'
import { siteFacilities } from '../data/siteFacilities'
import { bedrooms } from '../geometry/residentialPlan'
import { closeCrew, selectMember, startTour, toggleCrew, useCrewTour } from '../store/useCrewTour'
import { useOperationsStore } from '../store/useOperationsStore'
import { useShelterStore } from '../store/useShelterStore'
import '../styles/crew.css'

const networkNames = {
  power: '强电桥架', data: '通信桥架', supply: '给水', drain: '重力排水', vacuum: '真空排污',
  airSupply: '送风', airReturn: '回排风', exhaust: '专用排气', hydrogen: '氢气', heat: '热媒水',
  freight: '重载吊轨', structure: '结构边界',
}
declare const __CREW_PORTRAITS__: string[]

function Badge({ member }: { member: CrewMember }) {
  const index = String(crew.indexOf(member) + 1).padStart(2, '0')
  const file = 'crew_' + index + '.png'
  const [failedFile, setFailed] = useState('')
  if (__CREW_PORTRAITS__.includes(file) && failedFile !== file)
    return <img className="crew-portrait" width="46" height="56" src={import.meta.env.BASE_URL + 'assets/crew/' + file}
      alt={member.name} onError={() => setFailed(file)} />
  return <span className="crew-badge" aria-label={'人员编号 ' + index}><b>{index}</b></span>
}
export function CrewButton({ onToggle }: { onToggle?: () => void }) {
  const open = useCrewTour(s => s.panel)
  return <button aria-pressed={open} aria-controls="crew-sheet" onClick={() => { onToggle?.(); toggleCrew() }}>专家团</button>
}

export function CrewSheet() {
  const panel = useCrewTour(s => s.panel)
  const rooms = useOperationsStore(s => s.rooms)
  const roomName = (id: string) => rooms.find(r => r.id === id)?.name ?? id
  const selected = useCrewTour(s => s.selected)
  const member = selected ? crewById.get(selected) : undefined
  useEffect(() => {
    if (!panel) return
    const ops = useOperationsStore.subscribe((s) => { if (s.panel) closeCrew() })
    const focus = useShelterStore.subscribe((s, p) => {
      if (s.roomId && s.roomId !== p.roomId) closeCrew()
    })
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      closeCrew()
    }
    window.addEventListener('keydown', escape, true)
    return () => { ops(); focus(); window.removeEventListener('keydown', escape, true) }
  }, [panel])
  if (!panel || !member) return null
  const cabin = bedrooms.find(b => b.id === member.bedroomId)!
  function locateRoom(id: string) {
    const room = rooms.find(r => r.id === id)!
    useShelterStore.getState().setView('plan')
    useShelterStore.getState().selectFloor(room.floorId)
  }
  return <aside id="crew-sheet" className="drawer room-sheet crew-sheet" aria-label="专家团">
    <header className="sheet-head"><h2>专家团</h2><button aria-label="关闭专家团" onClick={closeCrew}>×</button></header>
    <div className="crew-roster" aria-label="人员名册">
      {crew.map((c, i) => <button key={c.id} data-crew-id={c.id} aria-pressed={member === c}
        data-partner={member.partners.includes(c.id)} onClick={() => selectMember(c.id)}>
        <small>{String(i + 1).padStart(2, '0')}</small>{c.name}
      </button>)}
    </div>
    <div className="crew-identity"><Badge member={member}/><div><h3>{member.name}</h3><p>{member.role}</p></div></div>
    <dl>
      <dt>主专业</dt><dd>{member.primary}</dd>
      <dt>副专业</dt><dd>{member.support.join('、')}</dd>
      <dt>互助搭档</dt><dd>{member.partners.map((id, i) => <span key={id}>{i ? '、' : ''}<button className="crew-link" onClick={() => selectMember(id)}>{crewById.get(id)!.name}</button></span>)}</dd>
      <dt>住舱</dt><dd>B2 · {cabin.name}{cabin.beds === 2 ? ' · ' + ['A', 'B'][member.bedIndex] + ' 床' : ''}</dd>
      <dt>责任区</dt><dd className="crew-areas">{member.roomIds.map(id =>
        <button className="crew-link" key={id} onClick={() => locateRoom(id)}>{roomName(id)}</button>)}
        {member.sites.map(kind => { const place = siteFacilities.find(s => s.kind === kind)!
          return <button className="crew-link" key={kind} onClick={() => useShelterStore.getState().focusFacility(place.id)}>{place.name}</button>
        })}</dd>
      <dt>管网</dt><dd>{[...(member.network.station ?? []), ...(member.network.branches ?? [])].map(k => networkNames[k]).join('、')}</dd>
    </dl>
    <ol>{member.route.map(step => <li key={step.roomId}>{step.roomId.slice(0, 2).toUpperCase()} · {roomName(step.roomId)}</li>)}</ol>
    <button data-morning onClick={() => startTour('inspection')}>晨间巡检 <span aria-hidden="true">→</span></button>
  </aside>
}
export function TourCaption() {
  const caption = useCrewTour(s => s.caption)
  const tour = useCrewTour(s => s.tour)
  const selected = useCrewTour(s => s.selected)
  if (!caption || tour === 'idle') return null
  return <div className="tour-caption" role="status">
    <b>{tour === 'opening' ? '开场' : (crewById.get(selected ?? '')?.name ?? '') + ' · 晨间巡检'}</b>
    <span>{caption}</span>
  </div>
}
