import { smoothstep } from '../../core/math/monotoneCubic';
import { band } from '../twilight/density';

/**
 * The midnight zone (plan §2, 1,000–4,000 m) as a sequence of scenes, one theme per depth band.
 * The dive covers this zone quickly (1,000 m per 8% of the scroll), so the bands are wide.
 */
export const MIDNIGHT_SCENES = {
  lightsOut: [1000, 1150],
  anglerfish: [1150, 1500],
} as const satisfies Record<string, readonly [number, number]>;

export const MIDNIGHT_RANGE: readonly [number, number] = [980, 4050];

/**
 * The camera lamp is switched off for the first scenes: below the last sunlight the dark belongs
 * to bioluminescence (a constellation, then the anglerfish's lure). 1 = lamp allowed.
 */
export function lampAllowance(depth: number): number {
  return 1 - band(depth, MIDNIGHT_SCENES.lightsOut[0] + 10, MIDNIGHT_SCENES.anglerfish[1] - 10, 25);
}

/**
 * Strength of the bioluminescence constellation by depth: it builds after sunlight ends,
 * peaks, and fades back to black before the anglerfish.
 */
export function constellationStrength(depth: number): number {
  const [from, to] = MIDNIGHT_SCENES.lightsOut;
  return smoothstep(from, from + (to - from) * 0.4, depth) * smoothstep(to, to - (to - from) * 0.25, depth);
}
