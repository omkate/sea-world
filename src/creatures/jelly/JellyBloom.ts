import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { createRng } from '../../core/math/rng';
import { createJellyGeometry } from './jellyGeometry';
import { createJellyMaterial } from './jellyMaterial';

export interface JellyPlacement {
  home: Vector3;
  /** Horizontal radius of the drift range (m) and the allowed world-Y band. */
  radius: number;
  yMin: number;
  yMax: number;
}

export interface JellyBloomOptions {
  /** Bell diameter (m) and ± variation fraction. */
  size: number;
  sizeVariation: number;
  /** Ambient current (m/s) the bloom drifts with. */
  current: Vector3;
  /** Hidden and not simulated beyond this distance from the camera (m). */
  range: number;
  seed: number;
}

const UP = new Vector3(0, 1, 0);

/** CPU copy of the shader's bell beat, so lift arrives on the contraction. */
const beat = (cycle: number): number => {
  const s = (e0: number, e1: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return k * k * (3 - 2 * k);
  };
  return s(0, 0.22, cycle) * s(0.75, 0.3, cycle);
};

/**
 * Drifting medusae: each beat of the bell gives a little lift, slight negative buoyancy sinks
 * them between beats, and the current carries them. A soft pull keeps each jelly near its
 * placement. All jellies share one instanced mesh (one draw call); out-of-range ones are
 * collapsed and skipped.
 */
export class JellyBloom {
  readonly mesh: InstancedMesh;
  private readonly pulse: InstancedBufferAttribute;
  private readonly pos: Vector3[];
  private readonly vel: Vector3[];
  private readonly tilt: Vector3[];
  private readonly size: number[];
  private readonly active: boolean[];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly axis = new Vector3();
  private readonly s = new Vector3();

  constructor(
    u: FrameUniforms,
    kd: readonly [number, number, number],
    private readonly places: readonly JellyPlacement[],
    private readonly o: JellyBloomOptions,
  ) {
    const n = places.length;
    const rng = createRng(o.seed);
    this.pulse = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.size = places.map(() => o.size * (1 + (rng() * 2 - 1) * o.sizeVariation));
    for (let i = 0; i < n; i++) this.pulse.setXYZW(i, rng(), 0.45 + rng() * 0.3, rng(), this.size[i]!);
    this.mesh = new InstancedMesh(createJellyGeometry(o.seed), createJellyMaterial(u, kd, this.pulse), n);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'jelly-bloom';
    this.pos = places.map((p) => new Vector3(p.home.x + (rng() - 0.5) * p.radius, p.yMin + (p.yMax - p.yMin) * (0.3 + 0.4 * rng()), p.home.z + (rng() - 0.5) * p.radius));
    this.vel = places.map(() => new Vector3());
    this.tilt = places.map(() => new Vector3((rng() - 0.5) * 0.2, 1, (rng() - 0.5) * 0.2).normalize());
    this.active = places.map(() => true);
  }

  update(dt: number, time: number, camera: Vector3): void {
    const { o } = this;
    let any = false;
    let changed = false;
    for (let i = 0; i < this.places.length; i++) {
      const p = this.places[i]!;
      const on = p.home.distanceTo(camera) <= o.range;
      any ||= on;
      if (!on) {
        if (this.active[i]) {
          this.m.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this.m);
          changed = true;
        }
        this.active[i] = false;
        continue;
      }
      this.active[i] = true;
      changed = true;

      const pos = this.pos[i]!;
      const vel = this.vel[i]!;
      const tilt = this.tilt[i]!;
      const cycle = (time * this.pulse.getY(i) + this.pulse.getX(i)) % 1;
      // Lift along the bell axis on each contraction, sinking slowly between beats.
      const lift = beat(cycle) * 0.09 * this.size[i]! * 4;
      vel.addScaledVector(tilt, lift * dt);
      vel.y -= 0.012 * dt;
      // Soft home range and depth band.
      const hx = p.home.x - pos.x;
      const hz = p.home.z - pos.z;
      const hd = Math.hypot(hx, hz);
      if (hd > p.radius) {
        vel.x += (hx / hd) * (hd - p.radius) * 0.02 * dt;
        vel.z += (hz / hd) * (hd - p.radius) * 0.02 * dt;
      }
      if (pos.y < p.yMin) vel.y += (p.yMin - pos.y) * 0.05 * dt;
      if (pos.y > p.yMax) vel.y -= (pos.y - p.yMax) * 0.05 * dt;
      // Water drag toward the ambient current.
      vel.lerp(o.current, Math.min(1, dt * 0.8));
      pos.addScaledVector(vel, dt);

      // The bell axis wobbles slowly and leans with the beat.
      this.axis.set(tilt.x + Math.sin(time * 0.21 + i * 1.7) * 0.12, 1, tilt.z + Math.cos(time * 0.17 + i * 2.3) * 0.12).normalize();
      this.q.setFromUnitVectors(UP, this.axis);
      this.m.compose(pos, this.q, this.s.setScalar(this.size[i]!));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.visible = any;
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
