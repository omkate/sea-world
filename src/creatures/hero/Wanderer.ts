import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { createRng } from '../../core/math/rng';

export interface WanderOptions {
  /** Centre and horizontal radius of the animal's home range (m). */
  home: Vector3;
  radius: number;
  /** Allowed height band: absolute world Y, or height above the seafloor when `floor` is set. */
  yMin: number;
  yMax: number;
  floor: ((x: number, z: number) => number) | null;
  /** Cruise speed (m/s) and maximum turn rate (rad/s): large animals turn slowly. */
  cruise: number;
  maxTurn: number;
  /** Maximum climb/dive angle (rad). */
  maxPitch?: number;
  seed: number;
  /**
   * Other animals to keep clear of, and this animal's personal space (m). Shared by every
   * large animal in the chapter so none ever overlap.
   */
  neighbours?: Wanderer[];
  space?: number;
}

const UP = new Vector3(0, 1, 0);
/** Minimum gap (m) kept between an animal's personal space and the camera lens. */
const CAMERA_CLEARANCE = 1.5;

/**
 * Natural free-swimming motion: the animal picks random destinations inside its home range and
 * steers toward them with limited turn rate, pitch and acceleration, so paths are smooth,
 * unpredictable curves instead of loops. Callers can override the destination (to follow a pod
 * leader or investigate the camera).
 */
export class Wanderer {
  readonly position = new Vector3();
  readonly direction = new Vector3(0, 0, 1);
  readonly quaternion = new Quaternion();
  speed: number;
  /** Signed turn rate of the last step (rad/s), for banking and body bend. */
  turnRate = 0;
  private readonly target = new Vector3();
  private retarget = 0;
  private readonly rng: () => number;
  private readonly desired = new Vector3();
  private readonly basis = new Matrix4();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly axis = new Vector3();
  /** Low-passed steering direction: turns ease in and out instead of snapping to full rate. */
  private readonly steer = new Vector3(0, 0, 1);
  /** Destination the animal is actually heading for; glides toward the chosen target. */
  private readonly goal = new Vector3();
  private readonly push = new Vector3();
  private bank = 0;

  constructor(readonly o: WanderOptions) {
    this.rng = createRng(o.seed);
    this.speed = o.cruise;
    this.pickTarget();
    this.position.copy(this.target);
    const a = this.rng() * Math.PI * 2;
    this.direction.set(Math.cos(a), 0, Math.sin(a));
    this.steer.copy(this.direction);
    this.pickTarget();
    this.goal.copy(this.target);
    o.neighbours?.push(this);
  }

  /** World Y range at a horizontal position. */
  private band(x: number, z: number): [number, number] {
    const base = this.o.floor ? this.o.floor(x, z) : 0;
    return [base + this.o.yMin, base + this.o.yMax];
  }

  private pickTarget(): void {
    const r = Math.sqrt(this.rng()) * this.o.radius;
    const a = this.rng() * Math.PI * 2;
    const x = this.o.home.x + Math.cos(a) * r;
    const z = this.o.home.z + Math.sin(a) * r;
    const [lo, hi] = this.band(x, z);
    this.target.set(x, lo + (hi - lo) * this.rng(), z);
    this.retarget = 7 + this.rng() * 9;
  }

  /**
   * @param override destination that replaces the wander target this step (null = wander)
   * @param speedScale multiplier on cruise speed (e.g. a burst while investigating)
   * @param free ignore the height band (e.g. rising to the camera during an inspection)
   * @param avoid a point to keep clear of (the camera), so animals never swim through the lens
   */
  update(dt: number, override: Vector3 | null = null, speedScale = 1, free = false, avoid: Vector3 | null = null): void {
    this.retarget -= dt;
    if (!override && (this.retarget <= 0 || this.position.distanceTo(this.target) < 3)) this.pickTarget();
    // The goal itself glides toward the chosen destination, so a new choice never jerks the path.
    this.goal.lerp(override ?? this.target, override ? 1 : Math.min(1, dt * 0.35));

    this.desired.subVectors(this.goal, this.position);
    if (this.desired.lengthSq() > 1e-6) this.desired.normalize();
    // Keep clear of every other large animal (never overlapping), strongest when closest.
    const space = this.o.space ?? 2;
    for (const other of this.o.neighbours ?? []) {
      if (other === this) continue;
      this.push.subVectors(this.position, other.position);
      const d = this.push.length();
      const clear = space + (other.o.space ?? 2);
      if (d < clear * 1.3 && d > 1e-4) this.desired.addScaledVector(this.push, ((clear * 1.3 - d) / (clear * 1.3)) * 3 / d);
    }
    if (avoid) {
      this.push.subVectors(this.position, avoid);
      const d = this.push.length();
      const keep = CAMERA_CLEARANCE + (this.o.space ?? 2);
      if (d < keep * 1.6 && d > 1e-4) this.desired.addScaledVector(this.push, ((keep * 1.6 - d) / (keep * 1.6)) * 4 / d);
    }
    // Stay inside the height band and above the seafloor.
    const [lo, hi] = this.band(this.position.x, this.position.z);
    const floorY = this.o.floor ? this.o.floor(this.position.x, this.position.z) + 0.8 : -Infinity;
    if (!free && this.position.y < lo) this.desired.y += (lo - this.position.y) * 0.8;
    if (!free && this.position.y > hi) this.desired.y -= (this.position.y - hi) * 0.8;
    if (this.position.y < floorY) this.desired.y += (floorY - this.position.y) * 2;
    if (this.desired.lengthSq() < 1e-6) this.desired.copy(this.direction);
    this.desired.normalize();
    const maxPitch = this.o.maxPitch ?? 0.3;
    const flat = Math.hypot(this.desired.x, this.desired.z) || 1e-6;
    const pitch = Math.max(-maxPitch, Math.min(maxPitch, Math.atan2(this.desired.y, flat)));
    this.desired.set((this.desired.x / flat) * Math.cos(pitch), Math.sin(pitch), (this.desired.z / flat) * Math.cos(pitch));

    // Ease the steering intent toward the desired heading (≈1.5 s time constant), then turn
    // toward it within the animal's turn-rate limit: turns start and end gently.
    this.rotateToward(this.steer, this.desired, Math.PI * Math.min(1, dt * 0.7));
    const angle = this.direction.angleTo(this.steer);
    const maxStep = this.o.maxTurn * dt;
    const signed = Math.sign(this.direction.x * this.steer.z - this.direction.z * this.steer.x);
    this.rotateToward(this.direction, this.steer, Math.min(angle * Math.min(1, dt * 2.5), maxStep));
    this.turnRate = (signed * Math.min(angle * Math.min(1, dt * 2.5), maxStep)) / Math.max(dt, 1e-4);

    // Slow into sharp turns, ease toward the requested speed.
    const wanted = this.o.cruise * speedScale * (1 - 0.3 * Math.min(1, angle / 1.2));
    this.speed += (wanted - this.speed) * Math.min(1, dt * 0.6);
    this.position.addScaledVector(this.direction, this.speed * dt);

    // Orientation: forward along travel, banked into the turn.
    this.right.crossVectors(UP, this.direction).normalize();
    this.up.crossVectors(this.direction, this.right);
    // Lean into the turn gradually, like a real animal rolls its body.
    const bankTarget = -Math.max(-0.4, Math.min(0.4, this.turnRate * 0.8));
    this.bank += (bankTarget - this.bank) * Math.min(1, dt * 1.5);
    this.right.applyAxisAngle(this.direction, this.bank);
    this.up.applyAxisAngle(this.direction, this.bank);
    this.basis.makeBasis(this.right, this.up, this.direction);
    this.quaternion.setFromRotationMatrix(this.basis);
  }

  /** Home-range destination suggested from outside (e.g. to swim into view); held ~10 s. */
  suggest(point: Vector3): void {
    const [lo, hi] = this.band(point.x, point.z);
    this.target.set(point.x, Math.min(hi, Math.max(lo, point.y)), point.z);
    this.retarget = 10;
  }

  /** Rotates unit vector `v` toward unit vector `to` by at most `maxAngle` radians. */
  private rotateToward(v: Vector3, to: Vector3, maxAngle: number): void {
    const angle = v.angleTo(to);
    if (angle < 1e-5) return;
    this.axis.crossVectors(v, to);
    if (this.axis.lengthSq() < 1e-8) this.axis.copy(UP);
    v.applyAxisAngle(this.axis.normalize(), Math.min(angle, maxAngle)).normalize();
  }

  /** Teleport (used to place followers in formation at start). */
  place(position: Vector3, direction: Vector3): void {
    this.position.copy(position);
    this.direction.copy(direction).normalize();
    this.steer.copy(this.direction);
  }
}
