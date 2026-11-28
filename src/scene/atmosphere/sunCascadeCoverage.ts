import { Box3, MathUtils, Matrix4, Vector3 } from 'three'
import type { CSM } from 'three/addons/csm/CSM.js'

// Track the actual orthographic footprint of each rendered sun map in light space.
// Receivers inside the cached volume can turn or move without moving their map.
export function sunCascadeCoverage() {
  const basis = new Matrix4(), inverse = new Matrix4(), viewToSun = new Matrix4()
  const origin = new Vector3(), up = new Vector3(0, 1, 0), point = new Vector3(), centre = new Vector3()
  const box = new Box3(), refreshed: number[] = []
  return (sun: CSM, force: boolean, seconds: number, animated: boolean) => {
    basis.lookAt(origin, sun.lightDirection, up)
    inverse.copy(basis).invert()
    viewToSun.multiplyMatrices(inverse, sun.camera.matrixWorld)
    let dirty = false
    for (const [i, light] of sun.lights.entries()) {
      const shadow = light.shadow, map = shadow.camera
      const texel = (map.right - map.left) / shadow.mapSize.x
      const vertices = sun.frustums[i].vertices
      box.makeEmpty()
      for (const plane of [vertices.near, vertices.far])
        for (const p of plane) box.expandByPoint(point.copy(p).applyMatrix4(viewToSun))
      centre.copy(light.position).applyMatrix4(inverse)
      // Keep PCF taps, normal bias and the camera-near offset in CSM's split interpolation inside the map.
      const guard = 2 * texel + shadow.normalBias + Math.abs(sun.mainFrustum.vertices.near[0].z)
      const covered = !force && refreshed[i] !== undefined &&
        box.min.x >= centre.x + map.left + guard && box.max.x <= centre.x + map.right - guard &&
        box.min.y >= centre.y + map.bottom + guard && box.max.y <= centre.y + map.top - guard &&
        centre.z - box.max.z >= sun.lightMargin && centre.z - box.min.z <= map.far - guard
      if (!covered) {
        box.getCenter(centre)
        // Preserve all eight corners even if a very wide lens uses the last texel of the map.
        centre.x = MathUtils.clamp(Math.round(centre.x / texel) * texel, box.max.x - map.right, box.min.x - map.left)
        centre.y = MathUtils.clamp(Math.round(centre.y / texel) * texel, box.max.y - map.top, box.min.y - map.bottom)
        // Reserve travel along the sun ray as well as the original 90 m for off-screen casters.
        centre.z = box.max.z + 1.5 * sun.lightMargin
        light.position.copy(centre.applyMatrix4(basis))
        light.target.position.copy(light.position).add(sun.lightDirection)
      }
      // The maximum tip speed of the roof rotors, dome and wind-deformed conifers is < 0.25 m/s.
      // Refresh their depth before the projected displacement reaches one shadow texel.
      if (!covered || (animated && (seconds - refreshed[i]) * 0.25 >= texel)) {
        shadow.needsUpdate = true
        refreshed[i] = seconds
        dirty = true
      }
    }
    return dirty
  }
}
