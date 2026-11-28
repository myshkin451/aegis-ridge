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
  const playing = useShiftClock(s => s.playing)
  const time = useShelterStore(s => s.time)
  return <div className="day-clock" aria-label="堡垒时钟">
    <button aria-label="延时播放" aria-pressed={playing}
      onClick={() => useShiftClock.setState({ playing: !playing })}>{playing ? 'Ⅱ' : '▷'}</button>
    <output>{time}</output>
    <input type="range" aria-label="24 小时时间轴" aria-valuetext={time} min="0" max="1439"
      value={minutesAt(time)} onChange={e => { useShiftClock.setState({ playing: false }); setMinute(+e.target.value) }}/>
    <span>24 h</span>
  </div>
}
