import { Vector3 } from 'three/webgpu';
import { smoothstep } from '../../core/math/monotoneCubic';
import { CASTLE_SITE, WRECK_SITE, reefFloorY } from '../reef/ReefSite';

/**
 * The finale as a shot list, keyed on finale progress t (0..1, `finaleProgress`). Every position
 * is a pure function of t, so scrolling back rewinds the film exactly.
 *
 *   0.00–0.30  the wreck: in through the open stern, along the hold, out over the bow
 *   0.30–0.46  across the sand; a sperm whale glides overhead; the castle looms out of the blue
 *   0.46–0.62  the castle: through the gap in the outer bastion (door 1), up to the gatehouse and
 *              into its middle arch (door 2); the arch's dark is a cut
 *   0.62–0.80  out of the inner arch into the courtyard (door 3), across to the carved portal
 *   0.80–0.93  the chest at the portal: the lid opens; the crown rises and settles on his head
 *   0.93–0.97  the light sweeps down him: diver → king of the sea, trident in hand
 *   0.97–1.00  crane up and back; end card
 *
 * Keys are written in the frame they were measured in, then converted to world once:
 * - 'hull': x across the wreck from its centreline (+x toward the scanned side), y up from its
 *   base, z along the keel (+z bow). The hull is 28 m long.
 * - 'castle': the castle scan's own units (≈3.47 m each), y up from the scan's lowest point; the
 *   doorways were located in the scan (ray casts and clearance probes against its triangles).
 */
type Frame = 'hull' | 'castle' | 'world';
type Key = readonly [t: number, frame: Frame, x: number, y: number, z: number];
export type WorldKey = readonly [t: number, x: number, y: number, z: number];

/** How far the hull has settled into the sand (m). */
export const WRECK_SUNK = 0.6;
export const WRECK_BASE_Y = reefFloorY(WRECK_SITE.x, WRECK_SITE.z) - WRECK_SUNK;

/** Metres per castle-scan unit: the scan's widest extent (31.73 units) is CASTLE_SITE.size. */
export const CASTLE_UNIT = CASTLE_SITE.size / 31.73;
/** The scan's earthworks are sunk 1 unit into the sand, hiding the cut edges of its hill. */
export const CASTLE_SINK = 1.0;
export const CASTLE_BASE_Y = reefFloorY(CASTLE_SITE.x, CASTLE_SITE.z) - CASTLE_SINK * CASTLE_UNIT;

/** Hull coordinates → world (three.js rotation.y of WRECK_SITE.yaw: x → (c, 0, −s), z → (s, 0, c)). */
export function hullToWorld(p: Vector3, baseY: number, out: Vector3): Vector3 {
  const s = Math.sin(WRECK_SITE.yaw), c = Math.cos(WRECK_SITE.yaw);
  return out.set(WRECK_SITE.x + p.x * c + p.z * s, baseY + p.y, WRECK_SITE.z - p.x * s + p.z * c);
}

/** Castle-scan units → world. */
export function castleToWorld(p: Vector3, out: Vector3): Vector3 {
  const s = Math.sin(CASTLE_SITE.yaw), c = Math.cos(CASTLE_SITE.yaw), k = CASTLE_UNIT;
  return out.set(CASTLE_SITE.x + (p.x * c + p.z * s) * k, CASTLE_BASE_Y + p.y * k, CASTLE_SITE.z + (-p.x * s + p.z * c) * k);
}

/** World → castle-scan units (for checks against the scan). */
export function worldToCastle(p: Vector3, out: Vector3): Vector3 {
  const s = Math.sin(CASTLE_SITE.yaw), c = Math.cos(CASTLE_SITE.yaw), k = CASTLE_UNIT;
  const dx = (p.x - CASTLE_SITE.x) / k, dz = (p.z - CASTLE_SITE.z) / k;
  return out.set(dx * c - dz * s, (p.y - CASTLE_BASE_Y) / k, dx * s + dz * c);
}

const v = new Vector3();
const w = new Vector3();
function toWorld(frame: Frame, x: number, y: number, z: number, out: Vector3): Vector3 {
  v.set(x, y, z);
  if (frame === 'hull') return hullToWorld(v, WRECK_BASE_Y, out);
  if (frame === 'castle') return castleToWorld(v, out);
  return out.copy(v);
}

// The swim across the sand: from off the wreck's bow to outside the castle's bastion gap.
const BOW_OUT = toWorld('hull', 0.6, 6.5, 19, new Vector3());
const GATE_OUT = toWorld('castle', 13.6, 2.2, 4.75, new Vector3());
const ACROSS = new Vector3().subVectors(GATE_OUT, BOW_OUT).setY(0).normalize();
const SIDE = new Vector3(-ACROSS.z, 0, ACROSS.x);
/** A point on the swim across, `f` of the way, `side` metres to the side, `up` metres above the sand. */
function across(f: number, side: number, up: number): [number, number, number] {
  w.lerpVectors(BOW_OUT, GATE_OUT, f).addScaledVector(SIDE, side);
  return [w.x, reefFloorY(w.x, w.z) + up, w.z];
}
const A = (t: number, f: number, side: number, up: number): Key => [t, 'world', ...across(f, side, up)];

/** The whale's pass across the swim to the castle: it glides over the diver and the lens. */
const WHALE_T: readonly [number, number] = [0.35, 0.46];
const WHALE_FROM = new Vector3(...across(0.45, -34, 13));
const WHALE_TO = new Vector3(...across(0.6, 34, 12));
/** Where the whale is at t (world). */
export function whaleAt(t: number, out: Vector3): Vector3 {
  return out.lerpVectors(WHALE_FROM, WHALE_TO, Math.min(1, Math.max(0, (t - WHALE_T[0]) / (WHALE_T[1] - WHALE_T[0]))));
}
/** A key looking at the whale at t (so it is always in frame while it passes). */
const AT_WHALE = (t: number): Key => {
  whaleAt(t, w);
  return [t, 'world', w.x, w.y, w.z];
};

/** Where the cut falls: the diver is in the dark of the gatehouse arch. Tracks never interpolate across it. */
export const CUT_T = 0.623;

const DIVER: readonly Key[] = [
  [0.04, 'hull', 0, 3.4, -24],
  [0.096, 'hull', 0, 2.7, -16.5],
  [0.16, 'hull', 0, 2.5, -7],
  [0.216, 'hull', 0, 2.8, 1.5],
  [0.256, 'hull', 0, 3.2, 7],
  [0.292, 'hull', 0, 4.6, 11],
  [0.33, 'hull', 0.6, 6.5, 19],
  A(0.395, 0.5, 0, 4.5),
  [0.455, 'castle', 13.6, 2.2, 4.75],
  [0.48, 'castle', 11, 1.8, 3.26],
  [0.505, 'castle', 9, 2.35, 2.13],
  [0.525, 'castle', 8, 3.1, 1.55],
  [0.545, 'castle', 6.85, 3.05, 2.66],
  [0.565, 'castle', 5.5, 3, 4.1],
  [0.585, 'castle', 4.71, 2.95, 4.99],
  [0.605, 'castle', 4, 2.95, 3.9],
  [0.62, 'castle', 3.7, 2.95, 3.45],
  // — cut —
  [0.626, 'castle', 3.05, 1.9, 0.95],
  [0.645, 'castle', 2.85, 1.9, 0.65],
  [0.7, 'castle', 2.7, 1.95, -2.2],
  [0.76, 'castle', 1.75, 1.95, -6],
  [0.8, 'castle', 1.6, 1.9, -7.2],
  // Settles low before the chest (fins stir the silt)…
  [0.86, 'castle', 2.1, 1.66, -7.55],
  [0.92, 'castle', 2.24, 1.62, -7.65],
  // …and rises a little as he is crowned and changed.
  [0.96, 'castle', 2.24, 1.8, -7.65],
  [1, 'castle', 2.24, 2.05, -7.65],
];

const CAMERA: readonly Key[] = [
  [0.032, 'hull', -8, 9, -28],
  [0.08, 'hull', -11, 6.5, -29],
  [0.12, 'hull', -2, 3.9, -23],
  [0.168, 'hull', 0.3, 3.6, -11],
  [0.216, 'hull', 0.3, 3.7, -2],
  [0.256, 'hull', -0.4, 3.6, 2.5],
  [0.296, 'hull', -1, 3.4, 4.5],
  [0.33, 'hull', -3, 3.2, 13],
  A(0.38, 0.36, -3, 1.8),
  A(0.415, 0.56, 3, 2),
  [0.45, 'castle', 17.5, 2.6, 7.2],
  [0.48, 'castle', 14.5, 2.7, 6.2],
  [0.51, 'castle', 10.6, 2.7, 3.6],
  [0.54, 'castle', 8.9, 3.6, 2.6],
  [0.57, 'castle', 6.6, 3.6, 4.6],
  [0.595, 'castle', 5.6, 3.3, 5.9],
  [0.615, 'castle', 4.75, 3.2, 4.9],
  // — cut —
  [0.626, 'castle', 2.3, 2.15, -0.6],
  [0.66, 'castle', 2.3, 2.2, -0.9],
  [0.71, 'castle', 1.7, 2.6, -1.5],
  [0.76, 'castle', 0.2, 2.6, -5.2],
  // Beside the diver (never behind: his fins reach back toward the lens), looking past his head.
  [0.81, 'castle', 1.84, 2.7, -6.48],
  [0.86, 'castle', 2.49, 1.8, -6.79],
  // Push in on the open chest, then over it to its far side: the diver's mask lit by the gold.
  [0.9, 'castle', 2.4, 1.72, -7.1],
  [0.935, 'castle', 3.14, 1.75, -7.16],
  // Hold on him through the transformation, pushing in a little.
  [0.965, 'castle', 3.02, 1.85, -7.2],
  // Crane up and back, keeping the king in the lower third under the end card.
  [0.985, 'castle', 2.95, 3, -6.8],
  [1, 'castle', 2.6, 4.6, -6.2],
];

const TARGET: readonly Key[] = [
  [0.032, 'hull', 0, 2, -6],
  [0.08, 'hull', 0, 2.5, -14],
  [0.12, 'hull', 0, 2.7, -14],
  [0.168, 'hull', 0, 2.6, -4],
  [0.216, 'hull', 0, 2.9, 6],
  [0.256, 'hull', 0, 3.8, 10],
  [0.296, 'hull', 0, 5.5, 13],
  [0.33, 'hull', 0.6, 6.5, 19],
  AT_WHALE(0.38),
  AT_WHALE(0.415),
  [0.45, 'castle', 9, 2.5, 2.5],
  [0.48, 'castle', 8, 2.6, 1.6],
  [0.51, 'castle', 7, 3, 2.2],
  [0.54, 'castle', 5.8, 3, 3.5],
  [0.57, 'castle', 4.3, 3, 4.2],
  [0.595, 'castle', 3.9, 2.95, 3.75],
  [0.615, 'castle', 3.6, 2.9, 3.3],
  // — cut —
  [0.626, 'castle', 3.05, 1.9, 0.9],
  [0.66, 'castle', 2.9, 1.95, 0.2],
  [0.71, 'castle', 3, 1.9, -2.6],
  [0.76, 'castle', 2.3, 1.8, -7.6],
  [0.81, 'castle', 2.52, 1.45, -7.83],
  [0.86, 'castle', 2.52, 1.5, -7.83],
  [0.9, 'castle', 2.52, 1.45, -7.83],
  [0.935, 'castle', 2.3, 1.75, -7.66],
  [0.965, 'castle', 2.27, 1.9, -7.66],
  [0.985, 'castle', 2.24, 2.35, -7.65],
  [1, 'castle', 2.24, 2.9, -7.65],
];

function track(keys: readonly Key[]): WorldKey[] {
  return keys.map(([t, f, x, y, z]) => {
    toWorld(f, x, y, z, w);
    return [t, w.x, w.y, w.z] as const;
  });
}

export const DIVER_KEYS = track(DIVER);
export const CAMERA_KEYS = track(CAMERA);
export const TARGET_KEYS = track(TARGET);

/** The whale's pass (world), for the director and the tests. */
export const WHALE_PASS = { t: WHALE_T, from: WHALE_FROM, to: WHALE_TO };

/**
 * The chest, on the courtyard floor 1.6 m before the carved portal (whose door face is at castle
 * (2.9, −8.08), in a wall running along (0.551, 0.835)), its front to the courtyard (world heading).
 */
export const CHEST_AT = toWorld('castle', 2.52, 1.29, -7.83, new Vector3());
export const CHEST_HEADING = Math.atan2(-0.835, 0.551) + CASTLE_SITE.yaw;

/** The courtyard floor (world y) and whether a world point is over it (castle-scan wall frame). */
export const COURTYARD_FLOOR_Y = CASTLE_BASE_Y + 1.25 * CASTLE_UNIT;
export function overCourtyard(p: Vector3): boolean {
  worldToCastle(p, w);
  const rx = w.x - 2.02, rz = w.z - 2.15;
  const along = rx * 0.835 - rz * 0.551, out = rx * 0.551 + rz * 0.835;
  return along > -3.2 && along < 7.6 && out > -9.4 && out < -0.1;
}
/** Floor height (world y) under a point in the finale: the courtyard's paving, else the sand. */
export function finaleFloorY(p: Vector3): number {
  return overCourtyard(p) ? COURTYARD_FLOOR_Y : reefFloorY(p.x, p.z);
}

/**
 * Fish of the finale's sets: mackerel scad schooling over the wreck's hold and the courtyard (the
 * diver swims through them and they part), raccoon butterflyfish around the frames and the
 * portal. Both are recorded at 150 m off Guam (to 400 m and 170 m). Homes in hull / castle frames.
 */
export const FINALE_FISH: readonly { species: string; frame: 'hull' | 'castle'; at: readonly [number, number, number]; radius: number; band: readonly [number, number]; count: number }[] = [
  { species: 'decapterus-macarellus', frame: 'hull', at: [0, 3.3, -3], radius: 5, band: [1.9, 4.6], count: 150 },
  { species: 'chaetodon-lunula', frame: 'hull', at: [2.4, 1.6, -8], radius: 2.5, band: [0.9, 2.6], count: 3 },
  { species: 'chaetodon-lunula', frame: 'hull', at: [-2.4, 1.4, 3], radius: 2.5, band: [0.9, 2.4], count: 2 },
  { species: 'decapterus-macarellus', frame: 'castle', at: [3.2, 2.5, -3.4], radius: 9, band: [1.95, 3.1], count: 180 },
  { species: 'chaetodon-lunula', frame: 'castle', at: [1.9, 1.65, -6.6], radius: 3, band: [1.45, 2.1], count: 5 },
  { species: 'chaetodon-lunula', frame: 'castle', at: [5.2, 3.0, 4.8], radius: 3, band: [2.6, 3.4], count: 4 },
];
/** A finale frame point → world. */
export function finaleToWorld(frame: 'hull' | 'castle', x: number, y: number, z: number, out: Vector3): Vector3 {
  return toWorld(frame, x, y, z, out);
}

/** How much the finale owns each part of the picture at t. */
export const finaleWeights = (t: number) => ({
  camera: smoothstep(0, 0.056, t),
  diver: smoothstep(0.012, 0.064, t),
  letterbox: smoothstep(0.024, 0.08, t),
  /** Black for the cut through the gatehouse arch. */
  fade: smoothstep(0.604, 0.618, t) * (1 - smoothstep(0.628, 0.646, t)),
  /** The chest lid (0 shut → 1 open) and the crown's glow. */
  lid: smoothstep(0.835, 0.885, t),
  glow: smoothstep(0.85, 0.9, t),
  /** The crown rises out of the chest and floats to his head (0 → 1), where it stays. */
  crownFly: smoothstep(0.892, 0.927, t),
  /** A flare of its light as it settles. */
  flash: smoothstep(0.925, 0.932, t) * (1 - smoothstep(0.935, 0.95, t)),
  /** The transformation sweeping down him from the crown, diver → king of the sea. */
  sweep: smoothstep(0.932, 0.962, t),
  /** He straightens up in the water as the crown comes to him… */
  upright: smoothstep(0.9, 0.93, t),
  /** …and the trident forms in the king's hand. */
  trident: smoothstep(0.955, 0.972, t),
  endCard: smoothstep(0.978, 0.998, t),
});

function catmullRom(p0: number, p1: number, p2: number, p3: number, s: number): number {
  const s2 = s * s;
  return 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (-p0 + 3 * p1 - 3 * p2 + p3) * s2 * s);
}

/**
 * Catmull–Rom through the keys at t, eased within each segment so the camera settles on a key
 * rather than passing it at speed; never across the cut (each side is its own shot).
 */
export function sampleKeys(keys: readonly WorldKey[], t: number, out: Vector3): Vector3 {
  const after = t >= CUT_T;
  let lo = 0;
  let hi = keys.length - 1;
  const cut = keys.findIndex((k) => k[0] > CUT_T);
  if (cut > 0) {
    if (after) lo = cut;
    else hi = cut - 1;
  }
  const first = keys[lo]!, last = keys[hi]!;
  if (t <= first[0]) return out.set(first[1], first[2], first[3]);
  if (t >= last[0]) return out.set(last[1], last[2], last[3]);
  let i = lo;
  while (keys[i + 1]![0] < t) i++;
  const k0 = keys[Math.max(lo, i - 1)]!, k1 = keys[i]!, k2 = keys[i + 1]!, k3 = keys[Math.min(hi, i + 2)]!;
  const u = (t - k1[0]) / (k2[0] - k1[0]);
  const s = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
  return out.set(catmullRom(k0[1], k1[1], k2[1], k3[1], s), catmullRom(k0[2], k1[2], k2[2], k3[2], s), catmullRom(k0[3], k1[3], k2[3], k3[3], s));
}
