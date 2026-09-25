import { describe, expect, it } from 'vitest';
import { DIVE_KEYFRAMES, diveCurve, progressForDepth, DIVE_START_DEPTH, DIVE_END_DEPTH } from '../../src/depth/diveCurve';
import { stepCriticalSpring } from '../../src/depth/spring';
import { monotoneCubic } from '../../src/core/math/monotoneCubic';

describe('diveCurve', () => {
  it('passes through every keyframe', () => {
    for (const [p, d] of DIVE_KEYFRAMES) expect(diveCurve(p)).toBeCloseTo(d, 6);
  });

  it('is strictly monotonic (scrolling down always descends)', () => {
    let prev = diveCurve(0);
    for (let i = 1; i <= 10000; i++) {
      const d = diveCurve(i / 10000);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it('clamps outside [0,1]', () => {
    expect(diveCurve(-1)).toBe(DIVE_START_DEPTH);
    expect(diveCurve(2)).toBe(DIVE_END_DEPTH);
  });

  it('starts above water and reaches the Challenger Deep', () => {
    expect(DIVE_START_DEPTH).toBeLessThan(0);
    expect(DIVE_END_DEPTH).toBe(10935);
  });

  it('gives the sunlit 200 m at least 40% of the scroll', () => {
    expect(progressForDepth(200)).toBeGreaterThanOrEqual(0.4);
  });

  it('round-trips depth → progress → depth', () => {
    for (const d of [-2, 0, 3, 47, 200, 999, 4321, 10000]) {
      expect(diveCurve(progressForDepth(d))).toBeCloseTo(d, 3);
    }
  });
});

describe('monotoneCubic', () => {
  it('rejects bad input', () => {
    expect(() => monotoneCubic([0], [0])).toThrow();
    expect(() => monotoneCubic([0, 0], [0, 1])).toThrow();
  });

  it('does not overshoot flat segments', () => {
    const f = monotoneCubic([0, 1, 2, 3], [0, 1, 1, 2]);
    for (let x = 1; x <= 2; x += 0.05) expect(f(x)).toBeCloseTo(1, 9);
  });
});

describe('critical spring', () => {
  it('converges to the target without overshoot', () => {
    const s = { value: 0, velocity: 0 };
    let max = 0;
    for (let i = 0; i < 600; i++) {
      stepCriticalSpring(s, 1, 6, 1 / 60);
      max = Math.max(max, s.value);
    }
    expect(s.value).toBeCloseTo(1, 4);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('is frame-rate independent', () => {
    const a = { value: 0, velocity: 0 };
    const b = { value: 0, velocity: 0 };
    for (let i = 0; i < 60; i++) stepCriticalSpring(a, 1, 5, 1 / 60);
    for (let i = 0; i < 144; i++) stepCriticalSpring(b, 1, 5, 1 / 144);
    expect(a.value).toBeCloseTo(b.value, 6);
  });
});
