/** An A/B choice is fixed for the lifetime of the WebGL context and its warm-up. */
export const terrainV2 =
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get('terrain') !== 'v1'
