import { useRef, useState } from 'react'
import { defaultBlueprint } from '../data/defaultBlueprint'
import { blueprintSizeLimit } from '../data/blueprintDocument'
import { roomTemplates } from '../data/roomTemplates'
import { footprint } from '../geometry/coords'
import {
  createViewLink, exportBlueprintJson, importBlueprintJson, resetBlueprint, useBlueprintNotice,
} from '../store/blueprintSession'
import { useOperationsStore } from '../store/useOperationsStore'
import { useShelterStore } from '../store/useShelterStore'
import { MeasurementControls } from './MeasurementControls'
import '../styles/blueprint.css'

const hostIds = new Set([...roomTemplates.flatMap(t => t.roomIds), ...roomTemplates.flatMap(t => t.trialRoomIds)])
const hosts = Array.from(hostIds, id => defaultBlueprint.rooms.find(r => r.id === id)!)
const pages = ['房间模块', '两点测距', '存取与分享'] as const
type Page = typeof pages[number]

function RoomExperiment() {
  const state = useOperationsStore()
  const focused = useShelterStore.getState().roomId
  const [host, setHost] = useState(() => hosts.find(r => r.id === focused) ?? hosts[0])
  const choices = roomTemplates.filter(t => t.roomIds.includes(host.id) || t.trialRoomIds.includes(host.id))
  const installed = state.roomChanges[host.id] ?? ''
  const [choice, setChoice] = useState(installed || choices[0].id)
  const proposed = choices.find(t => t.id === choice)
  const room = state.rooms.find(r => r.id === host.id)!
  const rect = footprint(host.bounds)
  const dryCheck = state.report.rows.find(row => row.id === 'dry-stack')
  const [issue, setIssue] = useState('')

  function apply() {
    try {
      const next = { ...state.roomChanges }
      if (proposed) next[host.id] = proposed.id
      else delete next[host.id]
      state.setRoomChanges(next)
      const view = useShelterStore.getState()
      const equipment = useOperationsStore.getState().rooms.find(r => r.id === host.id)?.equipment
      const trial = proposed?.trialRoomIds.includes(host.id)
      view.inspect(host.id, (trial ? equipment?.at(-1) : equipment?.[0])?.tagCode)
      setIssue('')
    } catch (error) { setIssue(error instanceof Error ? error.message : '房间配置无效。') }
  }
  return <section aria-label="受控模块替换" className="module-experiment">
    <label>安装位置
      <select value={host.id} onChange={e => {
        const target = hosts.find(r => r.id === e.target.value)!
        setHost(target)
        setChoice(state.roomChanges[target.id] ?? roomTemplates.find(t =>
          t.roomIds.includes(target.id) || t.trialRoomIds.includes(target.id))!.id)
        setIssue('')
      }}>
        {hosts.map(r => <option key={r.id} value={r.id}>{r.floorId} · {r.name}</option>)}
      </select>
    </label>
    <dl>
      <div><dt>原有网格</dt><dd>{rect.w} × {rect.d} m · {rect.area} m²</dd></div>
      <div><dt>当前安装</dt><dd data-testid="installed-room">{room.name}</dd></div>
    </dl>
    <label>替换为
      <select value={choice} onChange={e => setChoice(e.target.value)}>
        <option value="">v2.0 原有房间</option>
        {choices.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
    {proposed && <p className="module-basis">{proposed.description}</p>}
    {proposed?.trialRoomIds.includes(host.id) &&
      <p className="engineering-error">东北干区试装。应用后可检查湿作业与下层电气房的垂直冲突。</p>}
    <button type="button" className="apply-module" disabled={choice === installed} onClick={apply}>
      {proposed ? '应用模块' : '恢复该房间'}
    </button>
    {issue && <p role="alert" className="engineering-error">{issue}</p>}
    <h3>当前工程读数</h3>
    <dl className="module-results">
      {state.report.rows.filter(row => ['power', 'battery', 'heat', 'calories', 'oxygen', 'dry-stack'].includes(row.id))
        .map(row => <div key={row.id} data-check={row.id}><dt>{row.label}</dt>
          <dd><span data-status={row.status}>{row.status}</span> {row.value}</dd></div>)}
    </dl>
    {dryCheck?.status === 'FAIL' && <p className="engineering-error">{dryCheck.detail}</p>}
  </section>
}

function BlueprintFiles() {
  const file = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [link, setLink] = useState('')
  function result(message: string, failed = false) {
    setFailed(failed)
    setMessage(message)
  }
  async function importFile(blob?: File) {
    if (!blob) return
    try {
      if (blob.size > blueprintSizeLimit) throw Error('蓝图超过 64 KiB，请选择 v2.0 工程配置 JSON。')
      importBlueprintJson(await blob.text())
      setLink('')
      result('已导入蓝图并重算工程体检。')
    } catch (error) { result(error instanceof Error ? error.message : '无法读取蓝图文件。', true) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([exportBlueprintJson()], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'ARS-01-v2.0.json'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    result('已导出当前工程配置。')
  }
  async function share() {
    try {
      const url = createViewLink()
      setLink(url)
      try {
        await navigator.clipboard.writeText(url)
        result('已复制当前视角链接。')
      } catch { result('链接已生成，可以从下方复制。') }
    } catch (error) { result(error instanceof Error ? error.message : '无法读取当前相机。', true) }
  }
  return <section className="blueprint-files" aria-label="蓝图存取与分享">
    <h3>视角链接</h3>
    <p>保存此刻的镜头、剖切、时间和工程配置。</p>
    <button onClick={share}>复制当前视角</button>
    {link && <input aria-label="视角链接" readOnly value={link} onFocus={e => e.target.select()} />}
    <h3>工程配置 JSON</h3>
    <p>房间模块、工况、人数与检修隔离会自动保存在此浏览器。</p>
    <div className="file-actions">
      <button onClick={download}>导出 JSON</button>
      <button onClick={() => file.current?.click()}>导入 JSON</button>
      <input type="file" ref={file} hidden accept=".json,application/json" aria-label="蓝图 JSON 文件"
        onChange={e => { void importFile(e.target.files?.[0]); e.target.value = '' }} />
    </div>
    <button onClick={() => { resetBlueprint(); setLink(''); result('已恢复 v2.0 基准设计。') }}>
      恢复 v2.0 基准设计
    </button>
    {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'engineering-error' : ''}>{message}</p>}
  </section>
}

export function BlueprintNotice() {
  const notice = useBlueprintNotice(s => s.message)
  return notice ? <p className="blueprint-notice drawer" role="alert">{notice}</p> : null
}

export function BlueprintSheet() {
  const [page, setPage] = useState<Page>('房间模块')
  return <section className="drawer room-sheet operations-sheet blueprint-sheet" aria-label="蓝图工具">
    <header className="sheet-head"><h2>蓝图工具</h2>
      <button aria-label="关闭蓝图工具" onClick={() => useOperationsStore.getState().open(null)}>×</button>
    </header>
    <nav aria-label="蓝图工具选择">{pages.map(item =>
      <button key={item} aria-pressed={page === item} onClick={() => setPage(item)}>{item}</button>)}</nav>
    {page === '房间模块' ? <RoomExperiment /> : page === '两点测距' ? <MeasurementControls /> : <BlueprintFiles />}
  </section>
}
