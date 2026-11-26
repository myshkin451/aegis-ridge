export function randomSource(seed: number) {
  let n = seed
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0
    return n / 4294967296
  }
}
