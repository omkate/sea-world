import { GRAVITY } from '../../data/zones/physics';
import { createRng } from '../../core/math/rng';

export interface Wave {
  /** Unit propagation direction on the XZ plane. */
  dirX: number;
  dirZ: number;
  wavelength: number;
  k: number;
  omega: number;
  amplitude: number;
  /** Gerstner steepness, normalised so crests never loop. */
  q: number;
  phase: number;
}

export interface SeaState {
  windAngle: number;
  longestWavelength: number;
  shortestWavelength: number;
  /** Amplitude / wavelength ratio for each component. */
  slope: number;
  /** Total Gerstner pinch; 1 = sharp crests on the verge of looping. */
  choppiness: number;
  spread: number;
  seed: number;
}

export const MODERATE_TRADE_WIND_SEA: SeaState = {
  windAngle: 0.65,
  longestWavelength: 64,
  shortestWavelength: 1.1,
  slope: 0.012,
  choppiness: 0.86,
  spread: 0.85,
  seed: 1337,
};

/**
 * Deep-water Gerstner components spaced geometrically in wavelength. Dispersion ω = √(gk).
 * An approximation of a wind sea; an FFT (JONSWAP) spectrum replaces it on WebGPU in a later phase.
 */
export function buildWaves(count: number, sea: SeaState = MODERATE_TRADE_WIND_SEA): Wave[] {
  const rng = createRng(sea.seed);
  const waves: Wave[] = [];
  const ratio = Math.pow(sea.shortestWavelength / sea.longestWavelength, 1 / Math.max(1, count - 1));
  for (let i = 0; i < count; i++) {
    const wavelength = sea.longestWavelength * Math.pow(ratio, i) * (0.9 + 0.2 * rng());
    const k = (2 * Math.PI) / wavelength;
    const spread = sea.spread * (0.35 + 0.65 * (i / Math.max(1, count - 1)));
    const angle = sea.windAngle + (rng() * 2 - 1) * spread;
    // Long swell carries proportionally more energy than short wind waves.
    const swellBoost = 1 + 0.9 * (1 - i / Math.max(1, count - 1));
    const amplitude = wavelength * sea.slope * swellBoost * (0.75 + 0.5 * rng());
    waves.push({
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      wavelength,
      k,
      omega: Math.sqrt(GRAVITY * k),
      amplitude,
      q: 0,
      phase: rng() * Math.PI * 2,
    });
  }
  for (const w of waves) w.q = sea.choppiness / (w.k * w.amplitude * waves.length);
  return waves;
}

/** Surface elevation at a world XZ position (ignores the small horizontal Gerstner shift). */
export function waveHeight(waves: readonly Wave[], x: number, z: number, t: number): number {
  let h = 0;
  for (const w of waves) h += w.amplitude * Math.sin(w.k * (w.dirX * x + w.dirZ * z) - w.omega * t + w.phase);
  return h;
}

export function maxCrest(waves: readonly Wave[]): number {
  return waves.reduce((s, w) => s + w.amplitude, 0);
}
