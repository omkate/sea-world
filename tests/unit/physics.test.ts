import { describe, expect, it } from 'vitest';
import {
  exposureEV,
  maxExposureEV,
  lightFraction,
  lightLabel,
  particleDensity,
  pressureAtm,
  submersion,
  temperatureC,
  zoneIndexAt,
  zoneIndexWithHysteresis,
  ZONES,
  downwelling,
} from '../../src/data/zones/physics';
import { MARIANA } from '../../src/data/sites/mariana';
import { createDepthState, updateDepthState } from '../../src/depth/DepthState';

const KD = MARIANA.kd;

describe('pressure', () => {
  it.each([
    [0, 1],
    [10, 1.99],
    [100, 10.92],
    [1000, 100.2],
    [6000, 596.2],
    [10935, 1085.8],
  ])('%d m ≈ %d atm', (depth, atm) => {
    expect(pressureAtm(depth)).toBeCloseTo(atm, 0);
  });

  it('is 1 atm above water and strictly increasing below', () => {
    expect(pressureAtm(-3)).toBe(1);
    for (let z = 0; z < 11000; z += 250) expect(pressureAtm(z + 1)).toBeGreaterThan(pressureAtm(z));
  });
});

describe('light', () => {
  it('extinguishes red fastest and blue slowest', () => {
    const [r, g, b] = downwelling(20, KD);
    expect(r).toBeLessThan(g);
    expect(g).toBeLessThan(b);
  });

  it('is monotonically decreasing', () => {
    for (let z = 0; z < 2000; z += 10) expect(lightFraction(z + 10, KD)).toBeLessThan(lightFraction(z, KD));
  });

  it('keeps ~1% of blue light near the base of the euphotic zone', () => {
    const [, , blue] = downwelling(200, KD);
    expect(blue).toBeGreaterThan(0.005);
    expect(blue).toBeLessThan(0.02);
  });

  it('labels sunlight as gone at ~1,000 m and present just above it', () => {
    expect(lightLabel(lightFraction(0, KD))).toBe('BRIGHT');
    expect(lightLabel(lightFraction(980, KD))).toBe('TRACE');
    expect(lightLabel(lightFraction(1000, KD))).toBe('NONE');
    expect(lightLabel(lightFraction(4000, KD))).toBe('NONE');
  });

  it('exposure compensation grows with depth and stops adapting where sunlight ends', () => {
    expect(exposureEV(0, KD)).toBe(0);
    expect(exposureEV(100, KD)).toBeGreaterThan(exposureEV(20, KD));
    expect(exposureEV(3000, KD)).toBe(maxExposureEV(KD));
    expect(exposureEV(1000, KD)).toBe(maxExposureEV(KD));
  });

  it('adapted brightness falls steadily through the twilight zone (no sudden black)', () => {
    const seen = (z: number) => lightFraction(z, KD) * 2 ** exposureEV(z, KD);
    const ratios = [200, 400, 600, 800].map((z) => seen(z + 200) / seen(z));
    for (const r of ratios) {
      expect(r).toBeGreaterThan(0.1);
      expect(r).toBeLessThan(0.7);
    }
    expect(seen(1000) / seen(0)).toBeLessThan(0.005);
  });
});

describe('temperature', () => {
  it('matches the site profile at its control points', () => {
    for (const [z, t] of MARIANA.temperature) expect(temperatureC(z, MARIANA)).toBeCloseTo(t, 5);
  });

  it('is warm at the surface, ~4 °C at 1,000 m and near-freezing in the abyss', () => {
    expect(temperatureC(0, MARIANA)).toBeGreaterThan(26);
    expect(temperatureC(1000, MARIANA)).toBeGreaterThan(3);
    expect(temperatureC(1000, MARIANA)).toBeLessThan(5);
    expect(temperatureC(4500, MARIANA)).toBeLessThan(2);
  });

  it('never overshoots between control points', () => {
    const ts = MARIANA.temperature.map((p) => p[1]);
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    for (let z = 0; z <= MARIANA.maxDepth; z += 37) {
      const t = temperatureC(z, MARIANA);
      expect(t).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(t).toBeLessThanOrEqual(hi + 1e-9);
    }
  });
});

describe('zones', () => {
  it('uses the NOAA boundaries', () => {
    expect(ZONES.map((z) => z.top)).toEqual([0, 200, 1000, 4000, 6000]);
    expect(ZONES[zoneIndexAt(150)]!.id).toBe('sunlight');
    expect(ZONES[zoneIndexAt(200)]!.id).toBe('twilight');
    expect(ZONES[zoneIndexAt(999)]!.id).toBe('twilight');
    expect(ZONES[zoneIndexAt(1000)]!.id).toBe('midnight');
    expect(ZONES[zoneIndexAt(5000)]!.id).toBe('abyssal');
    expect(ZONES[zoneIndexAt(10935)]!.id).toBe('hadal');
  });

  it('does not flicker at a boundary', () => {
    let zone = zoneIndexWithHysteresis(199, null);
    expect(zone).toBe(0);
    zone = zoneIndexWithHysteresis(200.5, zone);
    expect(zone).toBe(0);
    zone = zoneIndexWithHysteresis(202.5, zone);
    expect(zone).toBe(1);
    zone = zoneIndexWithHysteresis(199.5, zone);
    expect(zone).toBe(1);
    zone = zoneIndexWithHysteresis(197.5, zone);
    expect(zone).toBe(0);
  });

  it('jumps directly on large moves (deep links)', () => {
    expect(zoneIndexWithHysteresis(5000, 0)).toBe(3);
    expect(zoneIndexWithHysteresis(10, 4)).toBe(0);
  });
});

describe('density and submersion', () => {
  it('particle density stays within [0,1] and is higher near the surface than the abyss', () => {
    for (let z = 0; z < 11000; z += 100) {
      const d = particleDensity(z, MARIANA.chlorophyllMaxDepth);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
    expect(particleDensity(10, 120)).toBeGreaterThan(particleDensity(5000, 120));
  });

  it('submersion is 0 in air and 1 underwater', () => {
    expect(submersion(-2)).toBe(0);
    expect(submersion(2)).toBe(1);
  });
});

describe('DepthState', () => {
  it('reports surface above water and zones below', () => {
    const s = createDepthState();
    updateDepthState(s, -2, 0, MARIANA);
    expect(s.zone).toBe('surface');
    updateDepthState(s, 127, 0.45, MARIANA);
    expect(s.zone).toBe('sunlight');
    expect(s.pressureAtm).toBeCloseTo(13.6, 0);
    updateDepthState(s, 1500, 0.7, MARIANA);
    expect(s.zone).toBe('midnight');
    expect(s.lightLabel).toBe('NONE');
  });
});
