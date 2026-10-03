import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';

export const ANGLER_PART = { body: 0, jaw: 1, tooth: 2, rod: 3, lure: 4, fin: 5 } as const;

/** Where the lower jaw hinges (local), and where the lure sits at rest (local). */
export const JAW_HINGE = [0, -0.02, 0.06] as const;
export const LURE_REST = [0, 0.4, 0.6] as const;

interface Builder {
  pos: number[];
  ang: number[];
  idx: number[];
}

const push = (b: Builder, p: readonly number[], part: number, t: number, side: number) => {
  b.pos.push(p[0]!, p[1]!, p[2]!);
  b.ang.push(part, t, side, 0);
};

/** A lathe around the z axis: rings from z0 to z1 with radius r(t) (t 0 at z0), squashed in y. */
function lathe(b: Builder, part: number, z0: number, z1: number, r: (t: number) => number, yScale: number, yOffset: (t: number) => number, rings: number, segments: number, clip?: (a: number) => boolean): void {
  const start = b.pos.length / 3;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const z = z0 + (z1 - z0) * t;
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      push(b, [Math.cos(a) * r(t), Math.sin(a) * r(t) * yScale + yOffset(t), z], part, t, a);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      if (clip && !clip(a)) continue;
      const p = start + i * (segments + 1) + j;
      const q = p + segments + 1;
      b.idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
}

/** A cone (tooth, fin ray) from base centre `p` along direction `d`, length l, base radius r. */
function cone(b: Builder, part: number, p: readonly number[], d: readonly number[], l: number, r: number): void {
  const base = b.pos.length / 3;
  const [dx, dy, dz] = d as [number, number, number];
  // Any vector not parallel to d, then two perpendiculars.
  const ax = Math.abs(dy) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = [dy * ax[2]! - dz * ax[1]!, dz * ax[0]! - dx * ax[2]!, dx * ax[1]! - dy * ax[0]!];
  const ul = Math.hypot(u[0]!, u[1]!, u[2]!);
  const uu = u.map((x) => x / ul);
  const w = [dy * uu[2]! - dz * uu[1]!, dz * uu[0]! - dx * uu[2]!, dx * uu[1]! - dy * uu[0]!];
  const sides = 5;
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2;
    push(b, [p[0]! + (uu[0]! * Math.cos(a) + w[0]! * Math.sin(a)) * r, p[1]! + (uu[1]! * Math.cos(a) + w[1]! * Math.sin(a)) * r, p[2]! + (uu[2]! * Math.cos(a) + w[2]! * Math.sin(a)) * r], part, 0, 0);
  }
  push(b, [p[0]! + dx * l, p[1]! + dy * l, p[2]! + dz * l], part, 1, 0);
  for (let k = 0; k < sides; k++) b.idx.push(base + k, base + ((k + 1) % sides), base + sides);
}

/**
 * Humpback anglerfish (Melanocetus): a globular black body with a huge head and mouth, a lower
 * jaw that gapes, long needle teeth, small fins, and the illicium (fishing rod) arching forward
 * from the head to the luminous esca. Length 1, snout toward +z, back toward +y.
 * Attribute aAngler = (part, t along the part, side/angle, seed).
 */
export function createAnglerGeometry(): BufferGeometry {
  const b: Builder = { pos: [], ang: [], idx: [] };

  // Body: globular, deepest just behind the head, tapering into a short tail.
  const bodyR = (t: number) => {
    // t 0 = snout (z 0.48) … 1 = tail base (z −0.38).
    const head = Math.sin(Math.min(1, (t + 0.06) / 0.38) * Math.PI * 0.5);
    return Math.max(0.01, 0.31 * head * (1 - Math.max(0, t - 0.45) * 1.55));
  };
  // The mouth: the lower front quarter of the body is open (the jaw is a separate part).
  lathe(b, ANGLER_PART.body, 0.48, -0.38, bodyR, 1.1, () => 0, 22, 26, (a) => !(a > Math.PI * 1.15 && a < Math.PI * 1.85));
  // Lower jaw: a shallow scoop under the mouth, hinged at the back.
  lathe(
    b,
    ANGLER_PART.jaw,
    0.5,
    JAW_HINGE[2],
    (t) => 0.27 * Math.sin(Math.min(1, (t + 0.15) / 0.6) * Math.PI * 0.5),
    0.55,
    () => -0.04,
    8,
    26,
    (a) => a > Math.PI * 1.05 && a < Math.PI * 1.95,
  );
  // Teeth: long, needle-like, along both jaw edges.
  for (let k = 0; k < 9; k++) {
    const f = k / 8;
    const a = Math.PI * (1.2 + 0.6 * f);
    const z = 0.36 - Math.abs(f - 0.5) * 0.25;
    cone(b, ANGLER_PART.tooth, [Math.cos(a) * 0.24, Math.sin(a) * 0.12 - 0.01, z], [0, -1, 0.25], 0.09 - Math.abs(f - 0.5) * 0.06, 0.008);
    cone(b, ANGLER_PART.tooth, [Math.cos(a) * 0.22, -0.13, z + 0.02], [0, 1, 0.2], 0.07 - Math.abs(f - 0.5) * 0.04, 0.007);
  }
  // Illicium: a thin rod arching up and forward from the forehead to the lure.
  const rodBase = [0, 0.3, 0.22];
  const steps = 10;
  let prev = -1;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const p = [0, rodBase[1]! + (LURE_REST[1] - rodBase[1]!) * t + Math.sin(t * Math.PI) * 0.12, rodBase[2]! + (LURE_REST[2] - rodBase[2]!) * t];
    const base = b.pos.length / 3;
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2;
      push(b, [p[0]! + Math.cos(a) * 0.008, p[1]! + Math.sin(a) * 0.008, p[2]!], ANGLER_PART.rod, t, 0);
    }
    if (prev >= 0) for (let j = 0; j < 4; j++) b.idx.push(prev + j, base + j, prev + ((j + 1) % 4), prev + ((j + 1) % 4), base + j, base + ((j + 1) % 4));
    prev = base;
  }
  // Esca: the glowing bulb.
  const lat = 6;
  const start = b.pos.length / 3;
  for (let i = 0; i <= lat; i++) {
    const phi = (i / lat) * Math.PI;
    for (let j = 0; j <= 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      push(b, [LURE_REST[0] + Math.sin(phi) * Math.cos(a) * 0.035, LURE_REST[1] + Math.cos(phi) * 0.035, LURE_REST[2] + Math.sin(phi) * Math.sin(a) * 0.035], ANGLER_PART.lure, 1, 0);
    }
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < 8; j++) {
    const p = start + i * 9 + j;
    b.idx.push(p, p + 9, p + 1, p + 1, p + 9, p + 10);
  }
  // Fins: small pectorals, and a fan of a tail.
  for (const side of [-1, 1]) {
    const c = b.pos.length / 3;
    push(b, [side * 0.22, -0.02, -0.08], ANGLER_PART.fin, 0, side);
    for (let k = 0; k <= 6; k++) {
      const a = -0.9 + (k / 6) * 1.8;
      push(b, [side * (0.22 + Math.cos(a) * 0.12), -0.02 + Math.sin(a) * 0.08, -0.08 - Math.cos(a) * 0.06], ANGLER_PART.fin, 1, side);
      if (k > 0) b.idx.push(c, c + k, c + k + 1);
    }
  }
  const tail = b.pos.length / 3;
  push(b, [0, 0, -0.36], ANGLER_PART.fin, 0, 0);
  for (let k = 0; k <= 8; k++) {
    const a = -0.7 + (k / 8) * 1.4;
    push(b, [0, Math.sin(a) * 0.14, -0.36 - Math.cos(a) * 0.16], ANGLER_PART.fin, 1, 0);
    if (k > 0) b.idx.push(tail, tail + k, tail + k + 1);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
  g.setAttribute('aAngler', new Float32BufferAttribute(b.ang, 4));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  return g;
}
