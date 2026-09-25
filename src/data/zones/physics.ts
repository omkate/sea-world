import { clamp, monotoneCubic, smoothstep, type MonotoneCubic } from '../../core/math/monotoneCubic';
import type { SiteProfile } from '../sites/mariana';

export const SEAWATER_DENSITY = 1025;
export const GRAVITY = 9.80665;
export const ATM_PA = 101325;

/** Absolute pressure in atm. Ignores seawater compressibility (≈1.5% low at 11 km). */
export function pressureAtm(depth: number): number {
  return 1 + (SEAWATER_DENSITY * GRAVITY * Math.max(0, depth)) / ATM_PA;
}

export type Rgb = [number, number, number];

/** Fraction of surface downwelling irradiance per band (Beer–Lambert). */
export function downwelling(depth: number, kd: readonly [number, number, number], out: Rgb = [0, 0, 0]): Rgb {
  const z = Math.max(0, depth);
  out[0] = Math.exp(-kd[0] * z);
  out[1] = Math.exp(-kd[1] * z);
  out[2] = Math.exp(-kd[2] * z);
  return out;
}

export function lightFraction(depth: number, kd: readonly [number, number, number]): number {
  const z = Math.max(0, depth);
  return (Math.exp(-kd[0] * z) + Math.exp(-kd[1] * z) + Math.exp(-kd[2] * z)) / 3;
}

export type LightLabel = 'BRIGHT' | 'DIM' | 'LOW LIGHT' | 'TRACE' | 'NONE';

export const LIGHT_THRESHOLDS: readonly (readonly [number, LightLabel])[] = [
  [1e-1, 'BRIGHT'],
  [1e-2, 'DIM'],
  [1e-4, 'LOW LIGHT'],
  [1e-10, 'TRACE'],
];

export function lightLabel(fraction: number): LightLabel {
  for (const [threshold, label] of LIGHT_THRESHOLDS) if (fraction > threshold) return label;
  return 'NONE';
}

export type ZoneId = 'surface' | 'sunlight' | 'twilight' | 'midnight' | 'abyssal' | 'hadal';

export const ZONES: readonly { id: ZoneId; name: string; top: number }[] = [
  { id: 'sunlight', name: 'SUNLIGHT ZONE', top: 0 },
  { id: 'twilight', name: 'TWILIGHT ZONE', top: 200 },
  { id: 'midnight', name: 'MIDNIGHT ZONE', top: 1000 },
  { id: 'abyssal', name: 'ABYSSAL ZONE', top: 4000 },
  { id: 'hadal', name: 'HADAL ZONE', top: 6000 },
];

export const ZONE_HYSTERESIS = 2;

export function zoneIndexAt(depth: number): number {
  let idx = 0;
  for (let i = 0; i < ZONES.length; i++) if (depth >= ZONES[i]!.top) idx = i;
  return idx;
}

/** Zone with hysteresis: a boundary must be crossed by ZONE_HYSTERESIS m before switching. */
export function zoneIndexWithHysteresis(depth: number, previous: number | null): number {
  if (previous === null || !ZONES[previous]) return zoneIndexAt(depth);
  const top = ZONES[previous]!.top;
  const nextTop = ZONES[previous + 1]?.top ?? Infinity;
  if (depth >= nextTop + ZONE_HYSTERESIS || depth < top - ZONE_HYSTERESIS) return zoneIndexAt(depth);
  return previous;
}

const temperatureCurves = new WeakMap<SiteProfile, MonotoneCubic>();

export function temperatureC(depth: number, site: SiteProfile): number {
  let curve = temperatureCurves.get(site);
  if (!curve) {
    curve = monotoneCubic(
      site.temperature.map((p) => p[0]),
      site.temperature.map((p) => p[1]),
    );
    temperatureCurves.set(site, curve);
  }
  return curve(clamp(depth, 0, site.maxDepth));
}

/**
 * Exposure compensation (EV) of a low-light documentary camera: it adapts to 75% of the
 * light loss, so the twilight zone fades gradually, and stops adapting where sunlight ends
 * (1,000 m) so the midnight zone is genuinely black apart from biological light.
 */
export const EXPOSURE_ADAPTATION = 0.75;
export const SUNLIGHT_LIMIT_DEPTH = 1000;

export function exposureEV(depth: number, kd: readonly [number, number, number]): number {
  const z = clamp(depth, 0, SUNLIGHT_LIMIT_DEPTH);
  return EXPOSURE_ADAPTATION * Math.log2(1 / lightFraction(z, kd));
}

export function maxExposureEV(kd: readonly [number, number, number]): number {
  return exposureEV(SUNLIGHT_LIMIT_DEPTH, kd);
}

/** Relative suspended-particle load: surface plankton, deep-chlorophyll bump, marine snow floor. */
export function particleDensity(depth: number, chlorophyllMaxDepth: number): number {
  const z = Math.max(0, depth);
  const surface = Math.exp(-z / 90);
  const dcm = Math.exp(-(((z - chlorophyllMaxDepth) / 45) ** 2));
  const snow = 0.32 * Math.exp(-z / 2500) + 0.14;
  return clamp(0.55 * surface + 0.35 * dcm + snow, 0, 1);
}

/** Extra scattering from plankton, 1/m, added to the clear-water view extinction. */
export function turbidity(depth: number, chlorophyllMaxDepth: number): number {
  const z = Math.max(0, depth);
  return 0.012 * Math.exp(-z / 60) + 0.01 * Math.exp(-(((z - chlorophyllMaxDepth) / 40) ** 2));
}

/** 0 above water → 1 fully submerged; smooth over the first metre. */
export function submersion(depth: number): number {
  return smoothstep(-0.25, 1.0, depth);
}
