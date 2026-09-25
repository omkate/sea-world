export interface MonotoneCubic {
  (x: number): number;
  readonly xs: readonly number[];
  readonly ys: readonly number[];
}

/** Fritsch–Carlson monotone cubic Hermite interpolation. Clamps outside the domain. */
export function monotoneCubic(xs: readonly number[], ys: readonly number[]): MonotoneCubic {
  const n = xs.length;
  if (n < 2 || n !== ys.length) throw new Error('monotoneCubic: need >= 2 matching points');
  for (let i = 1; i < n; i++) {
    if (!(xs[i]! > xs[i - 1]!)) throw new Error('monotoneCubic: xs must be strictly increasing');
  }

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1]! - xs[i]!);
    slope.push((ys[i + 1]! - ys[i]!) / dx[i]!);
  }

  const m: number[] = new Array<number>(n).fill(0);
  m[0] = slope[0]!;
  m[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1]!;
    const b = slope[i]!;
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i]!;
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / s;
    const b = m[i + 1]! / s;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * s;
      m[i + 1] = t * b * s;
    }
  }

  const fn = ((x: number): number => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! > x) hi = mid;
      else lo = mid;
    }
    const h = dx[lo]!;
    const t = (x - xs[lo]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[lo]! +
      (t3 - 2 * t2 + t) * h * m[lo]! +
      (-2 * t3 + 3 * t2) * ys[lo + 1]! +
      (t3 - t2) * h * m[lo + 1]!
    );
  }) as MonotoneCubic;

  Object.defineProperty(fn, 'xs', { value: xs });
  Object.defineProperty(fn, 'ys', { value: ys });
  return fn;
}

/** Inverts a monotonically increasing function on [lo, hi] by bisection. */
export function invertMonotone(f: (x: number) => number, y: number, lo: number, hi: number, iterations = 60): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    if (f(mid) < y) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
