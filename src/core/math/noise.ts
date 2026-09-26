/** Deterministic smooth 3D value noise and fBm for CPU-side procedural geometry. */
function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function valueNoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const zf = fade(z - zi);
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf) * 2 - 1;
}

export function fbm3(x: number, y: number, z: number, octaves = 4, lacunarity = 2.03, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * f, y * f, z * f);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** Uniform Catmull–Rom through (x, y) control points; clamps outside the range. */
export function catmullRom(points: readonly (readonly [number, number])[], x: number): number {
  const n = points.length;
  if (x <= points[0]![0]) return points[0]![1];
  if (x >= points[n - 1]![0]) return points[n - 1]![1];
  let i = 0;
  while (i < n - 2 && points[i + 1]![0] < x) i++;
  const p0 = points[Math.max(0, i - 1)]![1];
  const p1 = points[i]![1];
  const p2 = points[i + 1]![1];
  const p3 = points[Math.min(n - 1, i + 2)]![1];
  const t = (x - points[i]![0]) / (points[i + 1]![0] - points[i]![0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
