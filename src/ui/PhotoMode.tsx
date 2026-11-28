import { photoAspects, usePhotoMode, type PhotoAspect } from '../store/usePhotoMode'
import '../styles/photo.css'

export function PhotoButton() {
  const active = usePhotoMode(s => s.active)
  const busy = usePhotoMode(s => s.exporting)
  return <button aria-pressed={active} disabled={busy}
    onClick={() => usePhotoMode.setState({ active: !active, message: '' })}>拍照</button>
}

export function PhotoFrame() {
  const { active, aspect, shift, exporting, message } = usePhotoMode()
  if (!active) return null
  return <>
    <div className="photo-mat" aria-hidden="true">
      <div style={{ width: `min(100vw, ${photoAspects[aspect] * 100}dvh)`, aspectRatio: photoAspects[aspect] }} />
    </div>
    <section className="photo-controls drawer" aria-label="摄影设置">
      <label>取景画幅
        <select aria-label="取景画幅" value={aspect} disabled={exporting}
          onChange={event => usePhotoMode.setState({ aspect: event.target.value as PhotoAspect, message: '' })}>
          {Object.keys(photoAspects).map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label><input type="checkbox" checked={shift} disabled={exporting}
        onChange={event => usePhotoMode.setState({ shift: event.target.checked })} />垂直校正</label>
      <button disabled={exporting} onClick={() => {
        if (usePhotoMode.getState().exporting) return
        usePhotoMode.setState({ exporting: true, message: '' })
        window.dispatchEvent(new Event('ars-export-photo'))
      }}>{exporting ? '曝光中…' : '导出 PNG'}</button>
      {message && <output aria-live="polite">{message}</output>}
    </section>
  </>
}
