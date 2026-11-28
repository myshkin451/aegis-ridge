// RG8 stores the horizontal components of the upward world-space normal.
export function macroNormals(height, n, step) {
  const bytes = Buffer.alloc(2 * height.length)
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(i - 1, 0),
        i1 = Math.min(i + 1, n - 1)
      const j0 = Math.max(j - 1, 0),
        j1 = Math.min(j + 1, n - 1)
      const nx = (height[j * n + i0] - height[j * n + i1]) / ((i1 - i0) * step)
      const nz = (height[j0 * n + i] - height[j1 * n + i]) / ((j1 - j0) * step)
      const scale = 127.5 / Math.hypot(nx, 1, nz)
      const k = 2 * (j * n + i)
      bytes[k] = Math.round(127.5 + nx * scale)
      bytes[k + 1] = Math.round(127.5 + nz * scale)
    }
  return bytes
}

// Two levels of conservative maxima accelerate empty space. Maxima are bounds on
// the full piecewise-linear triangle surface, including each block's far edge.
function maximumBlocks(grid, side) {
  const size = Math.ceil((grid.n - 1) / side)
  const values = new Float32Array(size * size).fill(-Infinity)
  for (let j = 0; j < grid.n - 1; j++)
    for (let i = 0; i < grid.n - 1; i++) {
      const k = j * grid.n + i
      const b = Math.floor(j / side) * size + Math.floor(i / side)
      values[b] = Math.max(
        values[b],
        grid.height[k],
        grid.height[k + 1],
        grid.height[k + grid.n],
        grid.height[k + grid.n + 1],
      )
    }
  return { side, size, values }
}
function rayBounds(x, z, dx, dz, r) {
  let enter = 0,
    exit = Infinity
  for (const [p, d] of [
    [x, dx],
    [z, dz],
  ]) {
    if (d === 0) {
      if (Math.abs(p) > r) return [Infinity, -Infinity]
    } else {
      const a = (-r - p) / d,
        b = (r - p) / d
      enter = Math.max(enter, Math.min(a, b))
      exit = Math.min(exit, Math.max(a, b))
    }
  }
  return [enter, exit]
}

// dH / distance is monotone on a planar triangle along any ray. Its maximum is
// at an interval endpoint or where the ray crosses the grid's NW-SE diagonal.
function trace(g, blocks, x, z, h, dx, dz, start, end, slope, sample) {
  const gx = (x + g.span / 2) / g.step,
    gz = (z + g.span / 2) / g.step
  const vx = dx / g.step,
    vz = dz / g.step
  let t = start
  while (t < end - 1e-7) {
    const ix = Math.max(0, Math.min(g.n - 2, Math.floor(gx + (t + 1e-6) * vx)))
    const iz = Math.max(0, Math.min(g.n - 2, Math.floor(gz + (t + 1e-6) * vz)))
    let skipped = false
    for (const { side, size, values } of blocks) {
      const bx = Math.floor(ix / side),
        bz = Math.floor(iz / side)
      if (values[bz * size + bx] > h + slope * t) continue
      const tx = dx ? ((bx + Number(dx > 0)) * side - gx) / vx : Infinity
      const tz = dz ? ((bz + Number(dz > 0)) * side - gz) / vz : Infinity
      t = Math.min(tx, tz, end)
      skipped = true
      break
    }
    if (skipped) continue
    const tx = dx ? (ix + Number(dx > 0) - gx) / vx : Infinity
    const tz = dz ? (iz + Number(dz > 0) - gz) / vz : Infinity
    const next = Math.min(tx, tz, end)
    slope = Math.max(
      slope,
      (sample(g, x + dx * t, z + dz * t) - h) / t,
      (sample(g, x + dx * next, z + dz * next) - h) / next,
    )
    const crossing = (ix - iz + gz - gx) / (vx - vz)
    if (crossing > t && crossing < next)
      slope = Math.max(slope, (sample(g, x + dx * crossing, z + dz * crossing) - h) / crossing)
    t = next
  }
  return slope
}

export function bakeHorizonAngles(inner, outer, n, sample, localSurface) {
  const bytes = Buffer.alloc(2 * 16 * n * n)
  const outerMax = [maximumBlocks(outer, 32), maximumBlocks(outer, 8)]
  const innerMax = [maximumBlocks(inner, 32), maximumBlocks(inner, 8)]
  for (const [level, receiver] of [inner, outer].entries())
    for (let direction = 0; direction < 16; direction++) {
      const angle = (direction * Math.PI) / 8
      const dx = Math.abs(Math.cos(angle)) < 1e-12 ? 0 : Math.cos(angle)
      const dz = Math.abs(Math.sin(angle)) < 1e-12 ? 0 : Math.sin(angle)
      const offset = (level * 16 + direction) * n * n
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = receiver.span * (i / (n - 1) - 0.5),
            z = receiver.span * (j / (n - 1) - 0.5)
          const h =
            Math.max(Math.abs(x), Math.abs(z)) <= inner.span / 2 ? localSurface(x, z) : sample(outer, x, z)
          const [, end] = rayBounds(x, z, dx, dz, outer.span / 2)
          const [a, b] = rayBounds(x, z, dx, dz, inner.span / 2)
          // Omit the first 20 m: the receiver's own facet and sub-cell relief
          // already contribute to N·L. Larger ridges may shadow any receiver.
          const start = 20
          let slope = 0
          if (a < b && b > start) {
            slope = trace(outer, outerMax, x, z, h, dx, dz, start, Math.min(end, a), slope, sample)
            slope = trace(
              inner,
              innerMax,
              x,
              z,
              h,
              dx,
              dz,
              Math.max(start, a),
              Math.min(end, b),
              slope,
              sample,
            )
            slope = trace(outer, outerMax, x, z, h, dx, dz, Math.max(start, b), end, slope, sample)
          } else slope = trace(outer, outerMax, x, z, h, dx, dz, start, end, slope, sample)
          bytes[offset + j * n + i] = Math.round((Math.atan(slope) * 510) / Math.PI)
        }
    }
  return bytes
}
