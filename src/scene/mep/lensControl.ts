import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { MathUtils } from 'three'
import { FLOORS, SLAB } from '../../data/floors'
import type { SurveyRuntime } from '../camera/runtime'
import { serviceCorridor, walkRevealUniforms } from './lens'

export function useWalkReveal(active: boolean, rt: SurveyRuntime) {
  const canvas = useThree((s) => s.gl.domElement)
  const pointer = useMemo(() => ({ x: NaN, y: NaN, held: false }), [])
  const fade = useRef(0)

  useLayoutEffect(() => {
    if (!active) return
    const ring = document.getElementById('mep-lens-ring')!
    const lens = walkRevealUniforms.arsLens.value
    const sync = () => {
      const b = canvas.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) return
      const centred = document.pointerLockElement === canvas || !Number.isFinite(pointer.x)
      const x = centred ? b.width / 2 : pointer.x - b.left
      const y = centred ? b.height / 2 : pointer.y - b.top
      const radius = Math.min(136, Math.min(b.width, b.height) * 0.17)
      lens.set(
        (2 * x) / b.width - 1,
        1 - (2 * y) / b.height,
        pointer.held ? (2 * radius) / b.height : 0,
        b.width / b.height,
      )
      ring.hidden = !pointer.held
      if (pointer.held) {
        ring.style.width = ring.style.height = 2 * radius + 'px'
        ring.style.left = x + b.left + 'px'
        ring.style.top = y + b.top + 'px'
      }
      canvas.dataset.mepLens = pointer.held ? 'on' : 'off'
    }
    const move = (event: PointerEvent) => {
      if (document.pointerLockElement === canvas) return
      pointer.x = event.clientX
      pointer.y = event.clientY
      if (pointer.held) sync()
    }
    const reset = () => {
      pointer.held = false
      lens.z = 0
      ring.hidden = true
      canvas.dataset.mepLens = 'off'
    }
    const down = (event: KeyboardEvent) => {
      if (
        event.key !== 'Alt' || event.metaKey || event.ctrlKey || rt.moving ||
        (event.target instanceof HTMLElement &&
          event.target.matches('input:not([type=checkbox]), textarea, select, [contenteditable=true]'))
      )
        return
      event.preventDefault()
      pointer.held = true
      sync()
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        if (pointer.held) event.preventDefault()
        reset()
      }
    }
    const hide = () => {
      if (document.hidden) reset()
    }
    sync()
    canvas.dataset.plenumReveal = '0'
    window.addEventListener('pointermove', move)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', reset)
    window.addEventListener('resize', sync)
    document.addEventListener('visibilitychange', hide)
    document.addEventListener('pointerlockchange', sync)
    return () => {
      reset()
      walkRevealUniforms.arsPlenumReveal.value = fade.current = 0
      canvas.dataset.plenumReveal = '0'
      window.removeEventListener('pointermove', move)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', reset)
      window.removeEventListener('resize', sync)
      document.removeEventListener('visibilitychange', hide)
      document.removeEventListener('pointerlockchange', sync)
    }
  }, [active, canvas, rt, pointer])

  useFrame((_, dt) => {
    if (!active) return
    const floor = FLOORS[rt.floor]
    walkRevealUniforms.arsWalkFloor.value = floor.elevation
    // Leave the underside of the structural slab behind the services as a visible plane.
    walkRevealUniforms.arsWalkSoffit.value = floor.elevation + floor.pitch - SLAB - 0.005
    const { x, z } = rt.feet
    const inCorridor =
      !rt.moving && rt.floor.startsWith('B') &&
      x >= serviceCorridor.x0 && x <= serviceCorridor.x1 &&
      z >= serviceCorridor.z0 && z <= serviceCorridor.z1
    const target = inCorridor ? MathUtils.smoothstep(MathUtils.radToDeg(rt.pitch), 30, 42) : 0
    const next = MathUtils.damp(fade.current, target, 10, Math.min(0.1, dt))
    fade.current = Math.abs(next - target) < 0.001 ? target : next
    if (walkRevealUniforms.arsPlenumReveal.value === fade.current) return
    walkRevealUniforms.arsPlenumReveal.value = fade.current
    canvas.dataset.plenumReveal = fade.current.toFixed(3)
  }, -1)
}
