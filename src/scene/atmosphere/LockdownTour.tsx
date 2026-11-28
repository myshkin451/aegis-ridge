import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { lockdownElapsed, useOperationsStore } from '../../store/useOperationsStore'
import { useLockdownTour } from '../../store/useLockdownTour'
import { useShelterStore } from '../../store/useShelterStore'

// Each cue uses the same surveyed camera controls and collision-checked route as manual navigation.
const shots = [
  { start: 0, facility: 1 },
  { start: 2, facility: 2 },
  { start: 5, facility: 4 },
  { start: 15, facility: 14 },
  { start: 20, facility: 4 },
  { start: 25, facility: null },
] as const
export function LockdownTourCamera() {
  const gl = useThree((s) => s.gl)
  const previous = useRef({ run: -1, shot: -1, revision: -1 })
  useEffect(() => {
    const cancel = () => {
      if (useLockdownTour.getState().run !== null) useLockdownTour.getState().stop()
    }
    const keys = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,select,textarea,[contenteditable=true]')) return
      if (
        ['w', 'a', 's', 'd', 'q', 'e', 'escape', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(
          e.key.toLowerCase(),
        )
      )
        cancel()
    }
    gl.domElement.addEventListener('pointerdown', cancel, true)
    gl.domElement.addEventListener('wheel', cancel, true)
    window.addEventListener('keydown', keys, true)
    return () => {
      gl.domElement.removeEventListener('pointerdown', cancel, true)
      gl.domElement.removeEventListener('wheel', cancel, true)
      window.removeEventListener('keydown', keys, true)
      cancel()
    }
  }, [gl])
  useFrame(() => {
    const run = useLockdownTour.getState().run
    if (run === null) return
    const op = useOperationsStore.getState(),
      view = useShelterStore.getState()
    if (
      run !== op.lockdownStartedAt ||
      (previous.current.run === run && previous.current.revision !== view.cameraRevision)
    ) {
      useLockdownTour.getState().stop()
      return
    }
    const t = lockdownElapsed(op)
    let index = 0
    while (index + 1 < shots.length && t >= shots[index + 1].start) index++
    if (previous.current.run === run && previous.current.shot === index) return
    const facility = shots[index].facility
    if (facility !== null) view.focusFacility(facility)
    else {
      view.focusRoom('b1_decon')
      view.selectAnchor(1)
      view.enterRoom()
    }
    previous.current = { run, shot: index, revision: useShelterStore.getState().cameraRevision }
  }, -0.5)
  return null
}
