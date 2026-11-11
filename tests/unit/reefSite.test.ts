import { describe, expect, it } from 'vitest';
import { CAMERA_CLEARANCE, TERRACE_DEPTH, divePathX, divePathZ, reefFloorDepth, reefSlope } from '../../src/environments/reef/ReefSite';
import { DIVE_END_DEPTH } from '../../src/depth/diveCurve';

describe('reef site', () => {
  it('keeps the dive path above the seafloor with clearance', () => {
    let worst = Infinity;
    for (let d = 0; d <= DIVE_END_DEPTH; d += 0.25) {
      const gap = reefFloorDepth(divePathX(d), divePathZ(d)) - d;
      worst = Math.min(worst, gap);
    }
    expect(worst).toBeGreaterThanOrEqual(CAMERA_CLEARANCE);
  });

  it('has a reef flat, a slope, a wall and the wreck terrace at its foot', () => {
    expect(reefFloorDepth(-80, 0)).toBeGreaterThan(9);
    expect(reefFloorDepth(-80, 0)).toBeLessThan(15);
    expect(reefFloorDepth(40, 0)).toBeGreaterThan(28);
    expect(reefFloorDepth(40, 0)).toBeLessThan(42);
    // The wall is unchanged above 130 m; offshore it levels onto the terrace instead of the deep.
    expect(reefFloorDepth(78, 0)).toBeLessThan(130);
    for (const x of [100, 115, 130]) {
      expect(reefFloorDepth(x, 0)).toBeGreaterThan(TERRACE_DEPTH - 3);
      expect(reefFloorDepth(x, 0)).toBeLessThan(TERRACE_DEPTH + 3);
    }
    expect(reefSlope(78, 0)).toBeGreaterThan(1.1);
  });
});
