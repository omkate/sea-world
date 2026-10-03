import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';

export const ATOLLA_PART = { bell: 0, tentacle: 1, longTentacle: 2 } as const;

const LAPPETS = 20;
const TENTACLES = 20;

/**
 * Atolla wyvillei: a shallow red bell with a raised central dome, a deep coronal groove, a
 * scalloped margin of lappets, a ring of short tentacles that curl up, and one hypertrophied
 * tentacle trailing far behind. Bell diameter 1, dome up (+y), margin at y ≈ 0.
 * Attribute aAtolla = (part, t: centre→margin on the bell / root→tip on tentacles, angle, seed).
 */
export function createAtollaGeometry(radial = 60, rings = 16): BufferGeometry {
  const pos: number[] = [];
  const at: number[] = [];
  const idx: number[] = [];

  const height = (t: number, a: number): number => {
    const dome = 0.2 * Math.max(0, 1 - (t / 0.55) ** 2);
    // The coronal groove, a ring-shaped furrow between the dome and the lappets.
    const groove = -0.05 * Math.exp(-(((t - 0.6) / 0.06) ** 2));
    // Lappets: scallops around the margin.
    const scallop = t > 0.7 ? -0.03 * ((t - 0.7) / 0.3) * (1 - Math.abs(Math.cos((a * LAPPETS) / 2))) : 0;
    return 0.05 + dome + groove + scallop - 0.06 * t * t;
  };

  pos.push(0, height(0, 0), 0);
  at.push(ATOLLA_PART.bell, 0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      // The lappets scallop the outline as well as the profile.
      const r = 0.5 * t * (t > 0.75 ? 1 - 0.06 * (1 - Math.abs(Math.cos((a * LAPPETS) / 2))) : 1);
      pos.push(Math.cos(a) * r, height(t, a), Math.sin(a) * r);
      at.push(ATOLLA_PART.bell, t, a, 0);
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

  // Tentacles as thin crossed ribbons from the margin.
  const ribbon = (part: number, angle: number, length: number, width: number, segments: number, curl: number, seed: number) => {
    for (const cross of [0, Math.PI / 2]) {
      const base = pos.length / 3;
      const dx = Math.cos(angle + cross), dz = Math.sin(angle + cross);
      for (let k = 0; k <= segments; k++) {
        const t = k / segments;
        // Short tentacles curl up and out; the long one hangs and trails.
        const r = 0.46 + curl * Math.sin(t * Math.PI * 0.8) * 0.25;
        const y = -length * t + curl * Math.sin(t * Math.PI) * length * 0.6;
        const cx = Math.cos(angle) * r, cz = Math.sin(angle) * r;
        const w = (width * (1 - t * 0.7)) / 2;
        pos.push(cx - dx * w, y, cz - dz * w, cx + dx * w, y, cz + dz * w);
        at.push(part, t, angle, seed, part, t, angle, seed);
      }
      for (let k = 0; k < segments; k++) {
        const a = base + k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  };
  for (let i = 0; i < TENTACLES; i++) ribbon(ATOLLA_PART.tentacle, ((i + 0.5) / TENTACLES) * Math.PI * 2, 0.35, 0.02, 8, 1, i / TENTACLES);
  ribbon(ATOLLA_PART.longTentacle, 0.3, 2.6, 0.025, 24, 0.1, 0.5);

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aAtolla', new Float32BufferAttribute(at, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
