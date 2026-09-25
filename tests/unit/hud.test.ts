import { describe, expect, it } from 'vitest';
import { formatHud } from '../../src/ui/hud/Hud';
import { createDepthState, updateDepthState } from '../../src/depth/DepthState';
import { MARIANA } from '../../src/data/sites/mariana';

const at = (depth: number) => formatHud(updateDepthState(createDepthState(), depth, 0, MARIANA));

describe('HUD formatting', () => {
  it('shows height above water with a plus sign', () => {
    expect(at(-2.5).depth).toBe('+2.5 m');
    expect(at(-2.5).zone).toBe('SURFACE');
  });
  it('matches the brief example format', () => {
    const r = at(127);
    expect(r.depth).toBe('127 m');
    expect(r.pressure).toBe('13.6 atm');
    expect(r.zone).toBe('SUNLIGHT ZONE');
  });
  it('marks the lamp next to the light level', () => {
    expect(formatHud(updateDepthState(createDepthState(), 3000, 0, MARIANA), true).light).toBe('NONE · LAMP');
  });
  it('uses thousands separators and whole atm at depth', () => {
    const r = at(10935);
    expect(r.depth).toBe('10,935 m');
    expect(r.pressure).toBe('1,086 atm');
    expect(r.light).toBe('NONE');
    expect(r.zone).toBe('HADAL ZONE');
  });
});
