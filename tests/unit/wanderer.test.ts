import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { Wanderer } from '../../src/creatures/hero/Wanderer';

const make = () => new Wanderer({ home: new Vector3(0, -10, 0), radius: 10, yMin: -14, yMax: -6, floor: null, cruise: 1, maxTurn: 0.6, seed: 3 });

describe('Wanderer', () => {
  it('turns around to reach a goal directly behind it (no stall on a U-turn)', () => {
    const w = make();
    w.place(new Vector3(0, -10, 0), new Vector3(1, 0, 0));
    const goal = new Vector3(-8, -10, 0);
    for (let i = 0; i < 60 * 25; i++) w.update(1 / 60, goal);
    expect(w.position.distanceTo(goal)).toBeLessThan(2);
  });

  it('never turns faster than its limit', () => {
    const w = make();
    let prev = w.direction.clone();
    for (let i = 0; i < 600; i++) {
      w.update(1 / 60);
      expect(prev.angleTo(w.direction)).toBeLessThanOrEqual(0.6 / 60 + 1e-6);
      prev = w.direction.clone();
    }
  });

  it('stays in its home range and height band while wandering', () => {
    const w = make();
    for (let i = 0; i < 60 * 120; i++) {
      w.update(1 / 60);
      expect(Math.hypot(w.position.x, w.position.z)).toBeLessThan(16);
      expect(w.position.y).toBeGreaterThan(-17);
      expect(w.position.y).toBeLessThan(-3);
    }
  });
});

describe('Wanderer spacing and smoothness', () => {
  it('keeps animals apart even when their home ranges overlap', () => {
    const all: Wanderer[] = [];
    const ws = [0, 1, 2, 3].map((i) => new Wanderer({ home: new Vector3(0, -10, 0), radius: 6, yMin: -12, yMax: -8, floor: null, cruise: 0.8, maxTurn: 0.45, seed: 20 + i, neighbours: all, space: 1.5 }));
    let closest = Infinity;
    for (let step = 0; step < 60 * 90; step++) {
      for (const w of ws) w.update(1 / 60);
      if (step < 60 * 5) continue;
      for (let a = 0; a < ws.length; a++) for (let b = a + 1; b < ws.length; b++) closest = Math.min(closest, ws[a]!.position.distanceTo(ws[b]!.position));
    }
    expect(closest).toBeGreaterThan(1.5);
  });

  it('eases into turns (no sudden jumps in turn rate)', () => {
    const w = make();
    let prev = 0;
    let worst = 0;
    for (let i = 0; i < 60 * 60; i++) {
      w.update(1 / 60);
      worst = Math.max(worst, Math.abs(w.turnRate - prev));
      prev = w.turnRate;
    }
    // Change of turn rate per frame stays small: a full-rate turn builds up over many frames.
    expect(worst).toBeLessThan(0.6 / 4);
  });
});

describe('Wanderer and the camera', () => {
  it('never swims through the lens when asked to avoid it', () => {
    const w = make();
    const lens = new Vector3(0, -10, 0);
    let closest = Infinity;
    for (let i = 0; i < 60 * 120; i++) {
      w.update(1 / 60, null, 1, false, lens);
      if (i > 60 * 3) closest = Math.min(closest, w.position.distanceTo(lens));
    }
    expect(closest).toBeGreaterThan(2);
  });
});
