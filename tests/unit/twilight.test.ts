import { describe, expect, it } from 'vitest';
import { SQUID_DENSITY, TWILIGHT_DENSITY, TWILIGHT_SCENES } from '../../src/environments/twilight/density';
import { loadSpecies } from '../../src/data/species';

const sample = (f: (d: number) => number, from: number, to: number, step = 5) => {
  const out: number[] = [];
  for (let d = from; d <= to; d += step) out.push(f(d));
  return out;
};
const mid = ([a, b]: readonly [number, number]) => (a + b) / 2;

describe('twilight scenes', () => {
  it('run in order without overlapping', () => {
    const bands = Object.values(TWILIGHT_SCENES);
    bands.forEach(([a, b], i) => {
      expect(b).toBeGreaterThan(a);
      if (i > 0) expect(a).toBeGreaterThanOrEqual(bands[i - 1]![1]);
    });
  });

  it('give each scene its own lead animal', () => {
    const lead = (d: number) => {
      let best = '';
      let level = -1;
      for (const [id, f] of Object.entries(TWILIGHT_DENSITY)) if (f(d) > level) [best, level] = [id, f(d)];
      return best;
    };
    expect(lead(mid(TWILIGHT_SCENES.hatchetfish))).toBe('argyropelecus-hemigymnus');
    expect(lead(mid(TWILIGHT_SCENES.lanternfishWall))).toBe('diaphus');
    expect(lead(mid(TWILIGHT_SCENES.bristlemouths))).toBe('cyclothone');
  });

  it('keep the background faint outside each species scene', () => {
    expect(TWILIGHT_DENSITY['diaphus']!(mid(TWILIGHT_SCENES.atolla))).toBeLessThan(0.1);
    expect(TWILIGHT_DENSITY['argyropelecus-hemigymnus']!(mid(TWILIGHT_SCENES.lanternfishWall))).toBeLessThan(0.1);
    expect(TWILIGHT_DENSITY['cyclothone']!(mid(TWILIGHT_SCENES.vampireSquid))).toBeLessThan(0.15);
  });

  it('stay within 0..1 across the zone', () => {
    for (const f of [...Object.values(TWILIGHT_DENSITY), SQUID_DENSITY]) for (const v of sample(f, 200, 1100)) expect(v >= 0 && v <= 1).toBe(true);
  });

  it('show jewel squid only in their own scene', () => {
    expect(SQUID_DENSITY(mid(TWILIGHT_SCENES.jewelSquid))).toBeCloseTo(0.8);
    expect(SQUID_DENSITY(mid(TWILIGHT_SCENES.lanternfishWall))).toBe(0);
    expect(SQUID_DENSITY(mid(TWILIGHT_SCENES.atolla))).toBe(0);
  });

  it('only cover species recorded in the twilight at the site', () => {
    const species = loadSpecies();
    for (const id of [...Object.keys(TWILIGHT_DENSITY), 'histioteuthis']) {
      const s = species.find((x) => x.id === id);
      expect(s, id).toBeDefined();
      expect(s!.sites).toContain('mariana');
      expect(s!.depthMin).toBeLessThanOrEqual(300);
      expect(s!.depthMax).toBeGreaterThanOrEqual(600);
    }
  });
});
