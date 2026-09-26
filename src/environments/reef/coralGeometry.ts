import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry, Vector3 } from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3 } from '../../core/math/noise';
import { createRng } from '../../core/math/rng';

/**
 * Procedural coral colonies. Every geometry carries `aShade` = (occlusion 0..1, tip 0..1) so
 * the material can darken crevices and lighten actively growing tips.
 */
class Mesher {
  pos: number[] = [];
  shade: number[] = [];
  idx: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Tapered tube along a polyline, closed with a rounded tip. */
  tube(points: Vector3[], radii: number[], radial: number, tipness: number[], occlusion: number[]): void {
    const base = this.vertexCount;
    const t = new Vector3();
    const nrm = new Vector3();
    const bin = new Vector3();
    const ref = new Vector3(0, 0, 1);
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      t.subVectors(points[Math.min(i + 1, points.length - 1)]!, points[Math.max(i - 1, 0)]!).normalize();
      if (Math.abs(t.dot(ref)) > 0.9) ref.set(1, 0, 0);
      nrm.crossVectors(t, ref).normalize();
      bin.crossVectors(t, nrm).normalize();
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const r = radii[i]!;
        this.pos.push(p.x + (nrm.x * Math.cos(a) + bin.x * Math.sin(a)) * r, p.y + (nrm.y * Math.cos(a) + bin.y * Math.sin(a)) * r, p.z + (nrm.z * Math.cos(a) + bin.z * Math.sin(a)) * r);
        this.shade.push(occlusion[i]!, tipness[i]!);
      }
    }
    for (let i = 0; i < points.length - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * radial + j;
        const b = base + i * radial + ((j + 1) % radial);
        const c = a + radial;
        const d = b + radial;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    const last = points.length - 1;
    const tip = points[last]!.clone().addScaledVector(t, radii[last]! * 0.9);
    const tipIndex = this.vertexCount;
    this.pos.push(tip.x, tip.y, tip.z);
    this.shade.push(occlusion[last]!, 1);
    for (let j = 0; j < radial; j++) this.idx.push(base + last * radial + j, tipIndex, base + last * radial + ((j + 1) % radial));
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aShade', new Float32BufferAttribute(this.shade, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** Staghorn Acropora: tapered branches that fork upward and outward, pale growing tips. */
export function createBranchingCoral(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const m = new Mesher();
  const grow = (start: Vector3, dir: Vector3, length: number, radius: number, depth: number) => {
    const segs = 3;
    const pts: Vector3[] = [];
    const radii: number[] = [];
    const tips: number[] = [];
    const occ: number[] = [];
    const p = start.clone();
    const d = dir.clone();
    for (let i = 0; i <= segs; i++) {
      pts.push(p.clone());
      const f = i / segs;
      radii.push(radius * (1 - f * 0.45));
      tips.push(depth >= 2 ? Math.max(0, f * 1.2 - 0.3) : 0);
      // Inner trunks sit in the colony's shade; outer branches and tips are lit.
      occ.push(Math.min(1, 0.45 + depth * 0.14 + f * 0.08));
      d.x += (rng() - 0.5) * 0.25;
      d.z += (rng() - 0.5) * 0.25;
      d.y += 0.08;
      d.normalize();
      p.addScaledVector(d, length / segs);
    }
    m.tube(pts, radii, 4, tips, occ);
    if (depth < 3) {
      const children = depth <= 1 ? 2 : rng() < 0.55 ? 2 : 1;
      for (let c = 0; c < children; c++) {
        const cd = d.clone();
        cd.x += (rng() - 0.5) * 1.1;
        cd.z += (rng() - 0.5) * 1.1;
        cd.y += 0.15;
        cd.normalize();
        grow(p, cd, length * (0.68 + rng() * 0.14), radius * 0.66, depth + 1);
      }
    }
  };
  const trunks = 7 + Math.floor(rng() * 3);
  for (let i = 0; i < trunks; i++) {
    const a = (i / trunks) * Math.PI * 2 + rng() * 0.6;
    const dir = new Vector3(Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7).normalize();
    grow(new Vector3(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05), dir, 0.3 + rng() * 0.12, 0.032, 0);
  }
  return m.build();
}

/** Magnificent sea anemone: a column, an oral disc and a carpet of blunt tentacles. */
export function createAnemone(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const m = new Mesher();
  const column = [new Vector3(0, 0, 0), new Vector3(0, 0.08, 0), new Vector3(0, 0.14, 0)];
  m.tube(column, [0.2, 0.19, 0.2], 16, [0, 0, 0], [0.4, 0.5, 0.55]);
  const count = 230;
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rng()) * 0.26;
    const a = rng() * Math.PI * 2;
    const base = new Vector3(Math.cos(a) * r, 0.15, Math.sin(a) * r);
    const out = new Vector3(Math.cos(a) * (0.3 + r), 1, Math.sin(a) * (0.3 + r)).normalize();
    const len = 0.07 + rng() * 0.05;
    const pts = [0, 0.33, 0.66, 1].map((f) => base.clone().addScaledVector(out, len * f).add(new Vector3(0, -f * f * len * 0.25, 0)));
    // Blunt, slightly swollen tips; shade.y carries the position along the tentacle for sway.
    m.tube(pts, [0.009, 0.008, 0.0085, 0.009], 5, [0, 0.33, 0.66, 1], [0.55, 0.7, 0.85, 1]);
  }
  return m.build();
}

/** Gorgonian sea fan: a planar net of fine branches, broadside to the current. */
export function createSeaFan(seed: number): BufferGeometry {
  const rng = createRng(seed);
  const m = new Mesher();
  const grow = (start: Vector3, angle: number, length: number, radius: number, depth: number) => {
    const pts: Vector3[] = [];
    const radii: number[] = [];
    const segs = 5;
    let a = angle;
    const p = start.clone();
    for (let i = 0; i <= segs; i++) {
      pts.push(p.clone());
      radii.push(radius * (1 - (i / segs) * 0.4));
      a += (rng() - 0.5) * 0.25;
      p.x += (Math.sin(a) * length) / segs;
      p.y += (Math.cos(a) * length) / segs;
      p.z += (rng() - 0.5) * 0.004;
    }
    m.tube(pts, radii, 4, pts.map(() => 0), pts.map((_, i) => 0.7 + (i / segs) * 0.3));
    if (depth < 5) {
      grow(p, a - 0.35 - rng() * 0.2, length * 0.78, radius * 0.72, depth + 1);
      grow(p, a + 0.35 + rng() * 0.2, length * 0.78, radius * 0.72, depth + 1);
    }
  };
  grow(new Vector3(0, 0, 0), 0, 0.16, 0.012, 0);
  return m.build();
}

/**
 * Reef rock or rubble: a low-poly (~320 triangles) displaced icosphere, flattened and sunk into
 * the substrate. `aShade` darkens the buried base and undersides. Cheap enough to scatter by
 * the hundred to break up open ground.
 */
export function createRock(seed: number, flatness = 0.6): BufferGeometry {
  const ico = new IcosahedronGeometry(1, 2);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico);
  const pos = g.getAttribute('position');
  const shade = new Float32Array(pos.count * 2);
  const v = new Vector3();
  const off = seed * 7.31;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n = fbm3(v.x * 1.3 + off, v.y * 1.3, v.z * 1.3, 3);
    // Blocky, angular facets rather than a blob.
    v.multiplyScalar(0.8 + n * 0.45);
    v.y *= flatness;
    const y = v.y + 0.15;
    pos.setXYZ(i, v.x, y, v.z);
    shade[i * 2] = Math.min(1, Math.max(0.25, 0.4 + y * 0.9));
    shade[i * 2 + 1] = 0;
  }
  g.setAttribute('aShade', new Float32BufferAttribute(shade, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
