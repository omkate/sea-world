import { describe, expect, it } from 'vitest';
import { DIVE_KEYFRAMES, diveCurve, progressForDepth, finaleProgress, DIVE_START_DEPTH, DIVE_END_DEPTH, DIVE_SCREENS, FINALE_START, FINALE_TOP } from '../../src/depth/diveCurve';
import { stepCriticalSpring } from '../../src/depth/spring';
import { monotoneCubic } from '../../src/core/math/monotoneCubic';

describe('diveCurve', () => {
  it('keeps the original approach pace to 130 m (same depth for the same scroll distance)', () => {
    const scrollable = DIVE_SCREENS - 1;
    for (const [p, d] of DIVE_KEYFRAMES) {
      if (d > FINALE_TOP) continue;
      // Keyframes were authored over 41 scrollable screens.
      expect(diveCurve((p * 41) / scrollable)).toBeCloseTo(d, 6);
    }
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

  it('starts above water and ends at the wreck terrace', () => {
    expect(DIVE_START_DEPTH).toBeLessThan(0);
    expect(DIVE_END_DEPTH).toBe(145);
  });

  it('hands over to the finale at 130 m without a jump in descent rate', () => {
    expect(diveCurve(FINALE_START)).toBeCloseTo(FINALE_TOP, 6);
    const h = 1e-5;
    const before = (diveCurve(FINALE_START - h) - diveCurve(FINALE_START - 2 * h)) / h;
    const after = (diveCurve(FINALE_START + 2 * h) - diveCurve(FINALE_START + h)) / h;
    expect(after / before).toBeCloseTo(1, 2);
  });

  it('finale progress runs 0..1 over the finale only', () => {
    expect(finaleProgress(0)).toBe(0);
    expect(finaleProgress(FINALE_START)).toBe(0);
    expect(finaleProgress((FINALE_START + 1) / 2)).toBeCloseTo(0.5, 9);
    expect(finaleProgress(1)).toBe(1);
  });

  it('round-trips depth → progress → depth', () => {
    for (const d of [-2, 0, 3, 47, 100, 129, 131, 140]) {
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
