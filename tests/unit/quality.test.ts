import { describe, expect, it } from 'vitest';
import { effectivePixelRatio, parseTier, QUALITY, selectTier, stepDown, TIER_ORDER } from '../../src/core/quality/tiers';
import { DynamicResolution } from '../../src/core/quality/DynamicResolution';

const desktop = { isMobile: false, isWebGPU: true, hardwareConcurrency: 16, deviceMemoryGB: 16, maxTextureSize: 16384, gpuVendor: 'nvidia' };

describe('tier selection', () => {
  it('puts mobile on low regardless of hardware', () => {
    expect(selectTier({ ...desktop, isMobile: true })).toBe('low');
  });
  it('gives a strong WebGPU desktop ultra', () => {
    expect(selectTier(desktop)).toBe('ultra');
  });
  it('gives a WebGL2 quad-core laptop a lower tier', () => {
    expect(selectTier({ isMobile: false, isWebGPU: false, hardwareConcurrency: 4, deviceMemoryGB: 4, maxTextureSize: 8192 })).toBe('low');
  });
  it('parses overrides and rejects junk', () => {
    expect(parseTier('high')).toBe('high');
    expect(parseTier('extreme')).toBeNull();
    expect(parseTier(null)).toBeNull();
  });
  it('steps down and bottoms out at low', () => {
    expect(stepDown('ultra')).toBe('high');
    expect(stepDown('low')).toBe('low');
  });
  it('scales budgets monotonically with tier', () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const lo = QUALITY[TIER_ORDER[i - 1]!];
      const hi = QUALITY[TIER_ORDER[i]!];
      expect(hi.suspendedParticles).toBeGreaterThan(lo.suspendedParticles);
      expect(hi.maxPixels).toBeGreaterThanOrEqual(lo.maxPixels);
      expect(hi.surfaceSegments).toBeGreaterThanOrEqual(lo.surfaceSegments);
    }
  });
  it('caps ultra at 4K internal resolution', () => {
    expect(QUALITY.ultra.maxPixels).toBe(3840 * 2160);
  });
});

describe('effectivePixelRatio', () => {
  it('honours the pixel cap on a 5K display', () => {
    const pr = effectivePixelRatio(2, 1, 2560, 1440, QUALITY.ultra.maxPixels);
    expect(2560 * pr * 1440 * pr).toBeLessThanOrEqual(3840 * 2160 + 1);
  });
  it('uses dpr × scale when under the cap', () => {
    expect(effectivePixelRatio(1, 0.8, 1280, 720, QUALITY.ultra.maxPixels)).toBeCloseTo(0.8);
  });
});

describe('DynamicResolution', () => {
  const make = () => new DynamicResolution({ targetMs: 16.6, minScale: 0.5, maxScale: 1, window: 0.5, step: 0.1 });
  const run = (d: DynamicResolution, ms: number, seconds: number) => {
    const verdicts: string[] = [];
    for (let t = 0; t < seconds; t += 1 / 60) verdicts.push(d.sample(ms, 1 / 60));
    return verdicts;
  };

  it('holds at max scale when on budget', () => {
    const d = make();
    run(d, 12, 5);
    expect(d.scale).toBe(1);
  });
  it('reduces scale when over budget and never below min', () => {
    const d = make();
    run(d, 30, 10);
    expect(d.scale).toBeCloseTo(0.5);
  });
  it('recovers when headroom returns', () => {
    const d = make();
    run(d, 30, 5);
    const low = d.scale;
    run(d, 8, 10);
    expect(d.scale).toBeGreaterThan(low);
  });
  it('does not oscillate inside the dead band', () => {
    const d = make();
    run(d, 30, 2);
    run(d, 16.6, 1);
    const s = d.scale;
    run(d, 16.6, 5);
    expect(d.scale).toBe(s);
  });
  it('reports starvation at min scale so the tier can step down', () => {
    const d = make();
    const verdicts = run(d, 40, 10);
    expect(verdicts).toContain('starved');
  });
});
