import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { createRng } from '../../core/math/rng';

export const JELLY_PART = { bell: 0, arm: 1, filament: 2 } as const;

/** Bell height as a fraction of its diameter, and the raised central crown on top of it. */
const BELL_HEIGHT = 0.42;
const CROWN_HEIGHT = 0.12;
const CROWN_RADIUS = 0.36;
const ARMS = 8;
const FILAMENTS = 12;

/**
 * A rhizostome medusa (crown jellyfish): a shallow bell with a raised, knobbed central crown,
 * eight frilled oral arms and long trailing filaments. Bell diameter 1, apex up (+y), bell
 * margin at y = 0. Attribute aJelly = (part id, t, angle around the axis, per-strand seed):
 * t runs from the apex to the margin on the bell, and from the root to the tip on arms and
 * filaments, so the shader can pulse the margin and sway the strands.
 */
export function createJellyGeometry(seed = 1, radial = 40, rings = 14): BufferGeometry {
  const pos: number[] = [];
  const jelly: number[] = [];
  const idx: number[] = [];
  const rng = createRng(seed);

  // Bell: a lathe from the apex to the margin, crown raised in the middle.
  const bellHeight = (t: number) => {
    const dome = BELL_HEIGHT * (1 - t * t);
    const k = Math.max(0, 1 - t / CROWN_RADIUS);
    return dome + CROWN_HEIGHT * k * k * (3 - 2 * k);
  };
  pos.push(0, bellHeight(0), 0);
  jelly.push(JELLY_PART.bell, 0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    // The margin curls slightly inward, like a relaxed bell.
    const r = 0.5 * Math.sin((t * Math.PI) / 2) * (1 - 0.06 * t ** 6);
    const y = bellHeight(t);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      jelly.push(JELLY_PART.bell, t, a, 0);
    }
  }
  for (let j = 0; j < radial; j++) idx.push(0, 1 + ((j + 1) % radial), 1 + j);
  for (let i = 0; i < rings - 1; i++) {
    const a0 = 1 + i * radial;
    const b0 = a0 + radial;
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }

  // Strands hang from under the bell as crossed ribbons, so they read from every side.
  const strand = (part: number, angle: number, rootR: number, length: number, width: number, tipWidth: number, segments: number) => {
    const s = rng();
    for (const cross of [0, Math.PI / 2]) {
      const base = pos.length / 3;
      const dx = Math.cos(angle + cross);
      const dz = Math.sin(angle + cross);
      for (let k = 0; k <= segments; k++) {
        const t = k / segments;
        const w = (width + (tipWidth - width) * t) / 2;
        const cx = Math.cos(angle) * rootR * (1 - 0.6 * t);
        const cz = Math.sin(angle) * rootR * (1 - 0.6 * t);
        const y = -0.04 - length * t;
        pos.push(cx - dx * w, y, cz - dz * w, cx + dx * w, y, cz + dz * w);
        jelly.push(part, t, angle, s, part, t, angle, s);
      }
      for (let k = 0; k < segments; k++) {
        const a = base + k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  };
  for (let i = 0; i < ARMS; i++) strand(JELLY_PART.arm, (i / ARMS) * Math.PI * 2 + 0.2, 0.08, 0.5, 0.14, 0.05, 10);
  for (let i = 0; i < FILAMENTS; i++) strand(JELLY_PART.filament, (i / FILAMENTS) * Math.PI * 2 + rng() * 0.3, 0.1, 0.9 + rng() * 0.5, 0.03, 0.012, 12);

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aJelly', new Float32BufferAttribute(jelly, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
