import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useShelterStore } from '../../store/useShelterStore'
import { useElevatorRide } from '../../store/useElevatorRide'
import { useShiftClock } from '../../store/useShiftClock'
import type { FloorId } from '../../types/shelter'
import { floorAt } from '../../geometry/viewGeometry'

function buildSound(ctx: AudioContext) {
  const master = ctx.createGain()
  master.gain.value = 0.22
  master.connect(ctx.destination)
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const sources: (AudioBufferSourceNode | OscillatorNode)[] = []
  const layer = (frequency: number, tone = false) => {
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(master)
    if (tone) {
      const source = ctx.createOscillator()
      source.frequency.value = frequency
      source.connect(gain)
      sources.push(source)
    } else {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter()
      source.buffer = buffer
      source.loop = true
      filter.type = 'bandpass'
      filter.frequency.value = frequency
      filter.Q.value = 0.55
      source.connect(filter).connect(gain)
      sources.push(source)
    }
    return gain.gain
  }
  const wind = layer(480), fan = layer(260), water = layer(1700), transformer = layer(100, true)
  const liftMotor = layer(72, true)
  sources.forEach(source => source.start())
  function fade(floor: FloorId | null, audible: boolean) {
    const t = ctx.currentTime
    master.gain.setTargetAtTime(audible ? 0.22 : 0, t, 0.12)
    wind.setTargetAtTime(floor === 'L2' ? 0.24 : 0, t, 0.5)
    fan.setTargetAtTime(floor ? ({ L2: 0, L1: 0.035, B1: 0.12, B2: 0.02, B3: 0.13, B4: 0.08 })[floor] : 0, t, 0.45)
    water.setTargetAtTime(floor === 'B3' ? 0.12 : 0, t, 0.4)
    transformer.setTargetAtTime(floor === 'B4' ? 0.075 : 0, t, 0.45)
  }
  function pressureRelease() {
    if (!useShiftClock.getState().sound || ctx.state !== 'running') return
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
    source.buffer = buffer
    filter.type = 'bandpass'
    filter.frequency.value = 1650
    filter.Q.value = 0.65
    gain.gain.setValueAtTime(0.34, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.004, ctx.currentTime + 1.5)
    source.connect(filter).connect(gain).connect(master)
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect() }
    source.start(0, 0, 1.5)
  }
  function elevator(moving: boolean, arrival: boolean) {
    liftMotor.setTargetAtTime(moving ? 0.035 : 0, ctx.currentTime, 0.15)
    if (!arrival || !useShiftClock.getState().sound || ctx.state !== 'running') return
    const bell = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime
    bell.frequency.value = 660
    gain.gain.setValueAtTime(0.04, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36)
    bell.connect(gain).connect(master)
    bell.onended = () => { bell.disconnect(); gain.disconnect() }
    bell.start(t)
    bell.stop(t + 0.37)
  }
  return { fade, pressureRelease, elevator, dispose() { sources.forEach(s => s.stop()); void ctx.close().catch(() => {}) } }
}

export function Soundscape() {
  const mix = useRef<ReturnType<typeof buildSound> | null>(null)
  const last = useRef('')
  useEffect(() => {
    let ctx: AudioContext | undefined
    let asyncOutput = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype
    const unlock = (event: Event) => {
      if (!event.isTrusted || !useShiftClock.getState().sound || !navigator.userActivation.isActive) return
      if (ctx) {
        if (mix.current && ctx.state === 'suspended') void ctx.resume().catch(() => {})
        return
      }
      if (typeof AudioContext === 'undefined') return
      // On macOS, opening the default output in the constructor blocks the pointer handler.
      // A silent sink starts immediately. Chrome opens the real device asynchronously.
      const options = asyncOutput ? { sampleRate: 48000, sinkId: { type: 'none' } } : undefined
      const context = ctx = new AudioContext(options)
      const output = asyncOutput
        ? (context as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId('')
        : Promise.resolve()
      const resumed = context.state === 'suspended' ? context.resume() : Promise.resolve()
      void Promise.all([output, resumed]).then(() => {
        if (ctx !== context) return
        mix.current = buildSound(context)
        last.current = ''
      }).catch(() => {
        if (ctx !== context) return
        ctx = undefined
        asyncOutput = false
        void context.close().catch(() => {})
      })
    }
    const unwatchRide = useElevatorRide.subscribe(({ ride }, previous) => {
      mix.current?.elevator(ride?.phase === 'moving', previous.ride?.phase === 'moving' && ride?.phase === 'opening')
    })
    const release = () => mix.current?.pressureRelease()
    const hide = () => { if (document.hidden) { mix.current?.fade(null, false); last.current = '' } }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('click', unlock)
    window.addEventListener('keydown', unlock, true)
    window.addEventListener('ars-pressure-release', release)
    document.addEventListener('visibilitychange', hide)
    return () => {
      unwatchRide()
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock, true)
      window.removeEventListener('ars-pressure-release', release)
      document.removeEventListener('visibilitychange', hide)
      const context = ctx
      ctx = undefined
      if (mix.current) mix.current.dispose()
      else if (context) void context.close().catch(() => {})
      mix.current = null
    }
  }, [])
  useFrame(({ camera }) => {
    if (!mix.current || document.hidden) return
    const s = useShelterStore.getState()
    const floor = s.cameraState === 'walkthrough' ? floorAt(camera.position.y - 1.65)
      : s.cameraState === 'site' && s.mode === 'exterior' ? 'L2' : null
    const sound = useShiftClock.getState().sound
    const key = String(floor) + sound
    if (last.current !== key) {
      mix.current.fade(floor, sound)
      last.current = key
    }
  })
  return null
}
