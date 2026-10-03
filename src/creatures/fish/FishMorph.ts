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
  swim: { style: 'labriform' | 'carangiform' | 'subcarangiform' | 'thunniform'; bodyWave: number; cruiseBL: number };
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

export interface FishLine {
  /** Normalised height of the line's centre, and its half height at the snout and tail ends. */
  v: number;
  halfHeight: number;
  halfHeightTail: number;
  color: Rgb;
  sMin: number;
  sMax: number;
}

export interface FishSpots {
  /** Grid cell size in s; cells are stretched in v by `aspect` so spots stay round on the flank. */
  cell: number;
  aspect: number;
  /** Spot radius as a fraction of the cell. */
  radius: number;
  color: Rgb;
  sMin: number;
  sMax: number;
  vMin: number;
  vMax: number;
}

export interface PhotophoreRow {
  /** Normalised height of the row, its extent along the body, and how many organs it holds. */
  v: number;
  sMin: number;
  sMax: number;
  count: number;
  /** Organ radius in units of body length. */
  radius: number;
}

/** Light organs. They glow in camera-adapted units, like the plankton flashes. */
export interface FishPhotophores {
  color: Rgb;
  rows: readonly PhotophoreRow[];
  /** Steady glow relative to the adapted exposure (1 ≈ a faint point of light). */
  brightness: number;
  /** Occasional brighter flashes (signalling), every ~5–12 s per fish. */
  flash: boolean;
  /**
   * Flashes sweep through the group as waves (a band of light crossing the layer every few
   * seconds) instead of each fish flashing on its own timer.
   */
  flashWave?: boolean;
  /** A ventral glow matched to the downwelling light, hiding the silhouette from below. */
  counterillumination: boolean;
}

export interface FishPattern {
  back: Rgb;
  belly: Rgb;
  /** Normalised height of the back/belly transition and its softness. */
  bellyLine: number;
  bellySoftness: number;
  bands: readonly FishBand[];
  stripes: readonly FishStripes[];
  /** Lengthwise lines (e.g. a cleaner wrasse's lateral stripe). */
  lines?: readonly FishLine[];
  /** Jittered round spots (e.g. a triggerfish's belly spots). */
  spots?: readonly FishSpots[];
  fins: { dorsal: Rgb; anal: Rgb; caudal: Rgb; pectoral: Rgb };
  iris: Rgb;
  /** 0..1 scale shimmer (guanine iridescence). */
  sheen: number;
  roughness: number;
  photophores?: FishPhotophores;
  /**
   * Mirror flanks (0..1): an upright mirror reflects the water beside it and vanishes; tilted,
   * it catches the much brighter water overhead and flashes (hatchetfish, lanternfish).
   */
  mirror?: number;
}

export const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });
