import { Mesh, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { createAnglerGeometry, LURE_REST } from './anglerGeometry';
import { createAnglerMaterial, createAnglerUniforms } from './anglerMaterial';

export interface AnglerEncounterOptions {
  /** Where it hangs relative to the lens: metres ahead along the view, and to the side. */
  ahead: number;
  side: number;
  /** Body length (m). */
  size: number;
  /** Camera depths over which the scene plays; the fish's depth eases toward the lens. */
  encounter: readonly [number, number];
}

/**
 * The anglerfish scene: in the dark, a lure bobs close to the lens and its glow picks out a
 * black globular body, a gaping mouth and needle teeth. The lure loops and twitches, dims and
 * brightens; every so often (or when the camera comes too close) the jaw gapes and snaps.
 */
export class AnglerEncounter {
  readonly mesh: Mesh;
  private readonly a = createAnglerUniforms();
  readonly position: Vector3;
  private snap = 0;
  private nextSnap = 5;
  private readonly lureLocal = new Vector3();
  private readonly target = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private placed = false;

  constructor(u: FrameUniforms, kd: readonly [number, number, number], private readonly o: AnglerEncounterOptions) {
    this.mesh = new Mesh(createAnglerGeometry(), createAnglerMaterial(u, kd, this.a));
    this.mesh.name = 'melanocetus-johnsonii';
    this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(o.size);
    this.position = new Vector3(0, -(o.encounter[0] + o.encounter[1]) / 2, 0);
  }

  update(dt: number, time: number, camera: PerspectiveCamera): void {
    const { o } = this;
    const depth = -camera.position.y;
    this.mesh.visible = depth > o.encounter[0] && depth < o.encounter[1];
    if (!this.mesh.visible) return;
    // Hangs just ahead of the lens (at under a metre the camera's own drift matters, so it is
    // placed relative to the camera, not the dive path); it eases there, as if the camera drifts up to it.
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.set(-this.forward.z, 0, this.forward.x);
    this.target.copy(camera.position).addScaledVector(this.forward, o.ahead).addScaledVector(this.right, o.side);
    this.target.y = camera.position.y - 0.12;
    if (!this.placed) {
      this.position.copy(this.target).addScaledVector(this.forward, 1.5);
      this.placed = true;
    }
    this.position.lerp(this.target, Math.min(1, dt * 0.5));
    this.mesh.position.copy(this.position);
    // Three-quarters toward the camera, turning slowly to and fro.
    const toCam = Math.atan2(camera.position.x - this.position.x, camera.position.z - this.position.z);
    this.mesh.rotation.set(0.12 * Math.sin(time * 0.3), toCam + 0.7 + Math.sin(time * 0.17) * 0.35, 0.06 * Math.sin(time * 0.41));

    // The lure: slow figure-of-eight loops with twitches; it dims and brightens.
    const twitch = Math.sin(time * 7.3) * Math.max(0, Math.sin(time * 0.9)) * 0.02;
    this.a.lureOffset.value.set(Math.sin(time * 0.8) * 0.06 + twitch, Math.sin(time * 1.6) * 0.04, Math.cos(time * 0.8) * 0.02);
    this.a.lure.value = 0.75 + 0.25 * Math.sin(time * 1.3) * Math.sin(time * 0.37 + 1);
    this.lureLocal.set(LURE_REST[0], LURE_REST[1], LURE_REST[2]).add(this.a.lureOffset.value);
    this.mesh.updateMatrixWorld();
    this.a.lureWorld.value.copy(this.lureLocal).applyMatrix4(this.mesh.matrixWorld);

    // The jaw: a gape and snap every 7–12 s, or when the camera comes within 0.6 m.
    this.nextSnap -= dt;
    if ((this.nextSnap <= 0 || this.position.distanceTo(camera.position) < 0.6) && this.snap <= 0) {
      this.snap = 1.2;
      this.nextSnap = 7 + (time % 5);
    }
    this.snap = Math.max(0, this.snap - dt);
    // Gape over ~0.9 s, snap shut in ~0.15 s.
    const s = this.snap;
    this.a.mouth.value = s > 0.3 ? Math.sin(((1.2 - s) / 0.9) * Math.PI * 0.5) : s / 0.3;
  }

  sighting(): SightingSource {
    return {
      species: 'melanocetus-johnsonii',
      nearest: (from, out, accept) => (this.mesh.visible && accept(this.position) ? (out.copy(this.position), this.position.distanceTo(from)) : Infinity),
    };
  }
}
