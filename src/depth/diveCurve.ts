import { invertMonotone, monotoneCubic } from '../core/math/monotoneCubic';

/**
 * Scroll progress → depth (m). Negative depth is camera height above the sea surface.
 * Scroll budget per chapter is weighted by how much there is to watch, not by metres.
 */
export const DIVE_KEYFRAMES: readonly (readonly [progress: number, depth: number])[] = [
  [0.0, -3.5],
  [0.035, -1.4],
  [0.055, 0.0],
  [0.075, 3],
  [0.14, 10],
  [0.24, 25],
  [0.33, 50],
  [0.42, 100],
  [0.5, 200],
  [0.58, 500],
  [0.66, 1000],
  [0.74, 2000],
  [0.83, 4000],
  [0.91, 6000],
  [1.0, 10935],
];

export const DIVE_START_DEPTH = DIVE_KEYFRAMES[0]![1];
export const DIVE_END_DEPTH = DIVE_KEYFRAMES[DIVE_KEYFRAMES.length - 1]![1];

export const diveCurve = monotoneCubic(
  DIVE_KEYFRAMES.map((k) => k[0]),
  DIVE_KEYFRAMES.map((k) => k[1]),
);

export function progressForDepth(depth: number): number {
  if (depth <= DIVE_START_DEPTH) return 0;
  if (depth >= DIVE_END_DEPTH) return 1;
  return invertMonotone(diveCurve, depth, 0, 1);
}
