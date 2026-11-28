import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { crewById } from '../../data/crew'
import { FLOORS } from '../../data/floors'
import { useCrewTour, startTour, stopTour } from '../../store/useCrewTour'
import { viewParameter } from '../../data/blueprintDocument'
import { useOperationsStore } from '../../store/useOperationsStore'
import { useShelterStore } from '../../store/useShelterStore'
import { walkRevealUniforms } from '../mep/lens'
import type { SurveyRuntime } from './runtime'
import { inspectionPath, inspectionStop } from './inspectionRoute'
import { WALK } from './walkCollision'

export const openingCues = [
  [0, '黎明，云层停在观测站下方。'],
  [10, '沿南侧平台接近科研站房。'],
  [20, '南向剖面展开，地表以下是四层工程空间。'],
  [31, '经过车库吊装口，沿货梯井下行至 B2。'],
  [40, '餐厅的阅读角和共餐长桌已亮灯。'],
  [49, '穿过夹层透镜，查看走廊上方的风管和桥架。'],
  [60, '启动封锁，外侧设施依次关闭。'],
  [65, '封锁 · 第 1 天'],
  [70, '返回观测站现场。'],
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
      useShelterStore.setState({ lastFloor: 'B2' })
      view.setView('walkthrough', [-3, FLOORS.B2.elevation, -1])
      break
    case 6: op.setScenario('fallout'); view.focusFacility(4); break
    case 7: op.skip(); break
    case 8: view.frame('surface'); break
  }
}
function wrapAngle(v: number) { return Math.atan2(Math.sin(v), Math.cos(v)) }
function look(rt: SurveyRuntime, dx: number, dy: number, dz: number, dt: number) {
  const weight = 1 - Math.exp(-4.6 * dt)
  rt.yaw += wrapAngle(Math.atan2(dx, dz) - rt.yaw) * weight
  rt.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - rt.pitch) * weight
}
const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.matches('textarea, input:not([type]), input:is([type=text],[type=search],[type=number],[type=email],[type=url],[type=password],[type=tel]), [contenteditable=true]')

export function TourDirector({ rt }: { rt: SurveyRuntime }) {
  const canvas = useThree(s => s.gl.domElement)
  const play = useRef({ run: -1, start: 0, cue: -1, index: 0, points: [] as Vector3[], dwell: 0, lens: false, stationDistance: 0 })
  function clearLens() {
    if (!play.current.lens) return
    play.current.lens = false
    walkRevealUniforms.arsLens.value.z = 0
    const ring = document.getElementById('mep-lens-ring')
    if (ring) ring.hidden = true
    canvas.dataset.mepLens = 'off'
  }
  useEffect(() => {
    const cancel = () => {
      if (useCrewTour.getState().tour === 'idle') return
      rt.inspectionTarget = null
      clearLens()
      rt.interrupt?.()
      stopTour(true)
    }
    const key = (e: KeyboardEvent) => {
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing &&
          e.key.toLowerCase() === 'o' && !editable(e.target)) {
        e.preventDefault()
        cancel()
        startTour('opening')
      } else {
        const active = useCrewTour.getState().tour !== 'idle'
        cancel()
        if (active && e.key === 'Escape') {
          e.preventDefault()
          e.stopImmediatePropagation()
        }
      }
    }
    const first = () => {
      if (new URLSearchParams(location.search).has(viewParameter)) return
      try {
        if (localStorage.getItem('ars-opening-seen') || matchMedia('(prefers-reduced-motion: reduce)').matches) return
        localStorage.setItem('ars-opening-seen', '1')
      } catch { /* The tour still runs once for this mount when storage is unavailable. */ }
      startTour('opening')
    }
    const hide = () => { if (document.hidden) cancel() }
    const blur = (e: FocusEvent) => { if (e.target === window) cancel() }
    const events = ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart'] as const
    events.forEach(type => window.addEventListener(type, cancel, true))
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', key, true)
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('ars-ready', first, { once: true })
    const sync = () => {
      const s = useCrewTour.getState()
      canvas.dataset.tour = s.tour
      canvas.dataset.tourCue = String(s.cue)
      if (s.tour === 'idle') { rt.inspectionTarget = null; clearLens() }
    }
    sync()
    const unsubscribe = useCrewTour.subscribe(sync)
    return () => {
      unsubscribe()
      events.forEach(type => window.removeEventListener(type, cancel, true))
      window.removeEventListener('blur', blur)
      window.removeEventListener('keydown', key, true)
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('ars-ready', first)
      rt.inspectionTarget = null
      clearLens()
    }
  }, [canvas, rt])

  useFrame((_, dt) => {
    const s = useCrewTour.getState(), p = play.current
    if (s.tour === 'idle') return
    const now = performance.now()
    if (p.run !== s.run) {
      Object.assign(p, { run: s.run, start: now, cue: -1, index: 0, points: [], dwell: 0 })
      if (s.tour === 'inspection') {
        const member = crewById.get(s.selected!)!
        const floor = inspectionStop(member.route[0]).floor
        useShelterStore.setState({ lastFloor: floor, time: '07:30' })
        useShelterStore.getState().setView('walkthrough', [-4, FLOORS[floor].elevation, -1])
        useCrewTour.setState({ caption: '由' + floor + '主走廊出发。' })
        return
      }
    }
    if (s.tour === 'opening') {
      const t = (now - p.start) / 1000
      if (t >= 75) { stopTour(); return }
      let cue = 0
      while (cue + 1 < openingCues.length && t >= openingCues[cue + 1][0]) cue++
      if (cue !== p.cue) {
        clearLens()
        p.cue = cue
        p.stationDistance = 0
        openingShot(cue)
        useCrewTour.setState({ cue, caption: openingCues[cue][1] })
      }
      if (cue === 1 && rt.controls?.enabled && !rt.moving) {
        p.stationDistance ||= rt.controls.distance
        const f = Math.max(0, Math.min(1, (t - 11) / 9))
        rt.controls.dollyTo(p.stationDistance * (1 - 0.4 * f * f * (3 - 2 * f)), false)
      }
      if (cue === 5 && !rt.moving && t > 50.5) {
        const progress = Math.min(1, (t - 50.5) / 8)
        rt.pitch += (0.63 - rt.pitch) * (1 - Math.exp(-2.4 * dt))
        rt.yaw += wrapAngle(Math.PI / 2 - rt.yaw) * (1 - Math.exp(-2.4 * dt))
        const w = canvas.clientWidth, h = canvas.clientHeight
        const x = 0.26 + progress * 0.48, y = 0.42, radius = Math.min(136, h * 0.17)
        walkRevealUniforms.arsLens.value.set(x * 2 - 1, 1 - y * 2, radius * 2 / h, w / h)
        const ring = document.getElementById('mep-lens-ring')
        if (ring) {
          ring.hidden = false
          ring.style.left = x * w + 'px'; ring.style.top = y * h + 'px'
          ring.style.width = ring.style.height = radius * 2 + 'px'
        }
        canvas.dataset.mepLens = 'on'
        p.lens = true
      }
      return
    }
    if (rt.moving) return
    const member = crewById.get(s.selected!)!
    if (p.cue < 0 || (p.dwell && now - p.dwell > 4500)) {
      const i = p.cue + 1, next = member.route[i]
      if (!next) { stopTour(); return }
      const points = inspectionPath(rt.roomRoutes, member.route[i - 1], next)
      if (!points) { stopTour(true); return }
      Object.assign(p, { cue: i, points, index: 0, dwell: 0 })
      useCrewTour.setState({ cue: i, caption: inspectionStop(next).room.name + ' · ' + next.caption })
    }
    const point = p.points[p.index]
    if (point && rt.feet.distanceTo(point) < 0.13) p.index++
    const next = p.points[p.index]
    if (next) {
      rt.inspectionTarget = next
      look(rt, next.x - rt.feet.x, -0.025, next.z - rt.feet.z, Math.min(dt, 0.1))
    } else {
      rt.inspectionTarget = null
      if (!p.dwell) p.dwell = now
      const { anchor, floor } = inspectionStop(member.route[p.cue])
      look(rt, anchor.target[0] - rt.feet.x, anchor.target[1] + FLOORS[floor].elevation - rt.feet.y - WALK.eye,
        anchor.target[2] - rt.feet.z, Math.min(dt, 0.1))
    }
  }, -2.5)
  return null
}
