import { smoothstep } from '../../core/math/monotoneCubic';
import { band } from '../twilight/density';

/**
 * The midnight zone (plan §2, 1,000–4,000 m) as a sequence of scenes, one animal per depth band,
 * each a real deep diver shown no deeper than it has been recorded: a yellowfin tuna on its
 * deepest dives (to 1,602 m), Cuvier's beaked whale (to 2,992 m), a sperm whale hunting (to
 * 3,200 m) and, near the bottom, an abyssal grenadier (from 3,400 m). No realistic animal is
 * recorded for 3,200–3,400 m, so that short stretch is open water.
 */
export const MIDNIGHT_SCENES = {
  yellowfin: [1000, 1600],
  beakedWhale: [1600, 2400],
  spermWhale: [2400, 3200],
  grenadier: [3400, 3900],
} as const satisfies Record<string, readonly [number, number]>;

/** The bioluminescence constellation: the first stretch of total darkness, behind the tuna. */
export const CONSTELLATION: readonly [number, number] = [1000, 1150];

export const MIDNIGHT_RANGE: readonly [number, number] = [980, 4050];

/**
 * The wide camera lamp is off through every midnight scene: its backscatter would turn the water
 * teal and flatten the animal against it. Each scene's animal is lit instead by the hero rig
 * (a narrow key and back light on the subject, underwaterLighting.ts), so it stands out of black
 * water, as in ROV footage. 1 = lamp allowed.
 */
export function lampAllowance(depth: number): number {
  const S = MIDNIGHT_SCENES;
  return 1 - band(depth, S.yellowfin[0] + 10, S.grenadier[1] - 10, 25);
}

/**
 * Strength of the bioluminescence constellation by depth: it builds after sunlight ends,
 * peaks, and fades back to black.
 */
export function constellationStrength(depth: number): number {
  const [from, to] = CONSTELLATION;
  return smoothstep(from, from + (to - from) * 0.4, depth) * smoothstep(to, to - (to - from) * 0.25, depth);
}
