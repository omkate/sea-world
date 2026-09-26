import { invertMonotone, monotoneCubic } from '../../core/math/monotoneCubic';
import { fbm3 } from '../../core/math/noise';

/**
 * A Guam fore-reef in cross-section (x = offshore distance): reef flat at ~12 m, fore-reef
 * slope to ~44 m, a rounded drop-off and a near-vertical wall into the Philippine Sea.
 * Spur-and-groove relief and coral heads come from noise; z warps the contours so the reef
 * edge meanders instead of running in a straight line.
 */
const PROFILE = monotoneCubic(
  [-240, -30, 0, 30, 60, 68, 74, 82, 95, 200, 400, 1000, 3000],
  [11.5, 12, 20, 31, 44, 50, 75, 130, 220, 420, 900, 3000, 11500],
);

function smoothstepN(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function warp(z: number): number {
  return 4 * Math.sin(z * 0.045) + 1.5 * Math.sin(z * 0.13 + 1);
}

/** Seafloor depth (positive metres) at world x, z. */
export function reefFloorDepth(x: number, z: number): number {
  const xs = x + warp(z);
  const base = PROFILE(xs);
  // Spur-and-groove: ridges running offshore on the slope, fading on the flat and wall.
  const onSlope = Math.max(0, Math.min(1, (xs + 40) / 40)) * Math.max(0, Math.min(1, (74 - xs) / 12));
  const spurs = Math.sin(z * 0.32 + fbm3(x * 0.02, 0, z * 0.02, 2) * 3) * 1.1 * onSlope;
  const heads = fbm3(x * 0.07, 3.1, z * 0.07, 4) * 1.6 + fbm3(x * 0.35, 7.7, z * 0.35, 2) * 0.35;
  // The wall: ledges where the rock steps back, buttresses continuing the spurs downward, and
  // rugged multi-scale relief instead of a smooth ramp.
  const onWall = smoothstepN(62, 72, xs) * (1 - smoothstepN(130, 180, xs));
  const t = base / 9;
  const terraced = (Math.floor(t) + smoothstepN(0.3, 0.75, t - Math.floor(t))) * 9;
  const buttress = Math.sin(z * 0.19 + fbm3(x * 0.03, 1.7, z * 0.03, 2) * 4) * 3.5;
  const rugged = fbm3(x * 0.18, 9.1, z * 0.18, 4) * 4 + Math.abs(fbm3(x * 0.6, 4.4, z * 0.6, 2)) * 1.5;
  const wall = (terraced - base) * 0.65 - buttress - rugged;
  return base - spurs - heads + wall * onWall;
}

/** Seafloor world Y (negative) at x, z. */
export function reefFloorY(x: number, z: number): number {
  return -reefFloorDepth(x, z);
}

/** 0..1 sand cover: the grooves between spurs and open sand patches where corals do not settle. */
export function reefSand(x: number, z: number): number {
  const n = fbm3(x * 0.045, 5.3, z * 0.045, 3);
  return Math.max(0, Math.min(1, (n - 0.2) / 0.18));
}

/** Local slope angle (radians) of the reef profile. */
export function reefSlope(x: number, z: number): number {
  const e = 0.75;
  const dx = reefFloorDepth(x + e, z) - reefFloorDepth(x - e, z);
  const dz = reefFloorDepth(x, z + e) - reefFloorDepth(x, z - e);
  return Math.atan(Math.hypot(dx, dz) / (2 * e));
}

/**
 * The dive path: where the camera is (x, z) at each depth. It crosses the reef flat, glides
 * a few metres above the fore-reef slope, passes the drop-off and then moves out from the wall
 * into open water. x is solved from the reef profile so the clearance is exact, not hand-tuned.
 */
const PATH_Z = monotoneCubic([-3.5, 40, 200, 11000], [0, -48, -150, -420]);

/**
 * Height kept above the smoothed profile: noise relief adds up to ~3 m on the slope, and the
 * wall's ledges, buttresses and rugged rock can stand ~13 m proud of the profile.
 */
function pathMargin(depth: number): number {
  return 6.5 + 13 * smoothstepN(38, 58, depth) + Math.max(0, depth - 60) * 0.3;
}

const PATH_X = (() => {
  const depths: number[] = [-3.5];
  for (let d = 4; d <= 200; d += 2) depths.push(d);
  depths.push(260, 400, 700, 1000, 2000, 4000, 6000, 11000);
  const xs = depths.map((d) => {
    if (d < 4) return -58;
    const target = d + pathMargin(d);
    const xProfile = invertMonotone(PROFILE, target, -240, 3000);
    return Math.max(-58, xProfile - warp(PATH_Z(d)));
  });
  for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i]!, xs[i - 1]! + 1e-3);
  return monotoneCubic(depths, xs);
})();

export function divePathX(depth: number): number {
  return PATH_X(depth);
}

export function divePathZ(depth: number): number {
  return PATH_Z(depth);
}

/** Minimum clearance the camera keeps above the seafloor (m). */
export const CAMERA_CLEARANCE = 3;
