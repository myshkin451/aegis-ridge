import type { CameraPose } from '../data/blueprintDocument'

let reader: (() => CameraPose) | undefined
let pending: { revision: number; pose: CameraPose } | undefined

export function bindCameraReader(next: () => CameraPose) {
  reader = next
  return () => { if (reader === next) reader = undefined }
}
export function currentPose() {
  if (!reader) throw new Error('机位尚未就绪，请等模型载入后再复制链接。')
  return reader()
}
export function restorePose(revision: number, pose: CameraPose) { pending = { revision, pose } }
export function takeRestoredPose(revision: number) {
  const pose = pending?.revision === revision ? pending.pose : undefined
  pending = undefined
  return pose
}
