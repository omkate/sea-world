import type { Rgb } from '../../data/zones/physics';

/** Clear-ocean absorption a(λ) (1/m) for R, G, B bands (pure-water dominated). */
export const ABSORPTION: Rgb = [0.35, 0.062, 0.017];
/** Particle + molecular scattering b(λ) (1/m) in clear oligotrophic water. */
export const SCATTER: Rgb = [0.012, 0.018, 0.026];
/** Relative spectral weight of plankton turbidity added to scattering. */
export const TURBIDITY_TINT: Rgb = [0.8, 0.95, 0.9];
/** Scene-linear sun radiance entering the water, tuned against the sky model. */
export const SUN_RADIANCE = 0.32;
/** Henyey–Greenstein asymmetry for ocean particles (strongly forward scattering). */
export const PHASE_G = 0.7;
export const PHASE_WEIGHT = 0.15;
/** Depth scale over which the light field loses its sun direction. */
export const DIRECTIONAL_DEPTH_SCALE = 80;

/**
 * Maps the three simulated wavebands to display RGB. The band that survives at depth is
 * ~475 nm cyan-blue, not the sRGB blue primary, so it leaks into green. Row-major 3×3.
 */
export const BAND_TO_DISPLAY: readonly number[] = [1.0, 0.04, 0.0, 0.03, 0.92, 0.2, 0.0, 0.12, 1.0];

export function extinction(turbidity: number, out: Rgb = [0, 0, 0]): Rgb {
  for (let i = 0; i < 3; i++) out[i] = ABSORPTION[i]! + SCATTER[i]! + turbidity * TURBIDITY_TINT[i]!;
  return out;
}

export function scattering(turbidity: number, out: Rgb = [0, 0, 0]): Rgb {
  for (let i = 0; i < 3; i++) out[i] = SCATTER[i]! + turbidity * TURBIDITY_TINT[i]!;
  return out;
}

/**
 * Single-scattered radiance along a ray from depth z0 travelling with vertical direction
 * cosine dirY (+1 = straight up) for distance D, with downwelling light decaying as e^(−Kd z):
 *   b·L0·e^(−Kd z0) · (1 − e^(−(σ − Kd·dirY)·D)) / (σ − Kd·dirY)
 */
export function inscatter(
  z0: number,
  dirY: number,
  distance: number,
  turbidity: number,
  kd: readonly [number, number, number],
  out: Rgb = [0, 0, 0],
): Rgb {
  const z = Math.max(0, z0);
  for (let i = 0; i < 3; i++) {
    const b = SCATTER[i]! + turbidity * TURBIDITY_TINT[i]!;
    const sigma = ABSORPTION[i]! + b;
    const s = Math.max(sigma - kd[i]! * dirY, 0.004);
    const along = Number.isFinite(distance) ? 1 - Math.exp(-s * distance) : 1;
    out[i] = (b * SUN_RADIANCE * Math.exp(-kd[i]! * z) * along) / s;
  }
  return out;
}

/**
 * Documentary custom white balance: underwater cameras are white-balanced for the depth they
 * film at, which restores part of the red and green the water column removed. Gains are
 * relative to blue, partial (strength < 1), capped, then normalised so green is unchanged
 * (the dominant band of the water itself), which keeps overall brightness steady.
 */
export const WHITE_BALANCE_STRENGTH = 0.55;
export const WHITE_BALANCE_MAX_GAIN = 7;

export function whiteBalance(depth: number, kd: readonly [number, number, number], strength: number, out: Rgb = [1, 1, 1]): Rgb {
  const z = Math.max(0, depth);
  const blue = Math.exp(-kd[2] * z);
  for (let i = 0; i < 3; i++) {
    const ratio = blue / Math.max(Math.exp(-kd[i]! * z), 1e-12);
    out[i] = Math.min(WHITE_BALANCE_MAX_GAIN, ratio ** strength);
  }
  const g = out[1];
  for (let i = 0; i < 3; i++) out[i] = out[i]! / g;
  return out;
}
