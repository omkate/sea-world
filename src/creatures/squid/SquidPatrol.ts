import { InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { createRng } from '../../core/math/rng';
import { createSchoolMatrices } from '../../ecosystem/schooling/School';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { createSquidGeometry } from './squidGeometry';
import { createSquidMaterial } from './squidMaterial';
import { JEWEL_LOOK } from './squidSpecies';

export interface SquidPatrolOptions {
  count: number;
  /** Total length (m) and ± variation fraction. */
  size: number;
  sizeVariation: number;
  /** Camera-relative box the squid live in (m), its centre ahead of the lens, and below it. */
  box: Vector3;
  ahead: number;
  below: number;
  /** Camera distance (m) that makes a squid jet away. */
  fleeRadius: number;
  seed: number;
}

const UP = new Vector3(0, 1, 0);
/** Tilt of the body axis from vertical (rad): cock-eyed squid hang obliquely, mantle up. */
const TILT = 0.8;

/**
 * Cock-eyed squid hanging in the twilight around the camera, like the small fish: a box that
 * travels with the lens, wrapping at its faces, with how many are present set by a density
 * curve. Each glides slowly mantle-first with rippling fins, bobs, gives a small jet every few
 * seconds, and turns; if the camera comes too close it jets hard away. One instanced mesh.
 */
export class SquidPatrol {
  readonly mesh: InstancedMesh;
  private readonly state: InstancedBufferAttribute;
  private readonly matrices: ReturnType<typeof createSchoolMatrices>;
  private readonly pos: Vector3[];
  private readonly vel: Vector3[];
  private readonly heading: number[];
  private readonly turn: number[];
  private readonly size: number[];
  private readonly presence: number[];
  private readonly jet: number[];
  private readonly phase: number[];
  private readonly nextJet: number[];
  private placed = false;
  private readonly rel = new Vector3();
  private readonly centre = new Vector3();
  private readonly forward = new Vector3();
  private readonly m = new Matrix4();
  private readonly axis = new Vector3();
  private readonly h = new Vector3();
  private readonly x = new Vector3();
  private readonly z = new Vector3();
  private readonly s = new Vector3();
  private density = 0;

  constructor(u: FrameUniforms, kd: readonly [number, number, number], private readonly o: SquidPatrolOptions) {
    const rng = createRng(o.seed);
    const n = o.count;
    this.state = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.matrices = createSchoolMatrices(n);
    this.mesh = new InstancedMesh(createSquidGeometry(JEWEL_LOOK.shape), createSquidMaterial(u, kd, JEWEL_LOOK, this.state, this.matrices.interleaved), n);
    this.mesh.instanceMatrix = this.matrices.attribute;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'histioteuthis';
    this.pos = Array.from({ length: n }, () => new Vector3((rng() - 0.5) * o.box.x, (rng() - 0.5) * o.box.y, (rng() - 0.5) * o.box.z));
    this.vel = Array.from({ length: n }, () => new Vector3());
    this.heading = Array.from({ length: n }, () => rng() * Math.PI * 2);
    this.turn = Array.from({ length: n }, () => (rng() - 0.5) * 0.15);
    this.size = Array.from({ length: n }, () => o.size * (1 + (rng() * 2 - 1) * o.sizeVariation));
    // Presence order: at density d, squid with presence < d are around.
    this.presence = Array.from({ length: n }, (_, i) => (i + rng() * 0.5) / n);
    this.jet = Array.from({ length: n }, () => 0);
    this.phase = Array.from({ length: n }, () => rng() * Math.PI * 2);
    this.nextJet = Array.from({ length: n }, () => 2 + rng() * 6);
  }

  /** Fraction of the patrol present (0..1), e.g. from a density curve over depth. */
  setDensity(density: number): void {
    this.density = density;
  }

  /** Squid currently present (for the debug panel). */
  get simulated(): number {
    return this.mesh.count;
  }

  get total(): number {
    return this.o.count;
  }

  update(dt: number, time: number, camera: PerspectiveCamera): void {
    const { o } = this;
    camera.getWorldDirection(this.forward);
    this.centre.copy(camera.position).addScaledVector(this.forward, o.ahead);
    this.centre.y -= o.below;
    // Squid live in world space; the box only decides where they wrap to (like the fish).
    if (!this.placed) {
      for (const p of this.pos) p.add(this.centre);
      this.placed = true;
    }
    let slot = 0;
    for (let i = 0; i < o.count; i++) {
      if (this.presence[i]! >= this.density) continue;
      const p = this.pos[i]!;
      const v = this.vel[i]!;
      const away = this.rel.subVectors(p, camera.position);
      if (away.length() < o.fleeRadius && this.jet[i]! < 0.05) {
        // Jet away, mantle first (squid jet backward), roughly away from the lens.
        this.jet[i] = 1;
        v.copy(away.normalize()).multiplyScalar(1.6);
      }
      this.jet[i] = Math.max(0, this.jet[i]! - dt * 0.9);
      // Body axis (mantle tip direction) for the glide and the small rhythmic jets.
      this.h.set(Math.cos(this.heading[i]!), 0, Math.sin(this.heading[i]!));
      this.axis.copy(UP).multiplyScalar(Math.cos(TILT)).addScaledVector(this.h, Math.sin(TILT)).normalize();
      this.nextJet[i]! -= dt;
      if (this.nextJet[i]! <= 0) {
        this.jet[i] = Math.max(this.jet[i]!, 0.6);
        v.addScaledVector(this.axis, 0.45 * this.size[i]! * 5);
        this.nextJet[i] = 5 + ((i * 7.3 + time) % 4);
      }
      // Glide mantle-first on the fins, and bob gently.
      v.addScaledVector(this.axis, 0.08 * dt);
      v.y += Math.sin(time * 0.6 + this.phase[i]!) * 0.03 * dt;
      v.multiplyScalar(Math.exp(-dt * 1.2));
      this.heading[i]! += (this.turn[i]! + Math.sin(time * 0.2 + this.phase[i]!) * 0.15) * dt;
      p.addScaledVector(v, dt);
      // Wrap into the box around the current centre; shrink away near its faces.
      const r = this.rel.subVectors(p, this.centre);
      let fade = 1;
      for (const [axis, size] of [['x', o.box.x], ['y', o.box.y], ['z', o.box.z]] as const) {
        r[axis] -= Math.round(r[axis] / size) * size;
        fade = Math.min(fade, (size / 2 - Math.abs(r[axis])) / (size * 0.125));
      }
      p.addVectors(this.centre, r);
      fade = Math.max(0, Math.min(1, fade));

      // Orientation: body axis tilted from vertical toward the heading, mantle up.
      this.h.set(Math.cos(this.heading[i]!), 0, Math.sin(this.heading[i]!));
      this.axis.copy(UP).multiplyScalar(Math.cos(TILT)).addScaledVector(this.h, Math.sin(TILT)).normalize();
      this.x.crossVectors(this.axis, this.h).normalize();
      this.z.crossVectors(this.x, this.axis);
      this.m.makeBasis(this.x, this.axis, this.z);
      this.m.scale(this.s.setScalar(this.size[i]! * fade));
      this.m.setPosition(p);
      this.mesh.setMatrixAt(slot, this.m);
      this.state.setXYZW(slot, this.phase[i]!, this.jet[i]!, 0, 0);
      slot++;
    }
    this.mesh.count = slot;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.matrices.interleaved.needsUpdate = true;
    this.state.needsUpdate = true;
  }

  /** The nearest present squid that passes `accept` (on screen), for the discovery scanner. */
  sighting(): SightingSource {
    return {
      species: 'histioteuthis',
      nearest: (from, out, accept) => {
        let best = Infinity;
        for (let i = 0; i < this.o.count; i++) {
          if (this.presence[i]! >= this.density) continue;
          const w = this.pos[i]!;
          const d = w.distanceTo(from);
          if (d < best && accept(w)) {
            best = d;
            out.copy(w);
          }
        }
        return best;
      },
    };
  }
}
