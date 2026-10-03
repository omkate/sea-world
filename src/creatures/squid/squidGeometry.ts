import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';

export const SQUID_PART = { mantle: 0, fin: 1, head: 2, arm: 3, tentacle: 4, web: 5 } as const;

/**
 * Body plan in units of total length, mantle tip at +y, arms toward −y. The collar (where the
 * mantle meets the head) sits at y = 0.
 */
export interface SquidShape {
  mantleLength: number;
  mantleRadius: number;
  headRadius: number;
  /** Rounded fins at the mantle tip: radius, and how far up the mantle they sit (0 tip … 1 collar). */
  finRadius: number;
  finPosition: number;
  armLength: number;
  armRadius: number;
  /** Fraction of the arms joined by web (cock-eyed and vampire squid have deep webs). */
  web: number;
  tentacleLength: number;
  /** Fraction of each tentacle that is club. */
  club: number;
}

/** Cock-eyed (jewel) squid: short stubby mantle, big head, rounded terminal fins, webbed arms. */
export const JEWEL_SQUID: SquidShape = {
  mantleLength: 0.34, mantleRadius: 0.11, headRadius: 0.1, finRadius: 0.1, finPosition: 0.15,
  armLength: 0.36, armRadius: 0.02, web: 0.4, tentacleLength: 0.5, club: 0.2,
};

/** Giant squid: long mantle with small terminal fins, short arms, two very long tentacles. */
export const GIANT_SQUID: SquidShape = {
  mantleLength: 0.27, mantleRadius: 0.035, headRadius: 0.03, finRadius: 0.04, finPosition: 0.1,
  armLength: 0.12, armRadius: 0.008, web: 0, tentacleLength: 0.62, club: 0.12,
};

/**
 * Vampire squid: a bulbous mantle with ear-like fins at its sides, large eyes, and eight arms
 * joined almost to their tips by a deep web (the cloak); no tentacles (only retractile filaments).
 */
export const VAMPIRE_SQUID: SquidShape = {
  mantleLength: 0.4, mantleRadius: 0.15, headRadius: 0.12, finRadius: 0.09, finPosition: 0.45,
  armLength: 0.42, armRadius: 0.02, web: 0.85, tentacleLength: 0, club: 0,
};

/** Where the head sphere's centre sits (y) for a shape. */
export const headCentre = (s: SquidShape): number => -s.headRadius * 0.7;

const ARMS = 8;

interface Builder {
  pos: number[];
  squid: number[];
  idx: number[];
}

function ring(b: Builder, y: number, r: number, segments: number, part: number, t: number): number {
  const base = b.pos.length / 3;
  for (let j = 0; j < segments; j++) {
    const a = (j / segments) * Math.PI * 2;
    b.pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    b.squid.push(part, t, a, 0);
  }
  return base;
}

function stitch(b: Builder, r0: number, r1: number, segments: number): void {
  for (let j = 0; j < segments; j++) {
    const j1 = (j + 1) % segments;
    b.idx.push(r0 + j, r1 + j, r0 + j1, r0 + j1, r1 + j, r1 + j1);
  }
}

/** A tapered tube along a polyline (arms and tentacles). */
function tube(b: Builder, points: readonly [number, number, number][], radius: (t: number) => number, part: number, angle: number, seed: number, segments = 6): void {
  let prev = -1;
  points.forEach((p, k) => {
    const t = k / (points.length - 1);
    const q = points[Math.min(k + 1, points.length - 1)]!;
    const o = points[Math.max(k - 1, 0)]!;
    const tx = q[0] - o[0], ty = q[1] - o[1], tz = q[2] - o[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    const ax = -tz / tl, az = tx / tl;
    const al = Math.hypot(ax, az);
    // A segment pointing straight down has no horizontal part: fall back to the x axis.
    const n1 = al > 1e-6 ? [ax / al, 0, az / al] : [1, 0, 0];
    const n2 = [(ty / tl) * n1[2]!, (tz / tl) * n1[0]! - (tx / tl) * n1[2]!, -(ty / tl) * n1[0]!];
    const base = b.pos.length / 3;
    const r = radius(t);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const c = Math.cos(a) * r, s = Math.sin(a) * r;
      b.pos.push(p[0] + n1[0]! * c + n2[0]! * s, p[1] + n1[1]! * c + n2[1]! * s, p[2] + n1[2]! * c + n2[2]! * s);
      b.squid.push(part, t, angle, seed);
    }
    if (prev >= 0) stitch(b, prev, base, segments);
    prev = base;
  });
}

/**
 * A squid built from a `SquidShape`: lathed mantle, terminal fins, head sphere (eyes are painted
 * on in the shader), eight arms with an optional web over their inner part, and two tentacles
 * ending in clubs. Attribute aSquid = (part id, t along the part, angle around the body, seed).
 */
export function createSquidGeometry(shape: SquidShape, radial = 18): BufferGeometry {
  const b: Builder = { pos: [], squid: [], idx: [] };
  const hc = headCentre(shape);
  const armTop = hc - shape.headRadius * 0.6;

  // Mantle: from the collar to a blunt tip, fullest a third of the way back.
  const rings = 14;
  let prev = -1;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = shape.mantleLength * t;
    const profile = Math.sin(Math.min(1, (t + 0.12) / 0.45) * Math.PI * 0.5) * Math.sqrt(Math.max(0, 1 - t ** 2.6));
    const base = ring(b, y, Math.max(0.002, shape.mantleRadius * profile), radial, SQUID_PART.mantle, t);
    if (prev >= 0) stitch(b, prev, base, radial);
    prev = base;
  }

  // Head.
  const lat = 10;
  prev = -1;
  for (let i = 0; i <= lat; i++) {
    const phi = (i / lat) * Math.PI;
    const base = ring(b, hc + Math.cos(phi) * shape.headRadius, Math.max(0.002, Math.sin(phi) * shape.headRadius), radial, SQUID_PART.head, i / lat);
    if (prev >= 0) stitch(b, prev, base, radial);
    prev = base;
  }

  // Fins: two rounded flaps in the side plane, near the mantle tip.
  const finY = shape.mantleLength * (1 - shape.finPosition) - shape.finRadius * 0.4;
  for (const side of [-1, 1]) {
    const centre = b.pos.length / 3;
    const root = shape.mantleRadius * 0.45;
    b.pos.push(side * root, finY, 0);
    b.squid.push(SQUID_PART.fin, 0, side, 0);
    const steps = 10;
    for (let k = 0; k <= steps; k++) {
      const a = -Math.PI / 2 + (k / steps) * Math.PI;
      b.pos.push(side * (root + Math.cos(a) * shape.finRadius), finY + Math.sin(a) * shape.finRadius, 0);
      b.squid.push(SQUID_PART.fin, 1, side, 0);
      if (k > 0) b.idx.push(centre, centre + k, centre + k + 1);
    }
  }

  // Arms (ring of eight, curving gently outward as they hang), web, tentacles.
  const armPoint = (angle: number, t: number, length: number, spread: number): [number, number, number] => {
    const r = shape.headRadius * 0.55 + spread * Math.sin(t * Math.PI * 0.6);
    return [Math.cos(angle) * r, armTop - length * t, Math.sin(angle) * r];
  };
  const samples = 10;
  const paths: [number, number, number][][] = [];
  for (let i = 0; i < ARMS; i++) {
    const angle = (i / ARMS) * Math.PI * 2 + Math.PI / ARMS;
    const length = shape.armLength * (1 + 0.12 * Math.cos(angle * 2));
    const path = Array.from({ length: samples }, (_, k) => armPoint(angle, k / (samples - 1), length, shape.armLength * 0.25));
    paths.push(path);
    tube(b, path, (t) => shape.armRadius * (1 - t * 0.8), SQUID_PART.arm, angle, i / ARMS);
  }
  if (shape.web > 0) {
    const rows = Math.max(2, Math.round(samples * shape.web));
    for (let i = 0; i < ARMS; i++) {
      const a = paths[i]!, c = paths[(i + 1) % ARMS]!;
      const base = b.pos.length / 3;
      for (let k = 0; k < rows; k++) {
        b.pos.push(...a[k]!, ...c[k]!);
        const t = k / (rows - 1);
        b.squid.push(SQUID_PART.web, t, i, 0, SQUID_PART.web, t, i + 1, 0);
        if (k > 0) {
          const r = base + (k - 1) * 2;
          b.idx.push(r, r + 2, r + 1, r + 1, r + 2, r + 3);
        }
      }
    }
  }
  for (const [i, angle] of (shape.tentacleLength > 0 ? [Math.PI * 0.5, Math.PI * 1.5] : []).entries()) {
    const path = Array.from({ length: 16 }, (_, k) => armPoint(angle, k / 15, shape.tentacleLength, shape.armLength * 0.12));
    tube(b, path, (t) => shape.armRadius * (t > 1 - shape.club ? 0.75 : 0.3), SQUID_PART.tentacle, angle, 0.5 + i * 0.25, 5);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
  g.setAttribute('aSquid', new Float32BufferAttribute(b.squid, 4));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  return g;
}
