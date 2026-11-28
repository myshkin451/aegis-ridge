import { useEffect } from 'react'
import { minutesAt, setMinute, useShiftClock } from '../store/useShiftClock'
import { useShelterStore } from '../store/useShelterStore'
import { usePhotoMode } from '../store/usePhotoMode'

export function useClockPlayback() {
  const playing = useShiftClock(s => s.playing)
  useEffect(() => {
    if (!playing) return
    // Six simulated hours per real minute. Pausing or hiding the page stops the clock.
    let last = performance.now(), remainder = 0
    const timer = window.setInterval(() => {
      const now = performance.now()
      if (!document.hidden && !usePhotoMode.getState().exporting) {
        remainder += Math.min(now - last, 500) * 0.006
        const step = Math.floor(remainder)
        if (step) {
          setMinute(minutesAt(useShelterStore.getState().time) + step)
          remainder -= step
        }
      }
      last = now
    }, 125)
    return () => clearInterval(timer)
  }, [playing])
}

export function ShiftClock() {
  const { playing, sound, motion } = useShiftClock()
  const time = useShelterStore(s => s.time)
  return (
    <fieldset className="shift-clock">
      <legend>站内时钟</legend>
      <label className="clock-slider">
        <output>{time}</output>
        <input aria-label="24 小时时间轴" aria-valuetext={time} type="range" min="0" max="1439"
          value={minutesAt(time)} onChange={e => { useShiftClock.setState({ playing: false }); setMinute(+e.target.value) }}/>
      </label>
      <div className="clock-controls">
        <button aria-label="延时播放" aria-pressed={playing} onClick={() => useShiftClock.setState({ playing: !playing })}>
          {playing ? '暂停' : '延时播放'} · 360×
        </button>
        <label><input type="checkbox" checked={motion} onChange={e => useShiftClock.setState({ motion: e.target.checked })}/> 轻动态</label>
        <label><input type="checkbox" checked={sound} onChange={e => useShiftClock.setState({ sound: e.target.checked })}/> 声景</label>
      </div>
    </fieldset>
  )
}
