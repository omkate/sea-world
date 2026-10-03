import { smoothstep } from '../../core/math/monotoneCubic';

/** 1 inside [from, to], easing to 0 over `edge` metres either side. */
export const band = (d: number, from: number, to: number, edge = 20): number => smoothstep(from - edge, from + edge, d) * smoothstep(to + edge, to - edge, d);

/**
 * The twilight is told as a sequence of scenes, one theme per depth band, each led by a
 * different animal (see TWILIGHT_SCENES). A species is at full strength only in its own scene
 * and appears faintly elsewhere within its range, so the water never empties between scenes.
 * The dive happens in daylight, so migrators sit at their daytime depths (the deep scattering
 * layer by day); their night-time rise needs a day/night cycle the dive does not have yet.
 */
export const TWILIGHT_SCENES = {
  hatchetfish: [260, 330],
  lanternfishWall: [330, 460],
  jewelSquid: [460, 540],
  atolla: [540, 640],
  vampireSquid: [650, 730],
  giantSquid: [740, 880],
  bristlemouths: [880, 1040],
} as const satisfies Record<string, readonly [number, number]>;

const S = TWILIGHT_SCENES;

/** Density (0..1 of each species' fauna around the lens) by depth. */
export const TWILIGHT_DENSITY: Record<string, (depth: number) => number> = {
  // Silver hatchetfish lead the first scene, in the last of the blue light.
  'argyropelecus-hemigymnus': (d) => Math.max(band(d, ...S.hatchetfish), 0.08 * band(d, S.hatchetfish[1], 600)),
  // Lanternfish: the deep scattering layer, a dense flashing wall.
  diaphus: (d) => Math.max(band(d, ...S.lanternfishWall), 0.06 * band(d, S.lanternfishWall[1], 750)),
  // Bristlemouths: a thin background throughout, and the last scene before the midnight zone.
  cyclothone: (d) => Math.max(0.12 * band(d, 280, S.bristlemouths[0]), 0.7 * band(d, ...S.bristlemouths)),
};

/** Cock-eyed squid present around the lens (0..1 of the patrol): their own scene only. */
export const SQUID_DENSITY = (d: number): number => 0.8 * band(d, ...S.jewelSquid);
