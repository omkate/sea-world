import { InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { createRng } from '../../core/math/rng';
import { createSchoolMatrices } from '../../ecosystem/schooling/School';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { createSquidGeometry } from './squidGeometry';
import { createSquidMaterial } from './squidMaterial';
import { VAMPIRE_LOOK } from './squidSpecies';

export interface VampireEncounterOptions {
  home: Vector3;
  count: number;
  /** Total length (m). */
  size: number;
  /** Camera depths over which the scene plays; the animals' depth eases toward the lens. */
  encounter: readonly [number, number];
  seed: number;
}

/**
 * The vampire squid scene: slow, drifting animals near the lens. Approached (or now and then
 * anyway) one flips into its defensive "pineapple" posture, cloak inside out over its body with
 * the arm-tip lights blazing, holds it, then slowly unfolds.
 */
export class VampireEncounter {
  readonly mesh: InstancedMesh;
  private readonly state: InstancedBufferAttribute;
  private readonly matrices: ReturnType<typeof createSchoolMatrices>;
  private readonly offsets: Vector3[];
  private readonly pos: Vector3[];
  private readonly spin: number[];
  private readonly pose: number[];
  private readonly hold: number[];
  private readonly nextDisplay: number[];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly tilt = new Quaternion();
  private readonly s = new Vector3();
  private readonly yAxis = new Vector3(0, 1, 0);

  constructor(u: FrameUniforms, kd: readonly [number, number, number], private readonly o: VampireEncounterOptions) {
    const rng = createRng(o.seed);
    const n = o.count;
    this.state = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.matrices = createSchoolMatrices(n);
    this.mesh = new InstancedMesh(createSquidGeometry(VAMPIRE_LOOK.shape, 22), createSquidMaterial(u, kd, VAMPIRE_LOOK, this.state, this.matrices.interleaved), n);
    this.mesh.instanceMatrix = this.matrices.attribute;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'vampyroteuthis-infernalis';
    this.offsets = Array.from({ length: n }, (_, i) => new Vector3((i - (n - 1) / 2) * 1.3, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.4));
    this.pos = this.offsets.map((off) => o.home.clone().add(off));
    this.spin = this.offsets.map(() => rng() * Math.PI * 2);
    this.pose = this.offsets.map(() => 0);
    this.hold = this.offsets.map(() => 0);
    this.nextDisplay = this.offsets.map((_, i) => 3 + i * 5);
    // Vampire squid drift with the body tilted, arms trailing down and slightly forward.
    this.tilt.setFromAxisAngle(new Vector3(1, 0, 0), 0.5);
  }

  update(dt: number, time: number, camera: PerspectiveCamera): void {
    const { o } = this;
    const depth = -camera.position.y;
    this.mesh.visible = depth > o.encounter[0] && depth < o.encounter[1];
    if (!this.mesh.visible) return;
    for (let i = 0; i < o.count; i++) {
      const p = this.pos[i]!;
      const targetY = camera.position.y - 0.4 + this.offsets[i]!.y;
      p.y += (targetY - p.y) * Math.min(1, dt * 0.5);
      p.x += Math.sin(time * 0.15 + i * 2) * 0.05 * dt;
      this.spin[i]! += 0.08 * dt;
      // The display: triggered by the camera coming close, or every 9–14 s anyway.
      this.nextDisplay[i]! -= dt;
      if ((p.distanceTo(camera.position) < 1.6 || this.nextDisplay[i]! <= 0) && this.hold[i]! <= 0 && this.pose[i]! < 0.1) {
        this.hold[i] = 4;
        this.nextDisplay[i] = 9 + ((i * 2.9 + time) % 5);
      }
      this.hold[i] = Math.max(0, this.hold[i]! - dt);
      const target = this.hold[i]! > 0 ? 1 : 0;
      // Folding is quick, unfolding slow.
      this.pose[i]! += (target - this.pose[i]!) * Math.min(1, dt * (target ? 2.5 : 0.6));
      this.q.setFromAxisAngle(this.yAxis, this.spin[i]!).multiply(this.tilt);
      this.m.compose(p, this.q, this.s.setScalar(o.size));
      this.mesh.setMatrixAt(i, this.m);
      this.state.setXYZW(i, i * 2.1, 0, this.pose[i]!, 0);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.matrices.interleaved.needsUpdate = true;
    this.state.needsUpdate = true;
  }

  get simulated(): number {
    return this.mesh.visible ? this.o.count : 0;
  }

  sighting(): SightingSource {
    return {
      species: 'vampyroteuthis-infernalis',
      nearest: (from, out, accept) => {
        if (!this.mesh.visible) return Infinity;
        let best = Infinity;
        for (const p of this.pos) {
          const d = p.distanceTo(from);
          if (d < best && accept(p)) {
            best = d;
            out.copy(p);
          }
        }
        return best;
      },
    };
  }
}
