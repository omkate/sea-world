import { describe, expect, it } from 'vitest';
import { MIDNIGHT_SCENES, constellationStrength, lampAllowance } from '../../src/environments/midnight/scenes';
import { loadSpecies } from '../../src/data/species';

describe('midnight scenes', () => {
  it('switch the lamp off for the lights-out and anglerfish scenes only', () => {
    expect(lampAllowance(900)).toBe(1);
    expect(lampAllowance(1100)).toBe(0);
    expect(lampAllowance(1300)).toBe(0);
    expect(lampAllowance(1600)).toBe(1);
    expect(lampAllowance(3000)).toBe(1);
  });

  it('build the constellation after sunlight ends and fade it back to black', () => {
    const [from, to] = MIDNIGHT_SCENES.lightsOut;
    expect(constellationStrength(from - 1)).toBe(0);
    expect(constellationStrength(from + (to - from) * 0.5)).toBeGreaterThan(0.9);
    expect(constellationStrength(to)).toBe(0);
    expect(constellationStrength(MIDNIGHT_SCENES.anglerfish[0] + 50)).toBe(0);
  });

  it('only stage species recorded at those depths at the site', () => {
    const angler = loadSpecies().find((s) => s.id === 'melanocetus-johnsonii')!;
    const [from, to] = MIDNIGHT_SCENES.anglerfish;
    expect(angler.depthMin).toBeLessThanOrEqual(from);
    expect(angler.depthMax).toBeGreaterThanOrEqual(to);
  });
});
