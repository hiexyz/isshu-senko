/** Lightweight value-noise + FBM for smoke drift (no deps). */

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return n - Math.floor(n)
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const xf = fade(x - x0)
  const yf = fade(y - y0)

  const v00 = hash2(x0, y0, seed)
  const v10 = hash2(x0 + 1, y0, seed)
  const v01 = hash2(x0, y0 + 1, seed)
  const v11 = hash2(x0 + 1, y0 + 1, seed)

  return lerp(lerp(v00, v10, xf), lerp(v01, v11, xf), yf)
}

/** Fractal Brownian Motion in [-1, 1] */
export function fbm2(
  x: number,
  y: number,
  seed = 0,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0

  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise2D(x * freq, y * freq, seed + i * 19.1) * 2 - 1) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }

  return sum / norm
}

/** Approximate curl of a scalar noise field → divergence-free wind */
export function curlNoise(
  x: number,
  y: number,
  t: number,
  seed = 0,
): { x: number; y: number } {
  const e = 0.01
  const n1 = fbm2(x, y + e, seed + t * 0.15)
  const n2 = fbm2(x, y - e, seed + t * 0.15)
  const n3 = fbm2(x + e, y, seed + 40 + t * 0.15)
  const n4 = fbm2(x - e, y, seed + 40 + t * 0.15)

  return {
    x: (n1 - n2) / (2 * e),
    y: -(n3 - n4) / (2 * e),
  }
}
