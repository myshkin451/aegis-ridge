import type { OrthographicCamera, PerspectiveCamera } from 'three'

// Interpolate the homogeneous divide. On the focal plane both projections have the exact same metre scale.
export function morphProjection(
  camera: PerspectiveCamera | OrthographicCamera,
  height: number,
  aspect: number,
  focus: number,
  perspective: number,
) {
  const k = perspective / focus,
    w = 1 - perspective,
    n = camera.near,
    f = camera.far
  const wn = w + k * n,
    wf = w + k * f,
    a = (wf + wn) / (f - n),
    b = -wn - a * n
  camera.projectionMatrix.set(2 / (height * aspect), 0, 0, 0, 0, 2 / height, 0, 0, 0, 0, -a, b, 0, 0, -k, w)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}
