import { Vector3 } from 'three'
import type { WalkCollision } from './walkCollision'
import type CameraControls from 'camera-controls'
import type { FloorId } from '../../types/shelter'

export function surveyRuntime() {
  return {
    controls: null as CameraControls | null,
    moving: false,
    garageTransfer: false,
    dropping: false,
    finish: null as (() => void) | null,
    target: new Vector3(),
    feet: new Vector3(),
    yaw: 0,
    pitch: 0,
    floor: 'B2' as FloorId,
    walkRevision: -1,
    roomRoutes: new Map<string, Vector3[]>(),
    collision: null as WalkCollision | null,
    readout: new Vector3(),
    hit: false,
    stick: { x: 0, y: 0 },
    hold: false,
    inspectionTarget: null as Vector3 | null,
    interrupt: null as (() => void) | null,
    pressure: 0,
    nearby: '',
    room: '',
    doorRevision: 0,
  }
}
export type SurveyRuntime = ReturnType<typeof surveyRuntime>
