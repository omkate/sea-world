import { invertMonotone, monotoneCubic } from '../core/math/monotoneCubic';

/**
 * Scroll progress → depth (m). Negative depth is camera height above the sea surface.
 * Scroll budget per chapter is weighted by how much there is to watch, not by metres.
 *
 * Two parts. The approach (surface → 130 m) keeps its original shape and pace: the same keyframes
 * over the same scroll distance (`APPROACH_SCREENS`). The finale (130 m → `DIVE_END_DEPTH`) then
 * settles the camera onto the wreck terrace; it starts at the approach's own descent rate and
 * eases out, so the hand-over is seamless. The finale's scene is driven by `finaleProgress`.
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
  // Beyond 130 m these only shape the approach's tangents (the dive ends at the finale).
  [0.5, 200],
  [0.58, 500],
  [0.66, 1000],
];

/**
 * Scrollable screen heights the approach keyframes were authored over (their scroll pace): a
 * 42-screen spacer minus the one viewport it cannot scroll past.
 */
const AUTHORED_SCROLL = 41;
/** Depth (m) where the approach hands over to the finale. */
export const FINALE_TOP = 130;
/** Scrollable screen heights given to the finale (the wreck, the swim across the sand, the castle). */
export const FINALE_SCREENS = 18;
/** Camera depth (m) at the end of the dive, a few metres above the wreck terrace. */
export const DIVE_END_DEPTH = 145;

const approach = monotoneCubic(
  DIVE_KEYFRAMES.map((k) => k[0]),
  DIVE_KEYFRAMES.map((k) => k[1]),
);
const approachEnd = invertMonotone(approach, FINALE_TOP, 0, 1);

/** Scrollable screen heights from the surface to 130 m (unchanged from the authored pace). */
export const APPROACH_SCREENS = approachEnd * AUTHORED_SCROLL;
const DIVE_SCROLL = APPROACH_SCREENS + FINALE_SCREENS;
/** Spacer height in screens for the whole dive (scrollable distance plus one viewport). */
export const DIVE_SCREENS = DIVE_SCROLL + 1;
/** Scroll progress at which the finale begins. */
export const FINALE_START = APPROACH_SCREENS / DIVE_SCROLL;

const toAuthored = DIVE_SCROLL / AUTHORED_SCROLL;
const FINALE_SPAN = DIVE_END_DEPTH - FINALE_TOP;

/**
 * Finale depth: 130 m + span · (1 − e^(−k·t)) / (1 − e^(−k)), t = finaleProgress. k is solved so
 * the starting rate equals the approach's rate at 130 m (continuous speed, always descending).
 */
const FINALE_K = (() => {
  const h = 1e-6;
  const rate = ((approach(approachEnd + h) - approach(approachEnd - h)) / (2 * h)) * toAuthored * (1 - FINALE_START);
  const startRate = (k: number) => (FINALE_SPAN * k) / (1 - Math.exp(-k));
  // startRate is increasing in k and equals the span at k → 0 (a linear finale).
  if (rate <= FINALE_SPAN) return 1e-6;
  let lo = 1e-6;
  let hi = 200;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (startRate(mid) < rate) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
})();

export const DIVE_START_DEPTH = DIVE_KEYFRAMES[0]![1];

/** 0 until the finale begins, then 0..1 through it. */
export function finaleProgress(progress: number): number {
  return Math.min(1, Math.max(0, (progress - FINALE_START) / (1 - FINALE_START)));
}

export function diveCurve(progress: number): number {
  if (progress <= 0) return DIVE_START_DEPTH;
  if (progress >= 1) return DIVE_END_DEPTH;
  if (progress < FINALE_START) return approach(progress * toAuthored);
  const t = finaleProgress(progress);
  return FINALE_TOP + (FINALE_SPAN * (1 - Math.exp(-FINALE_K * t))) / (1 - Math.exp(-FINALE_K));
}

export function progressForDepth(depth: number): number {
  if (depth <= DIVE_START_DEPTH) return 0;
  if (depth >= DIVE_END_DEPTH) return 1;
  return invertMonotone(diveCurve, depth, 0, 1);
}
