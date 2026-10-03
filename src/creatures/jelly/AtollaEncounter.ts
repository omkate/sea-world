import { InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { createRng } from '../../core/math/rng';
import { createSchoolMatrices } from '../../ecosystem/schooling/School';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { createAtollaGeometry } from './atollaGeometry';
import { createAtollaMaterial } from './atollaMaterial';

export interface AtollaEncounterOptions {
  /** Where the jellies hang (world) — their spots are spread around it. */
  home: Vector3;
  count: number;
  /** Bell diameter (m) and ± variation. */
  size: number;
  sizeVariation: number;
  /** Camera depths over which the scene plays; the jellies' depth eases toward the lens. */
  encounter: readonly [number, number];
  seed: number;
}

/**
 * The Atolla scene: a few alarm jellies hanging in the dark around the lens. Each fires its
 * pinwheel display when the camera comes close, and every few seconds anyway, out of step with
 * the others, so blue alarms keep flaring around the viewer.
 */
export class AtollaEncounter {
  readonly mesh: InstancedMesh;
  private readonly state: InstancedBufferAttribute;
  private readonly matrices: ReturnType<typeof createSchoolMatrices>;
  private readonly offsets: Vector3[];
  private readonly pos: Vector3[];
  private readonly size: number[];
  private readonly tilt: Quaternion[];
  private readonly alarm: number[];
  private readonly nextAlarm: number[];
  private readonly phase: number[];
  private readonly m = new Matrix4();
  private readonly s = new Vector3();

  constructor(u: FrameUniforms, kd: readonly [number, number, number], private readonly o: AtollaEncounterOptions) {
    const rng = createRng(o.seed);
    const n = o.count;
    this.state = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.matrices = createSchoolMatrices(n);
    this.mesh = new InstancedMesh(createAtollaGeometry(), createAtollaMaterial(u, kd, this.state, this.matrices.interleaved), n);
    this.mesh.instanceMatrix = this.matrices.attribute;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'atolla-wyvillei';
    // Spread across the view, at different distances and heights.
    this.offsets = Array.from({ length: n }, (_, i) => new Vector3((i / Math.max(1, n - 1) - 0.5) * 2.6 + (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.9, (rng() - 0.5) * 1.2));
    this.pos = this.offsets.map((off) => o.home.clone().add(off));
    this.size = this.offsets.map(() => o.size * (1 + (rng() * 2 - 1) * o.sizeVariation));
    this.tilt = this.offsets.map(() => new Quaternion().setFromAxisAngle(new Vector3(rng() - 0.5, 0, rng() - 0.5).normalize(), 0.15 + rng() * 0.35));
    this.alarm = this.offsets.map(() => 0);
    this.nextAlarm = this.offsets.map((_, i) => 1.5 + i * 1.7 + rng() * 2);
    this.phase = this.offsets.map(() => rng());
  }

  update(dt: number, time: number, camera: PerspectiveCamera): void {
    const { o } = this;
    const depth = -camera.position.y;
    this.mesh.visible = depth > o.encounter[0] && depth < o.encounter[1];
    if (!this.mesh.visible) return;
    for (let i = 0; i < o.count; i++) {
      const p = this.pos[i]!;
      // Fixed in the water horizontally; depth eases toward the lens so the scene lasts.
      const targetY = camera.position.y - 0.6 + this.offsets[i]!.y;
      p.y += (targetY - p.y) * Math.min(1, dt * 0.5);
      p.y += Math.sin(time * 0.4 + this.phase[i]! * 6) * 0.02 * dt;
      this.nextAlarm[i]! -= dt;
      if (p.distanceTo(camera.position) < 2.2 && this.alarm[i]! < 0.2) this.alarm[i] = 1;
      if (this.nextAlarm[i]! <= 0) {
        this.alarm[i] = 1;
        this.nextAlarm[i] = 6 + ((i * 3.7 + time * 1.3) % 6);
      }
      this.alarm[i] = Math.max(0, this.alarm[i]! - dt * 0.3);
      this.m.compose(p, this.tilt[i]!, this.s.setScalar(this.size[i]!));
      this.mesh.setMatrixAt(i, this.m);
      this.state.setXYZW(i, this.phase[i]!, this.alarm[i]!, 0, 0);
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
      species: 'atolla-wyvillei',
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
