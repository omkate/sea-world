import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { ScanAsset } from '../../assets/AssetLibrary';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { HeroSwimmer } from './HeroSwimmer';
import { divePathX, divePathZ } from '../../environments/reef/ReefSite';

export interface WhaleEncounterOptions {
  /** Camera depths over which the pass happens. */
  encounter: readonly [number, number];
  /** How far ahead of the lens (m) the whale cruises: far enough to fit a 12 m animal in frame. */
  ahead: number;
  seed: number;
}

/**
 * A sperm whale passing through the open blue: a 12 m animal cruising on slow fluke beats,
 * crossing the view at a distance that fits it in frame. During its pass its home range and
 * depth band follow the camera's depth, so the encounter lasts rather than flashing by.
 */
export class WhaleEncounter {
  readonly whale: HeroSwimmer;
  private readonly home = new Vector3();
  private readonly forward = new Vector3();

  constructor(u: FrameUniforms, kd: readonly [number, number, number], asset: ScanAsset, private readonly o: WhaleEncounterOptions) {
    const mid = -(o.encounter[0] + o.encounter[1]) / 2;
    this.home.set(divePathX(-mid), mid, divePathZ(-mid) - o.ahead);
    this.whale = new HeroSwimmer(u, kd, asset, {
      forward: '+z',
      style: 'vertical',
      // Sperm whales cruise at ~1–1.5 m/s with slow, deep fluke strokes.
      beatHz: 0.22,
      amplitude: 0.05,
      wander: { home: this.home, radius: 14, yMin: mid - 3, yMax: mid + 2, floor: null, cruise: 1.3, maxTurn: 0.08, maxPitch: 0.12, seed: o.seed, space: 6 },
    });
  }

  update(dt: number, camera: PerspectiveCamera): void {
    const depth = -camera.position.y;
    const on = depth > this.o.encounter[0] && depth < this.o.encounter[1];
    this.whale.mesh.visible = on;
    if (!on) return;
    // Its range follows the camera down: centred ahead on the dive path, slightly below the lens.
    this.home.set(divePathX(depth), camera.position.y, divePathZ(depth) - this.o.ahead);
    this.whale.motion.o.yMin = camera.position.y - 4;
    this.whale.motion.o.yMax = camera.position.y + 1.5;
    camera.getWorldDirection(this.forward);
    this.whale.update(dt, camera.position, this.forward);
  }

  sighting(): SightingSource {
    const p = this.whale.motion.position;
    return {
      species: 'physeter-macrocephalus',
      nearest: (from, out, accept) => (this.whale.mesh.visible && accept(p) ? (out.copy(p), p.distanceTo(from)) : Infinity),
    };
  }
}
