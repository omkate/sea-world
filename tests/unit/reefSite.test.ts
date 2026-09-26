import { describe, expect, it } from 'vitest';
import { CAMERA_CLEARANCE, divePathX, divePathZ, reefFloorDepth, reefSlope } from '../../src/environments/reef/ReefSite';

describe('reef site', () => {
  it('keeps the dive path above the seafloor with clearance', () => {
    let worst = Infinity;
    for (let d = 0; d <= 400; d += 0.25) {
      const gap = reefFloorDepth(divePathX(d), divePathZ(d)) - d;
      worst = Math.min(worst, gap);
    }
    expect(worst).toBeGreaterThanOrEqual(CAMERA_CLEARANCE);
  });

  it('has a reef flat, a slope and a wall', () => {
    expect(reefFloorDepth(-80, 0)).toBeGreaterThan(9);
    expect(reefFloorDepth(-80, 0)).toBeLessThan(15);
    expect(reefFloorDepth(40, 0)).toBeGreaterThan(28);
    expect(reefFloorDepth(40, 0)).toBeLessThan(42);
    expect(reefFloorDepth(100, 0)).toBeGreaterThan(200);
    expect(reefSlope(78, 0)).toBeGreaterThan(1.1);
  });
});
