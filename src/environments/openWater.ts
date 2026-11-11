import { Vector3 } from 'three/webgpu';
import type { SchoolOptions } from '../ecosystem/schooling/School';
import { divePathX, divePathZ } from './reef/ReefSite';

/**
 * A point in open water near the camera's path at `depth`: `ahead` metres in front of the lens,
 * `side` metres out toward the open ocean (away from the reef), `rise` metres above the path.
 */
export function inOpenWater(depth: number, ahead: number, side: number, rise = 0): Vector3 {
  return new Vector3(divePathX(depth) + side, -depth + rise, divePathZ(depth) - ahead);
}

/** School options in open water: no seafloor, a depth band of ± `band` metres around `home`. */
export function openWaterSchool(home: Vector3, band: number, o: Omit<SchoolOptions, 'home' | 'yMin' | 'yMax' | 'floor' | 'floorClearance'>): SchoolOptions {
  return { ...o, home, yMin: home.y - band, yMax: home.y + band, floor: () => null, floorClearance: 0 };
}
