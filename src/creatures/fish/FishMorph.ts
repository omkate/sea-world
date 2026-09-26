/**
 * Body plan of a bony fish, in units of total length (snout tip z = +0.5, tail tip z = −0.5).
 * `profile` rows are [s, halfHeight, halfWidth, centreY] where s runs 0 (snout) → 1 (tail tip).
 */
export interface FishMorph {
  profile: readonly (readonly [number, number, number, number])[];
  /** s at the caudal peduncle, where the tail fin begins. */
  peduncle: number;
  /** Cross-section superellipse exponent (2 = ellipse, higher = boxier flanks). */
  sectionExponent: number;
  caudal: { shape: 'forked' | 'lunate' | 'emarginate' | 'truncate' | 'rounded'; halfSpan: number; length: number };
  /** Dorsal/anal fins: [s, height] rows along the back / belly. */
  dorsal: readonly (readonly [number, number])[];
  anal: readonly (readonly [number, number])[];
  pectoral: { s: number; length: number; width: number };
  pelvic: { s: number; length: number } | null;
  eye: { s: number; v: number; radius: number };
  swim: { style: 'labriform' | 'carangiform' | 'subcarangiform'; bodyWave: number; cruiseBL: number };
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface FishBand {
  /** Centre along the body (s) at mid-height, half width in s, slant in s per unit of v. */
  s: number;
  halfWidth: number;
  slant: number;
  color: Rgb;
  /** Only between these normalised heights (−1 belly … 1 back). */
  vMin?: number;
  vMax?: number;
  /** Soft border colour drawn around the band (e.g. black edge of a clownfish bar). */
  edge?: Rgb;
}

export interface FishStripes {
  spacing: number;
  width: number;
  /** Stripe direction angle in radians in the (s, v) plane. */
  angle: number;
  color: Rgb;
  sMin: number;
  sMax: number;
  vMin: number;
  vMax: number;
}

export interface FishPattern {
  back: Rgb;
  belly: Rgb;
  /** Normalised height of the back/belly transition and its softness. */
  bellyLine: number;
  bellySoftness: number;
  bands: readonly FishBand[];
  stripes: readonly FishStripes[];
  fins: { dorsal: Rgb; anal: Rgb; caudal: Rgb; pectoral: Rgb };
  iris: Rgb;
  /** 0..1 scale shimmer (guanine iridescence). */
  sheen: number;
  roughness: number;
}

export const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });
