import { DoubleSide, Matrix4, Mesh, MeshBasicNodeMaterial, Quaternion, Vector3, type BufferGeometry } from 'three/webgpu';
import { createRng } from '../../core/math/rng';
import { Wanderer, type WanderOptions } from './Wanderer';
import { abs, float, normalWorld, positionLocal, sin, smoothstep, texture, uniform, uv, vec3 } from 'three/tsl';
import type { ShaderNode, Uniform } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { ScanAsset } from '../../assets/AssetLibrary';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';

export type SwimStyle =
  /** Sharks and bony fish: a travelling wave bends the body side to side, strongest at the tail. */
  | 'lateral'
  /** Cetaceans: the fluke beats up and down. */
  | 'vertical'
  /** Mantas: the pectoral "wings" flap in a wave from root to tip. */
  | 'wing';

export interface InvestigateOptions {
  /** Only when the camera is within this distance of the animal's home (m). */
  range: number;
  /** Seconds between investigative passes (random in [min, max]). */
  interval: [number, number];
  /** Closest approach to the lens (m) before veering away. */
  closest: number;
  speedScale: number;
}

export interface SwimmerOptions {
  /** Direction the model's head points in its file: rotated so the head faces +z. */
  forward: '+x' | '-x' | '+z' | '-z';
  style: SwimStyle;
  /** Body wave / flap frequency (Hz) at cruise and amplitude (fraction of length or span). */
  beatHz: number;
  amplitude: number;
  wander: WanderOptions;
  /** Extra lengthwise stretch (e.g. a slimmer species from a similar model). */
  stretchZ?: number;
  /** Mesh name when the asset stands in for a different species. */
  name?: string;
  /** Overall size multiplier over the asset's normalised size (a larger relative of the same body plan). */
  scale?: number;
  /** Individual size multiplier (mesh scale; the shared geometry is untouched). */
  size?: number;
  /**
   * Breaching (dolphins): live sea-surface height, and how often to leap. Outside a leap the
   * animal is always kept below the surface, so it can never appear to fly.
   */
  surface?: (x: number, z: number) => number;
  leap?: { interval: [number, number]; launchSpeed: number; spinChance: number };
  /** Occasionally swim up to the camera, the way sharks inspect divers, then veer off. */
  investigate?: InvestigateOptions;
}

/** Launch angle of a leap (rad, ≈55°): spinner leaps are steep, 1–3 m high. */
const LEAP_ANGLE = 0.95;

const ORIENTED = new Map<string, BufferGeometry>();

const HEAD_TO_PLUS_Z: Record<SwimmerOptions['forward'], number> = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 };

/**
 * A single large animal (shark, manta, dolphin) wandering freely through its home range. The scanned model has
 * no skeleton, so locomotion is a vertex-shader deformation matched to how the species swims.
 */
export class HeroSwimmer {
  readonly mesh: Mesh;
  readonly motion: Wanderer;
  private readonly phase: Uniform<number>;
  private beat = 0;
  private readonly rng: () => number;
  private nextVisit: number;
  private visiting: 'no' | 'stage' | 'approach' | 'leave' = 'no';
  private visitTime = 0;
  private leapState: 'swim' | 'rise' | 'air' = 'swim';
  private nextLeap = Infinity;
  private readonly velocity = new Vector3();
  private readonly flat = new Vector3();
  private spin = 0;
  private spinTotal = 0;
  private readonly rollQ = new Quaternion();
  private readonly axisZ = new Vector3(0, 0, 1);
  private readonly lens = new Vector3();
  private readonly away = new Vector3();

  constructor(u: FrameUniforms, kd: readonly [number, number, number], asset: ScanAsset, private readonly o: SwimmerOptions) {
    this.motion = new Wanderer(o.wander);
    this.rng = createRng(o.wander.seed + 99);
    this.nextVisit = o.investigate ? o.investigate.interval[0] * 0.5 + this.rng() * 8 : Infinity;
    this.phase = uniform(0) as Uniform<number>;
    // Animals of the same species share one oriented geometry.
    const key = `${asset.entry.id}|${o.forward}|${o.stretchZ ?? 1}|${o.scale ?? 1}`;
    let g = ORIENTED.get(key);
    if (!g) {
      g = asset.geometry.clone();
      g.applyMatrix4(new Matrix4().makeRotationY(HEAD_TO_PLUS_Z[o.forward]));
      if (o.stretchZ) g.applyMatrix4(new Matrix4().makeScale(1 / Math.sqrt(o.stretchZ), 1, o.stretchZ));
      if (o.scale) g.applyMatrix4(new Matrix4().makeScale(o.scale, o.scale, o.scale));
      g.computeBoundingBox();
      ORIENTED.set(key, g);
    }
    const box = g.boundingBox!;
    const head = box.max.z;
    const length = box.max.z - box.min.z;
    const halfSpan = Math.max(box.max.x, -box.min.x);

    const p: ShaderNode = positionLocal;
    const fromHead: ShaderNode = float(head).sub(p.z).div(length).clamp(0, 1);
    let deformed: ShaderNode;
    if (o.style === 'wing') {
      const out: ShaderNode = smoothstep(halfSpan * 0.15, halfSpan, abs(p.x));
      const flap: ShaderNode = sin((this.phase as ShaderNode).sub(abs(p.x).div(halfSpan).mul(1.6))).mul(out.mul(out)).mul(o.amplitude * halfSpan);
      deformed = vec3(p.x, p.y.add(flap), p.z);
    } else {
      const weight: ShaderNode = smoothstep(0.25, 1, fromHead);
      const wave: ShaderNode = sin((this.phase as ShaderNode).sub(fromHead.mul(4.5))).mul(weight.mul(weight)).mul(o.amplitude * length);
      deformed = o.style === 'lateral' ? vec3(p.x.add(wave), p.y, p.z) : vec3(p.x, p.y.add(wave), p.z);
    }

    const m = new MeshBasicNodeMaterial({ side: DoubleSide });
    m.positionNode = deformed;
    const albedo: ShaderNode = asset.map ? (texture(asset.map, uv()) as ShaderNode).rgb : vec3(0.4, 0.42, 0.44);
    m.colorNode = underwaterLit(u, kd, { albedo, normal: normalWorld, roughness: float(0.45), specular: float(0.2), rim: float(0.35) });
    this.mesh = new Mesh(g, m);
    this.mesh.name = o.name ?? asset.entry.id;
    this.mesh.frustumCulled = false;
    if (o.size) this.mesh.scale.setScalar(o.size);
    if (o.leap) this.nextLeap = this.pickLeapDelay() * 0.5;
    this.sync();
  }

  private pickLeapDelay(): number {
    const [a, b] = this.o.leap!.interval;
    return a + this.rng() * (b - a);
  }

  /** True while the animal is out of the water. */
  get airborne(): boolean {
    return this.leapState === 'air';
  }

  /**
   * One leap: ballistic flight under gravity, oriented along the velocity (nose up on the way
   * out, nose down on re-entry), with an optional spin about the body axis.
   */
  private updateLeap(dt: number, camera: Vector3, cameraForward: Vector3): boolean {
    const o = this.o;
    if (!o.leap || !o.surface) return false;
    const p = this.motion.position;
    const surf = o.surface(p.x, p.z);
    if (this.leapState === 'swim') {
      this.nextLeap -= dt;
      // Save the leap for when the animal is in front of the camera and reasonably close, so
      // breaches are seen rather than happening off-screen.
      this.flat.subVectors(p, camera);
      const dist = this.flat.length();
      const inFront = this.flat.normalize().dot(cameraForward) > 0.55;
      if (this.nextLeap <= 0 && p.y > surf - 12 && inFront && dist < 30) this.leapState = 'rise';
      return false;
    }
    if (this.leapState === 'rise') {
      // Accelerate up toward the surface; launch when the snout breaks it.
      if (p.y > surf - 0.4) {
        this.flat.copy(this.motion.direction).setY(0).normalize();
        const v = o.leap.launchSpeed;
        this.velocity.copy(this.flat).multiplyScalar(v * Math.cos(LEAP_ANGLE)).setY(v * Math.sin(LEAP_ANGLE));
        this.spin = 0;
        this.spinTotal = this.rng() < o.leap.spinChance ? Math.PI * 2 * (1 + Math.floor(this.rng() * 2)) : 0;
        this.leapState = 'air';
      }
      return false;
    }
    // Airborne.
    this.velocity.y -= 9.81 * dt;
    p.addScaledVector(this.velocity, dt);
    const flight = (2 * o.leap.launchSpeed * Math.sin(LEAP_ANGLE)) / 9.81;
    this.spin = Math.min(this.spinTotal, this.spin + (this.spinTotal / flight) * dt);
    const dir = this.flat.copy(this.velocity).normalize();
    this.motion.place(p, dir);
    this.motion.update(0, null, 1, true);
    this.rollQ.setFromAxisAngle(this.axisZ, this.spin);
    this.mesh.position.copy(p);
    this.mesh.quaternion.copy(this.motion.quaternion).multiply(this.rollQ);
    if (this.velocity.y < 0 && p.y < o.surface(p.x, p.z) - 0.3) {
      // Re-entry: carry the dive on underwater at speed.
      this.leapState = 'swim';
      this.nextLeap = this.pickLeapDelay();
      this.motion.speed = o.leap.launchSpeed * 0.7;
    }
    return true;
  }

  /**
   * @param leaderGoal when set, the animal steers toward it (formation swimming) instead of wandering.
   */
  update(dt: number, camera: Vector3, cameraForward: Vector3, leaderGoal: Vector3 | null = null): void {
    let goal: Vector3 | null = leaderGoal;
    let speedScale = 1;
    if (leaderGoal) {
      // Formation keeping: speed up when the slot is ahead, ease off when it is behind.
      this.lens.subVectors(leaderGoal, this.motion.position);
      const ahead = this.lens.dot(this.motion.direction);
      speedScale = Math.max(0.6, Math.min(1.6, 1 + ahead * 0.35));
    }
    const inv = this.o.investigate;
    if (inv) {
      this.nextVisit -= dt;
      this.visitTime += dt;
      const near = camera.distanceTo(this.o.wander.home) < inv.range;
      if (this.visiting === 'no' && this.nextVisit <= 0 && near) {
        this.visiting = 'stage';
        this.visitTime = 0;
      }
      if (this.visiting === 'stage') {
        // First swim out to a spot well in front of the camera, so the approach is head-on.
        this.lens.copy(cameraForward).setY(0).normalize().multiplyScalar(9).add(camera);
        this.lens.y = camera.y - 0.8;
        goal = this.lens;
        if (this.motion.position.distanceTo(this.lens) < 2.5 || this.visitTime > 15) {
          this.visiting = 'approach';
          this.visitTime = 0;
        }
      } else if (this.visiting === 'approach') {
        // Aim at a point just in front of the lens, slightly off-centre, so the animal swims
        // into the frame and past the camera rather than circling it.
        this.lens.copy(cameraForward).multiplyScalar(inv.closest + 1.2).add(camera).add(new Vector3(0.5, -0.3, 0));
        goal = this.lens;
        speedScale = inv.speedScale;
        if (this.motion.position.distanceTo(this.lens) < 1.4 || this.visitTime > 12 || !near) {
          // Carry on past the camera, then away.
          this.visiting = 'leave';
          this.visitTime = 0;
          this.away.copy(this.motion.direction).setY(0).normalize().multiplyScalar(14).add(this.motion.position);
        }
      } else if (this.visiting === 'leave') {
        goal = this.away;
        speedScale = inv.speedScale;
        if (this.motion.position.distanceTo(this.away) < 3 || this.visitTime > 14) {
          this.visiting = 'no';
          this.nextVisit = inv.interval[0] + this.rng() * (inv.interval[1] - inv.interval[0]);
        }
      }
    }
    if (this.updateLeap(dt, camera, cameraForward)) {
      this.beat += dt * this.o.beatHz * Math.PI * 2;
      (this.phase as { value: number }).value = this.beat;
      return;
    }
    if (this.leapState === 'rise') {
      // Head for a point just under the surface ahead, at a burst of speed.
      const p = this.motion.position;
      this.lens.copy(this.motion.direction).setY(0).normalize().multiplyScalar(6).add(p);
      this.lens.y = this.o.surface!(this.lens.x, this.lens.z) + 1;
      goal = this.lens;
      speedScale = 1.8;
    }
    // Keep clear of the lens, except on a deliberate inspection pass.
    this.motion.update(dt, goal, speedScale, this.visiting !== 'no' || this.leapState === 'rise', this.visiting === 'no' ? camera : null);
    // Never above the sea surface outside a leap (body depth + wave margin).
    if (this.o.surface && this.leapState !== 'rise') {
      const p = this.motion.position;
      const ceiling = this.o.surface(p.x, p.z) - 0.9 * (this.o.size ?? 1);
      if (p.y > ceiling) p.y = ceiling;
    }
    // Beat frequency tracks swimming speed, as tail-beat frequency does in real animals.
    this.beat += dt * this.o.beatHz * (this.motion.speed / this.o.wander.cruise) * Math.PI * 2;
    (this.phase as { value: number }).value = this.beat;
    this.sync();
  }

  private sync(): void {
    this.mesh.position.copy(this.motion.position);
    this.mesh.quaternion.copy(this.motion.quaternion);
  }
}
