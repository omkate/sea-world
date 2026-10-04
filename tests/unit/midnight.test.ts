import { describe, expect, it } from 'vitest';
import { CONSTELLATION, MIDNIGHT_SCENES, constellationStrength, lampAllowance } from '../../src/environments/midnight/scenes';
import { loadSpecies } from '../../src/data/species';
import { MIDNIGHT_HEROES } from '../../src/environments/midnight/MidnightChapter';
import { scenePlace } from '../../src/creatures/hero/HeroEncounter';

const mid = ([a, b]: readonly [number, number]) => (a + b) / 2;

describe('midnight scenes', () => {
  it('run in order without overlapping', () => {
    const bands = Object.values(MIDNIGHT_SCENES);
    bands.forEach(([a, b], i) => {
      expect(b).toBeGreaterThan(a);
      if (i > 0) expect(a).toBeGreaterThanOrEqual(bands[i - 1]![1]);
    });
  });

  it('switch the wide lamp off through the midnight scenes (the hero rig lights each animal)', () => {
    expect(lampAllowance(900)).toBe(1);
    for (const scene of Object.values(MIDNIGHT_SCENES)) expect(lampAllowance(mid(scene))).toBe(0);
  });

  it('build the constellation after sunlight ends and fade it back to black', () => {
    const [from, to] = CONSTELLATION;
    expect(constellationStrength(from - 1)).toBe(0);
    expect(constellationStrength(mid(CONSTELLATION))).toBeGreaterThan(0.9);
    expect(constellationStrength(to)).toBe(0);
  });

  it('stage exactly one hero in every scene', () => {
    const scenes = MIDNIGHT_HEROES.map((h) => h.scene);
    expect(new Set(scenes).size).toBe(scenes.length);
    expect([...scenes].sort()).toEqual(Object.keys(MIDNIGHT_SCENES).sort());
  });

  it('leave at most a short stretch of open water between scenes', () => {
    const bands = Object.values(MIDNIGHT_SCENES);
    bands.forEach(([a], i) => {
      if (i > 0) expect(a - bands[i - 1]![1]).toBeLessThanOrEqual(200);
    });
  });

  it('only stage species recorded at those depths at the site', () => {
    const species = loadSpecies();
    const staged = MIDNIGHT_HEROES.map((h) => [h.species, MIDNIGHT_SCENES[h.scene]] as const);
    for (const [id, [from, to]] of staged) {
      const s = species.find((x) => x.id === id)!;
      expect(s.sites, id).toContain('mariana');
      expect(s.depthMin, id).toBeLessThanOrEqual(from);
      expect(s.depthMax, id).toBeGreaterThanOrEqual(to);
    }
  });

  it('carry each hero corner to corner down the frame as the camera scrolls down, in frame across its band', () => {
    const at = { x: 0, y: 0 };
    let last = { x: -Infinity, y: Infinity };
    for (let p = 0; p <= 1.0001; p += 0.01) {
      scenePlace(Math.min(1, p), 1, at);
      expect(at.x).toBeGreaterThan(last.x);
      expect(at.y).toBeLessThan(last.y);
      last = { ...at };
      if (p > 0.06 && p < 0.94) expect(Math.max(Math.abs(at.x), Math.abs(at.y))).toBeLessThan(0.7);
    }
    expect(scenePlace(0, 1, at).x).toBeLessThan(-0.7);
    expect(scenePlace(0, 1, at).y).toBeGreaterThan(0.6);
    expect(scenePlace(1, 1, at).x).toBeGreaterThan(0.7);
    expect(scenePlace(0, -1, at).x).toBeGreaterThan(0.7);
  });

  it('alternate the diagonal from one scene to the next', () => {
    MIDNIGHT_HEROES.forEach((h, i) => {
      if (i > 0) expect(h.path).toBe(-MIDNIGHT_HEROES[i - 1]!.path);
    });
  });
});
