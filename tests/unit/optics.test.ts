import { describe, expect, it } from 'vitest';
import { extinction, inscatter } from '../../src/ocean/medium/optics';
import { MARIANA } from '../../src/data/sites/mariana';

const KD = MARIANA.kd;

describe('underwater optics', () => {
  it('attenuates red fastest along a view ray', () => {
    const [r, g, b] = extinction(0);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('makes water look blue near the surface', () => {
    const [r, g, b] = inscatter(5, 0, Infinity, 0, KD);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it('is brighter looking up than looking down', () => {
    const up = inscatter(30, 1, 30, 0, KD);
    const down = inscatter(30, -1, Infinity, 0, KD);
    expect(up[2]).toBeGreaterThan(down[2]);
  });

  it('darkens with depth by orders of magnitude', () => {
    const shallow = inscatter(10, 0, Infinity, 0, KD)[2];
    const deep = inscatter(600, 0, Infinity, 0, KD)[2];
    expect(deep / shallow).toBeLessThan(1e-4);
  });

  it('grows with path length and saturates', () => {
    const near = inscatter(20, 0, 1, 0, KD)[2];
    const far = inscatter(20, 0, 100, 0, KD)[2];
    const inf = inscatter(20, 0, Infinity, 0, KD)[2];
    expect(near).toBeLessThan(far);
    expect(far).toBeLessThanOrEqual(inf);
  });
});
