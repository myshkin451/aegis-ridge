import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { useOpeningTour, startTour, stopTour } from '../../store/useOpeningTour'
import { useOperationsStore } from '../../store/useOperationsStore'
import { useShelterStore } from '../../store/useShelterStore'
import type { SurveyRuntime } from './runtime'

export const openingCues = [
  [0, '黎明，云层停在堡垒下方。'],
  [10, '沿南侧平台接近堡垒入口。'],
  [20, '南向剖面展开，地表以下是四层工程空间。'],
  [31, '抵达 B2 电梯厅，餐厅在走廊西侧。'],
  [40, '餐厅的阅读角和共餐长桌已亮灯。'],
  [49, '从餐桌走向开放厨房。'],
  [60, '启动封锁，外侧设施依次关闭。'],
  [65, '封锁 · 第 1 天'],
  [70, '返回山脊外景。'],
] as const
function openingShot(index: number) {
  const view = useShelterStore.getState(), op = useOperationsStore.getState()
  switch (index) {
    case 0: view.photograph('shot-02'); break
    case 1: view.focusFacility(4); break
    case 2: view.setView('section'); break
    case 3:
      useShelterStore.setState({ lastFloor: 'B2' })
      view.setView('walkthrough')
      break
    case 4:
      view.photograph('pilot-commons')
      useShelterStore.setState({ time: '06:40' })
      break
    case 5:
      view.photograph('b2-open-kitchen')
      break
    case 6: op.setScenario('fallout'); view.focusFacility(4); break
    case 7: op.skip(); break
    case 8: view.frame('surface'); break
  }
}
const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.matches('textarea, input:not([type]), input:is([type=text],[type=search],[type=number],[type=email],[type=url],[type=password],[type=tel]), [contenteditable=true]')

export function TourDirector({ rt }: { rt: SurveyRuntime }) {
  const canvas = useThree(s => s.gl.domElement)
  const play = useRef({ run: -1, start: 0, cue: -1, stationDistance: 0 })
  useEffect(() => {
    const cancel = () => {
      if (useOpeningTour.getState().tour === 'idle') return
      rt.interrupt?.()
      stopTour(true)
    }
    const key = (e: KeyboardEvent) => {
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing &&
          e.key.toLowerCase() === 'o' && !editable(e.target)) {
        e.preventDefault()
        cancel()
        startTour()
      } else {
        const active = useOpeningTour.getState().tour !== 'idle'
        cancel()
        if (active && e.key === 'Escape') {
          e.preventDefault()
          e.stopImmediatePropagation()
        }
      }
    }
    const hide = () => { if (document.hidden) cancel() }
    const blur = (e: FocusEvent) => { if (e.target === window) cancel() }
    const events = ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart'] as const
    events.forEach(type => window.addEventListener(type, cancel, true))
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', key, true)
    document.addEventListener('visibilitychange', hide)
    const sync = () => {
      const s = useOpeningTour.getState()
      canvas.dataset.tour = s.tour
      canvas.dataset.tourCue = String(s.cue)
    }
    sync()
    const unsubscribe = useOpeningTour.subscribe(sync)
    return () => {
      unsubscribe()
      events.forEach(type => window.removeEventListener(type, cancel, true))
      window.removeEventListener('blur', blur)
      window.removeEventListener('keydown', key, true)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [canvas, rt])

  useFrame(() => {
    const s = useOpeningTour.getState(), p = play.current
    if (s.tour === 'idle') return
    const now = performance.now()
    if (p.run !== s.run) Object.assign(p, { run: s.run, start: now, cue: -1 })
    const t = (now - p.start) / 1000
    if (t >= 75) { stopTour(); return }
    let cue = 0
    while (cue + 1 < openingCues.length && t >= openingCues[cue + 1][0]) cue++
    if (cue !== p.cue) {
      p.cue = cue
      p.stationDistance = 0
      openingShot(cue)
      useOpeningTour.setState({ cue })
    }
    if (cue === 1 && rt.controls?.enabled && !rt.moving) {
      p.stationDistance ||= rt.controls.distance
      const f = Math.max(0, Math.min(1, (t - 11) / 9))
      rt.controls.dollyTo(p.stationDistance * (1 - 0.4 * f * f * (3 - 2 * f)), false)
    }
  }, -2.5)
  return null
}
