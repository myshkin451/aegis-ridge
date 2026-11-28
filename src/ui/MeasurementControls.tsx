import { dimensionText, useMeasurements } from '../store/useMeasurements'
import '../styles/measurement.css'

export function MeasurementControls() {
  const s = useMeasurements()
  const last = s.dimensions.at(-1)
  return (
    <section className="measure-controls" aria-label="两点测距">
      <div className="measure-actions">
        <button type="button" aria-pressed={s.enabled} onClick={s.toggle}>{s.enabled ? '结束测距' : '开始测距'}</button>
        <button type="button" disabled={!s.start && !last} onClick={s.clear}>清除标尺</button>
      </div>
      <label className="measure-reference">图纸吸附
        <select aria-label="图纸吸附" value={s.reference} onChange={e => useMeasurements.setState({
          reference: e.target.value === 'grid' ? 'grid' : 'physical', start: null, message: '',
        })}>
          <option value="physical">实墙面、门框与设备</option>
          <option value="grid">房界、井界与楼板标高</option>
        </select>
      </label>
      {s.enabled && <p>在图中点选{s.start ? '终点' : '起点'}。平面和剖面的尺寸沿当前剖切面量取。</p>}
      <output aria-live="polite">
        {s.message || (s.start ? '起点 · ' + s.start.feature : last ? '第 ' + s.dimensions.length + ' 段　' + dimensionText(last) : '')}
      </output>
      {last && !s.start && <p className="measure-features">{last.a.feature} → {last.b.feature}</p>}
    </section>
  )
}
