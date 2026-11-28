/** Progress of one actuator in the 30-second illustration. Times are in seconds. */
export function closureProgress(seconds: number, start: number, end: number) {
  const t = Math.min(1, Math.max(0, (seconds - start) / (end - start)))
  return t * t * (3 - 2 * t)
}

// Demonstration dial range. Actual room pressure requires commissioning and a differential sensor.
export const deconGauge = { spanPa: 60, targetPa: 30, start: 25, end: 30 }
export function deconPressure(seconds: number) {
  return deconGauge.targetPa * closureProgress(seconds, deconGauge.start, deconGauge.end)
}
