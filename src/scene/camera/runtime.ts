import { Vector3 } from 'three'
import type CameraControls from 'camera-controls'
import type { FloorId } from '../../types/shelter'

export function surveyRuntime() {
  return {
    controls: null as CameraControls | null,
    moving: false,
    finish: null as (() => void) | null,
    target: new Vector3(),
    feet: new Vector3(),
    yaw: 0,
    pitch: 0,
    floor: 'B2' as FloorId,
    walkRevision: -1,
    readout: new Vector3(),
    hit: false,
    stick: { x: 0, y: 0 },
    hold: false,
    pressure: 0,
    nearby: '',
    room: '',
  }
}
export type SurveyRuntime = ReturnType<typeof surveyRuntime>
