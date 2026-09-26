import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { Wanderer } from '../../src/creatures/hero/Wanderer';
import { Spotter } from '../../src/ecosystem/spotter/Spotter';

function setup() {
  const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 500);
  camera.position.set(0, -10, 0);
  camera.lookAt(0, -11, -10);
  camera.updateMatrixWorld();
  const all: Wanderer[] = [];
  const make = (seed: number, home: Vector3) =>
    new Wanderer({ home, radius: 12, yMin: -14, yMax: -6, floor: null, cruise: 1.2, maxTurn: 0.5, seed, neighbours: all, space: 1.5 });
  return { camera, all, make };
}

describe('Spotter', () => {
  it('brings a nearby species into view when none is on screen, and keeps it there often', () => {
    const { camera, make } = setup();
    // Home ranges beside and behind the camera: left alone, they are mostly off screen.
    const sharks = [make(1, new Vector3(18, -10, 8)), make(2, new Vector3(-16, -10, 10))];
    const spotter = new Spotter([{ species: 'shark', members: sharks }]);
    let visibleFrames = 0;
    const frames = 60 * 120;
    for (let i = 0; i < frames; i++) {
      for (const s of sharks) s.update(1 / 60);
      spotter.update(1 / 60, camera);
      if (i > 60 * 20 && sharks.some((s) => spotter.isVisible(s, camera))) visibleFrames++;
    }
    expect(visibleFrames / (frames - 60 * 20)).toBeGreaterThan(0.6);
  });

  it('ignores species whose home is far from the camera', () => {
    const { camera, make } = setup();
    const far = make(3, new Vector3(0, -10, 200));
    const spotter = new Spotter([{ species: 'far', members: [far] }]);
    for (let i = 0; i < 60 * 10; i++) {
      far.update(1 / 60);
      spotter.update(1 / 60, camera);
    }
    expect(far.position.distanceTo(new Vector3(0, -10, 200))).toBeLessThan(20);
  });
});
