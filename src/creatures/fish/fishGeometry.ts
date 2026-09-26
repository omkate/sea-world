import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { catmullRom } from '../../core/math/noise';
import type { FishMorph } from './FishMorph';

export const FISH_PART = { body: 0, dorsalAnal: 1, caudal: 2, pectoral: 3, pelvic: 4 } as const;

interface Builder {
  pos: number[];
  nrm: number[];
  fish: number[];
  idx: number[];
}

const newBuilder = (): Builder => ({ pos: [], nrm: [], fish: [], idx: [] });

function finish(b: Builder, computeNormals: boolean): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('aFish', new Float32BufferAttribute(b.fish, 4));
  g.setIndex(b.idx);
  if (computeNormals) g.computeVertexNormals();
  return g;
}

/** Superellipse point: returns (x, y) on the unit shape for angle θ. */
function superellipse(theta: number, n: number): [number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / n;
  return [Math.sign(c) * Math.abs(c) ** e, Math.sign(s) * Math.abs(s) ** e];
}

/**
 * Smooth, closed fish body lofted along the spine plus fin membranes. Local frame: snout at
 * z = +0.5, tail tip at z = −0.5, back toward +y, total length 1 (scaled per instance).
 * Attribute aFish = (s along body 0..1, v normalised height, part id, t across fin 0..1).
 */
export function createFishGeometry(m: FishMorph, rings = 44, segments = 22): BufferGeometry {
  const H = m.profile.map((p) => [p[0], p[1]] as const);
  const W = m.profile.map((p) => [p[0], p[2]] as const);
  const C = m.profile.map((p) => [p[0], p[3]] as const);
  const h = (s: number) => Math.max(0, catmullRom(H, s));
  const w = (s: number) => Math.max(0, catmullRom(W, s));
  const cy = (s: number) => catmullRom(C, s);
  const zAt = (s: number) => 0.5 - s;

  const parts: BufferGeometry[] = [];

  // Body: snout tip vertex, rings, closing cap at the peduncle.
  const body = newBuilder();
  body.pos.push(0, cy(0), 0.5);
  body.nrm.push(0, 0, 1);
  body.fish.push(0, 0, FISH_PART.body, 0);
  for (let i = 1; i <= rings; i++) {
    // Denser rings near the snout, where curvature is highest.
    const u = i / rings;
    const s = m.peduncle * (u * u * 0.35 + u * 0.65);
    for (let j = 0; j < segments; j++) {
      const [ux, uy] = superellipse((j / segments) * Math.PI * 2, m.sectionExponent);
      body.pos.push(ux * w(s), cy(s) + uy * h(s), zAt(s));
      body.nrm.push(0, 0, 0);
      body.fish.push(s, uy, FISH_PART.body, 0);
    }
  }
  const tail = body.pos.length / 3;
  body.pos.push(0, cy(m.peduncle), zAt(m.peduncle) - 0.004);
  body.nrm.push(0, 0, -1);
  body.fish.push(m.peduncle, 0, FISH_PART.body, 0);
  for (let j = 0; j < segments; j++) body.idx.push(0, 1 + ((j + 1) % segments), 1 + j);
  for (let i = 0; i < rings - 1; i++) {
    const a = 1 + i * segments;
    const b = a + segments;
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      body.idx.push(a + j, a + j1, b + j, a + j1, b + j1, b + j);
    }
  }
  const last = 1 + (rings - 1) * segments;
  for (let j = 0; j < segments; j++) body.idx.push(last + j, last + ((j + 1) % segments), tail);
  parts.push(finish(body, true));

  // Median fins (dorsal above, anal below) as membranes in the mid-plane.
  const medianFin = (rows: FishMorph['dorsal'], sign: 1 | -1) => {
    const f = newBuilder();
    const s0 = rows[0]![0];
    const s1 = rows[rows.length - 1]![0];
    const n = 18;
    const across = 4;
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      const height = Math.max(0, catmullRom(rows, s));
      const baseY = cy(s) + sign * h(s) * 0.97;
      for (let k = 0; k <= across; k++) {
        const t = k / across;
        f.pos.push(0, baseY + sign * height * t, zAt(s) - height * t * 0.35);
        f.nrm.push(1, 0, 0);
        f.fish.push(s, sign * (1 + t), FISH_PART.dorsalAnal, t);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < across; k++) {
        const a = i * (across + 1) + k;
        const b = a + across + 1;
        f.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return finish(f, false);
  };
  parts.push(medianFin(m.dorsal, 1), medianFin(m.anal, -1));

  // Caudal fin: trailing-edge shape by type.
  {
    const f = newBuilder();
    const sp = m.peduncle;
    const zp = zAt(sp) + 0.01;
    const baseHalf = h(sp) * 0.95;
    const trailing = (a: number): number => {
      const x = Math.abs(a);
      switch (m.caudal.shape) {
        case 'forked':
          return 0.42 + 0.58 * x ** 1.3;
        case 'lunate':
          return 0.3 + 0.7 * x ** 2.2;
        case 'emarginate':
          return 0.8 + 0.2 * x ** 2;
        case 'truncate':
          return 0.97 + 0.03 * x;
        case 'rounded':
          return 1 - 0.28 * x * x;
      }
    };
    const nv = 16;
    const nz = 6;
    for (let i = 0; i <= nv; i++) {
      const a = (i / nv) * 2 - 1;
      const zt = zp - m.caudal.length * trailing(a);
      for (let k = 0; k <= nz; k++) {
        const t = k / nz;
        const y = cy(sp) + a * (baseHalf + (m.caudal.halfSpan - baseHalf) * Math.sqrt(t));
        f.pos.push(0, y, zp + (zt - zp) * t);
        f.nrm.push(1, 0, 0);
        f.fish.push(sp + (1 - sp) * t, a * 1.5, FISH_PART.caudal, t);
      }
    }
    for (let i = 0; i < nv; i++) {
      for (let k = 0; k < nz; k++) {
        const a = i * (nz + 1) + k;
        const b = a + nz + 1;
        f.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    parts.push(finish(f, false));
  }

  // Paired fins: pectorals (side paddles) and pelvics (below), both sides.
  const pairedFin = (s: number, length: number, width: number, down: number, part: number, side: 1 | -1) => {
    const f = newBuilder();
    const origin = new Vector3(side * w(s) * 0.9, cy(s) - h(s) * down, zAt(s));
    const along = new Vector3(side * 0.38, -0.25, -0.89).normalize();
    const acrossDir = new Vector3(0, 1, 0).cross(along).normalize().multiplyScalar(side);
    const normal = new Vector3().crossVectors(along, acrossDir).normalize();
    const nu = 8;
    const nw = 3;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const halfW = width * Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.05)) ** 0.6 * 0.5;
      for (let k = 0; k <= nw; k++) {
        const c = (k / nw) * 2 - 1;
        const p = origin.clone().addScaledVector(along, u * length).addScaledVector(acrossDir, c * halfW);
        f.pos.push(p.x, p.y, p.z);
        f.nrm.push(normal.x, normal.y, normal.z);
        f.fish.push(s + u * length * 0.5, -0.3, part, u);
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let k = 0; k < nw; k++) {
        const a = i * (nw + 1) + k;
        const b = a + nw + 1;
        f.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return finish(f, false);
  };
  for (const side of [1, -1] as const) {
    parts.push(pairedFin(m.pectoral.s, m.pectoral.length, m.pectoral.width, 0.2, FISH_PART.pectoral, side));
    if (m.pelvic) parts.push(pairedFin(m.pelvic.s, m.pelvic.length, m.pelvic.length * 0.35, 0.92, FISH_PART.pelvic, side));
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('fish geometry merge failed');
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}
