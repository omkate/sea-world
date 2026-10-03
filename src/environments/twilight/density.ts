import { smoothstep } from '../../core/math/monotoneCubic';

/**
 * Daytime density (0..1 of each species' fauna around the lens) by depth. The dive happens in
 * daylight, so diel migrators are shown at their daytime depths; their night-time rise toward
 * the surface needs a day/night cycle the dive does not have yet. Shapes are approximate.
 */
export const TWILIGHT_DENSITY: Record<string, (depth: number) => number> = {
  // Lanternfish form the deep scattering layer by day, roughly 350–700 m.
  diaphus: (d) => 0.15 + 0.85 * smoothstep(300, 380, d) * smoothstep(780, 680, d),
  // Hatchetfish sit higher in the twilight and migrate little.
  'argyropelecus-hemigymnus': (d) => smoothstep(230, 300, d) * smoothstep(650, 540, d),
  // Bristlemouths, the most numerous vertebrates, thicken with depth through the zone.
  cyclothone: (d) => 0.2 + 0.8 * smoothstep(280, 600, d),
};
