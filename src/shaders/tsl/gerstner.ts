import { cos, dot, float, normalize, sin, smoothstep, vec2, vec3 } from 'three/tsl';
import type { ShaderNode } from './types';
import type { Wave } from '../../ocean/surface/waves';

type N = ShaderNode;

export interface GerstnerResult {
  offset: N;
  normal: N;
  /** Crest compression; < ~0.6 means breaking foam. */
  jacobian: N;
}

/** Per-wave fade that removes components too small to resolve at a given distance. */
function fade(w: Wave, dist: N): N {
  return float(1).sub(smoothstep(w.wavelength * 14, w.wavelength * 45, dist));
}

/** Gerstner displacement, normal and Jacobian at undisplaced world XZ. */
export function gerstner(waves: readonly Wave[], xz: N, t: N, dist: N): GerstnerResult {
  let ox: N = float(0);
  let oy: N = float(0);
  let oz: N = float(0);
  let nx: N = float(0);
  let nz: N = float(0);
  let ny: N = float(1);
  for (const w of waves) {
    const a = fade(w, dist).mul(w.amplitude);
    const theta = dot(vec2(w.dirX, w.dirZ), xz).mul(w.k).sub(t.mul(w.omega)).add(w.phase);
    const s = sin(theta);
    const c = cos(theta);
    const qa = a.mul(w.q);
    ox = ox.add(c.mul(qa).mul(w.dirX));
    oz = oz.add(c.mul(qa).mul(w.dirZ));
    oy = oy.add(s.mul(a));
    const wa = a.mul(w.k);
    nx = nx.sub(c.mul(wa).mul(w.dirX));
    nz = nz.sub(c.mul(wa).mul(w.dirZ));
    ny = ny.sub(s.mul(wa).mul(w.q));
  }
  return { offset: vec3(ox, oy, oz), normal: normalize(vec3(nx, ny, nz)), jacobian: ny };
}

/** Elevation only (matches waveHeight() on the CPU). */
export function gerstnerHeight(waves: readonly Wave[], xz: N, t: N): N {
  let h: N = float(0);
  for (const w of waves) {
    const theta = dot(vec2(w.dirX, w.dirZ), xz).mul(w.k).sub(t.mul(w.omega)).add(w.phase);
    h = h.add(sin(theta).mul(w.amplitude));
  }
  return h;
}
