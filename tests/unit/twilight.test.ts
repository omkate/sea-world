import { describe, expect, it } from 'vitest';
import { TWILIGHT_DENSITY } from '../../src/environments/twilight/density';
import { loadSpecies } from '../../src/data/species';

const sample = (f: (d: number) => number, from: number, to: number, step = 5) => {
  const out: number[] = [];
  for (let d = from; d <= to; d += step) out.push(f(d));
  return out;
};

describe('twilight density curves', () => {
  it('stay within 0..1 across the zone', () => {
    for (const f of Object.values(TWILIGHT_DENSITY)) for (const v of sample(f, 200, 1100)) expect(v >= 0 && v <= 1).toBe(true);
  });

  it('put lanternfish in the daytime deep scattering layer', () => {
    const f = TWILIGHT_DENSITY['diaphus']!;
    expect(f(500)).toBeGreaterThan(0.95);
    expect(f(280)).toBeLessThan(0.2);
    expect(f(900)).toBeLessThan(0.2);
    // Rises monotonically into the layer and falls monotonically below it.
    const up = sample(f, 280, 400);
    const down = sample(f, 680, 800);
    up.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(up[i]!));
    down.slice(1).forEach((v, i) => expect(v).toBeLessThanOrEqual(down[i]!));
  });

  it('keep hatchetfish in the upper twilight', () => {
    const f = TWILIGHT_DENSITY['argyropelecus-hemigymnus']!;
    expect(f(220)).toBe(0);
    expect(f(400)).toBe(1);
    expect(f(660)).toBe(0);
  });

  it('thicken bristlemouths monotonically with depth', () => {
    const v = sample(TWILIGHT_DENSITY['cyclothone']!, 250, 1000);
    v.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(v[i]!));
    expect(v[v.length - 1]).toBe(1);
  });

  it('only covers species recorded in the twilight at the site', () => {
    const species = loadSpecies();
    for (const id of Object.keys(TWILIGHT_DENSITY)) {
      const s = species.find((x) => x.id === id);
      expect(s, id).toBeDefined();
      expect(s!.sites).toContain('mariana');
      expect(s!.depthMin).toBeLessThanOrEqual(300);
      expect(s!.depthMax).toBeGreaterThanOrEqual(600);
    }
  });
});
