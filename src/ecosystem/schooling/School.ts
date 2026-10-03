import { DynamicDrawUsage, InstancedBufferAttribute, InstancedInterleavedBuffer, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material } from 'three/webgpu';
import { createRng } from '../../core/math/rng';

export interface SchoolOptions {
  count: number;
  /** Mean total length (m) and ± variation fraction. */
  length: number;
  lengthVariation: number;
  home: Vector3;
  /** Horizontal radius of the home range (m). */
  homeRadius: number;
  /** Allowed world-Y band (negative = below surface). */
  yMin: number;
  yMax: number;
  /** Cruise speed in body lengths per second. */
  cruiseBL: number;
  /** Maximum turn rate (rad/s) at cruise; bigger fish turn slower. */
  maxTurn: number;
  /** Neighbour radius and personal space, in body lengths. */
  neighbourBL: number;
  separationBL: number;
  /** 0 = loose aggregation (reef grazers) … 1 = tight polarised school. */
  cohesion: number;
  /** Distance at which fish shy away from the camera (m). */
  fleeRadius: number;
  /** Seafloor height (world Y) under a point, or null over open water. */
  floor: (x: number, z: number) => number | null;
  floorClearance: number;
  seed: number;
  /**
   * Camera-relative fauna: the group lives in a box of this size centred on `home`, which the
   * caller moves with the camera. Fish leaving one side re-enter on the other (like the suspended
   * particles) and shrink away near the faces, so they never pop. Home range and depth band
   * are not used.
   */
  wrap?: Vector3;
  /** Extra rolling about the body axis (rad amplitude), e.g. hatchetfish tilting their mirrors. */
  roll?: number;
}

const TABLE = 4096;
const UP = new Vector3(0, 1, 0);

/** Instance matrices for a school, shared with its material (see `createFishMaterial`). */
export function createSchoolMatrices(count: number): { attribute: InstancedBufferAttribute; interleaved: InstancedInterleavedBuffer } {
  const attribute = new InstancedBufferAttribute(new Float32Array(count * 16), 16);
  attribute.setUsage(DynamicDrawUsage);
  const interleaved = new InstancedInterleavedBuffer(attribute.array as Float32Array, 16, 1);
  interleaved.setUsage(DynamicDrawUsage);
  return { attribute, interleaved };
}

/**
 * CPU boids for one species. Separation, alignment and cohesion within a neighbour radius
 * (spatial hash), a soft home range and depth band, seafloor avoidance and a flight response
 * to the camera. Turn rate and acceleration are limited, so nothing snaps around.
 *
 * Every group of the species (each with its own home, band and behaviour) shares one
 * instanced mesh, so a species costs one draw call however many groups it has. Groups beyond
 * the cull range are collapsed and not simulated.
 */
export class School {
  readonly mesh: InstancedMesh;
  readonly swim: InstancedBufferAttribute;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly size: Float32Array;
  private readonly personality: Float32Array;
  /** Tail-beat phase and individual variation per fish (kept here, as instance slots move). */
  private readonly phase: Float32Array;
  private readonly variation: Float32Array;
  private readonly cellOf: Int32Array;
  private readonly cellStart = new Int32Array(TABLE + 1);
  private readonly sorted: Int32Array;
  private readonly groupOf: Uint16Array;
  private readonly active: boolean[];
  private readonly count: number;
  private readonly cell: number;
  /** Predators the fish flee from, and how close they must be to cause flight (m). */
  private threats: readonly Vector3[] = [];
  private threatRadius = 0;
  /** Per group, 0 calm … 1 under attack: the group packs tight (a bait ball). */
  private readonly alarms: number[];
  /** Per group, the fraction of its fish present (0..1), e.g. a density curve over depth. */
  private readonly density: number[];
  /** A predator group's strike: it leaves its home range for the target, faster. */
  private chase: { group: number; target: Vector3; boost: number } | null = null;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly basis = new Matrix4();
  private readonly tmp = { f: new Vector3(), r: new Vector3(), u: new Vector3(), p: new Vector3(), s: new Vector3() };

  constructor(
    geometry: BufferGeometry,
    material: Material,
    swim: InstancedBufferAttribute,
    private readonly groups: readonly SchoolOptions[],
    private readonly matrices: ReturnType<typeof createSchoolMatrices>,
  ) {
    const n = groups.reduce((sum, g) => sum + g.count, 0);
    this.count = n;
    this.cell = Math.max(...groups.map((g) => g.neighbourBL * g.length));
    this.swim = swim;
    this.swim.setUsage(DynamicDrawUsage);
    this.mesh = new InstancedMesh(geometry, material, n);
    this.mesh.instanceMatrix = matrices.attribute;
    // Nothing is drawn until the first update has placed the active fish.
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.personality = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.variation = new Float32Array(n);
    this.cellOf = new Int32Array(n);
    this.sorted = new Int32Array(n);
    this.groupOf = new Uint16Array(n);
    this.active = groups.map(() => true);
    this.alarms = groups.map(() => 0);
    this.density = groups.map(() => 1);

    let i = 0;
    groups.forEach((o, g) => {
      const rng = createRng(o.seed);
      const heading = rng() * Math.PI * 2;
      for (let k = 0; k < o.count; k++, i++) {
        this.groupOf[i] = g;
        const r = Math.sqrt(rng()) * o.homeRadius * 0.6;
        const a = rng() * Math.PI * 2;
        this.pos[i * 3] = o.home.x + Math.cos(a) * r;
        this.pos[i * 3 + 1] = o.yMin + (o.yMax - o.yMin) * (0.3 + 0.4 * rng());
        this.pos[i * 3 + 2] = o.home.z + Math.sin(a) * r;
        if (o.wrap) {
          // Camera-relative fauna start spread evenly through their box.
          this.pos[i * 3] = o.home.x + (rng() - 0.5) * o.wrap.x;
          this.pos[i * 3 + 1] = o.home.y + (rng() - 0.5) * o.wrap.y;
          this.pos[i * 3 + 2] = o.home.z + (rng() - 0.5) * o.wrap.z;
        }
        this.size[i] = o.length * (1 + (rng() * 2 - 1) * o.lengthVariation);
        const sp = o.cruiseBL * this.size[i]!;
        const h = heading + (rng() - 0.5) * (1.6 - o.cohesion);
        this.vel[i * 3] = Math.cos(h) * sp;
        this.vel[i * 3 + 2] = Math.sin(h) * sp;
        this.personality[i] = rng();
        this.phase[i] = rng() * Math.PI * 2;
        this.variation[i] = rng();
      }
    });
  }

  /**
   * Activates the groups within `range` of the camera. Only active fish are written to instance
   * slots on the next update (and the draw count shrinks to match), so out-of-range groups cost
   * no vertices at all. Returns whether any group is active; cheap enough for every frame.
   */
  cull(camera: Vector3, range: number): boolean {
    let any = false;
    this.groups.forEach((o, g) => {
      this.active[g] = o.home.distanceTo(camera) <= range;
      any ||= this.active[g];
    });
    return any;
  }

  /** Every fish in the school, and those in groups currently in range (simulated and drawn). */
  get total(): number {
    return this.count;
  }

  get simulated(): number {
    return this.groups.reduce((n, g, i) => n + (this.active[i] ? Math.round(g.count * this.density[i]!) : 0), 0);
  }

  setDensity(group: number, density: number): void {
    this.density[group] = density;
  }

  setAlarm(group: number, alarm: number): void {
    this.alarms[group] = alarm;
  }

  setThreats(points: readonly Vector3[], radius: number): void {
    this.threats = points;
    this.threatRadius = radius;
  }

  /** Sends group `group` after `target` at `boost` × cruise speed; null returns it home. */
  setChase(chase: { group: number; target: Vector3; boost: number } | null): void {
    this.chase = chase;
  }

  /** Centre of a group's fish (active or not), for predators to aim at. */
  groupCentre(group: number, out: Vector3): Vector3 {
    out.set(0, 0, 0);
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.groupOf[i] !== group) continue;
      out.x += this.pos[i * 3]!;
      out.y += this.pos[i * 3 + 1]!;
      out.z += this.pos[i * 3 + 2]!;
      n++;
    }
    return n > 0 ? out.divideScalar(n) : out.copy(this.groups[group]!.home);
  }

  /** The mesh's matrices and the material's interleaved view of them both need re-uploading. */
  private markMatrices(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.matrices.interleaved.needsUpdate = true;
  }

  /** The active fish nearest `from` that passes `accept`, written to `out`; returns its distance. */
  nearest(from: Vector3, out: Vector3, accept: (p: Vector3) => boolean): number {
    let best = Infinity;
    const p = this.tmp.p;
    for (let i = 0; i < this.count; i++) {
      const g = this.groupOf[i]!;
      if (!this.active[g] || this.personality[i]! >= this.density[g]!) continue;
      p.set(this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!);
      const d2 = p.distanceToSquared(from);
      if (d2 < best && accept(p)) {
        best = d2;
        out.copy(p);
      }
    }
    return Math.sqrt(best);
  }

  update(dt: number, time: number, camera: Vector3): void {
    const n = this.count;
    const { pos, vel } = this;
    const inv = 1 / this.cell;

    // Spatial hash (counting sort into TABLE buckets).
    this.cellStart.fill(0);
    for (let i = 0; i < n; i++) {
      const h = hashCell(Math.floor(pos[i * 3]! * inv), Math.floor(pos[i * 3 + 1]! * inv), Math.floor(pos[i * 3 + 2]! * inv));
      this.cellOf[i] = h;
      this.cellStart[h + 1]!++;
    }
    for (let c = 0; c < TABLE; c++) this.cellStart[c + 1]! += this.cellStart[c]!;
    const fill = this.cellStart.slice(0, TABLE);
    for (let i = 0; i < n; i++) this.sorted[fill[this.cellOf[i]!]!++] = i;

    const { f, r, u: up, p, s } = this.tmp;
    // Active fish are packed into the first `slot` instances.
    let slot = 0;
    for (let i = 0; i < n; i++) {
      const g = this.groupOf[i]!;
      if (!this.active[g]) continue;
      // Fish beyond the group's density are absent: neither simulated nor drawn.
      if (this.personality[i]! >= this.density[g]!) continue;
      const o = this.groups[g]!;
      const ix = i * 3;
      const px = pos[ix]!;
      const py = pos[ix + 1]!;
      const pz = pos[ix + 2]!;
      const len = this.size[i]!;
      const chasing = this.chase !== null && this.chase.group === g ? this.chase : null;
      const cruise = o.cruiseBL * len * (chasing ? chasing.boost : 1);
      const alarm = this.alarms[g]!;
      const sepDist = o.separationBL * len * (1 - 0.35 * alarm);
      const radius = o.neighbourBL * len;

      let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, count = 0;
      const gx = Math.floor(px * inv), gy = Math.floor(py * inv), gz = Math.floor(pz * inv);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            const h = hashCell(gx + dx, gy + dy, gz + dz);
            for (let k = this.cellStart[h]!; k < this.cellStart[h + 1]!; k++) {
              const j = this.sorted[k]!;
              if (j === i) continue;
              const jx = j * 3;
              const ox = pos[jx]! - px, oy = pos[jx + 1]! - py, oz = pos[jx + 2]! - pz;
              const d2 = ox * ox + oy * oy + oz * oz;
              if (d2 > radius * radius || d2 < 1e-10) continue;
              const d = Math.sqrt(d2);
              if (d < sepDist) {
                const w = (sepDist - d) / sepDist / d;
                sx -= ox * w; sy -= oy * w; sz -= oz * w;
              }
              ax += vel[jx]!; ay += vel[jx + 1]!; az += vel[jx + 2]!;
              cx += ox; cy += oy; cz += oz;
              count++;
              if (count > 12) break;
            }
          }

      let fx = sx * 2.2 * cruise, fy = sy * 2.2 * cruise, fz = sz * 2.2 * cruise;
      if (count > 0) {
        const k = o.cohesion + (1 - o.cohesion) * alarm;
        fx += (ax / count - vel[ix]!) * 1.2 * k + (cx / count) * 0.8 * k;
        fy += (ay / count - vel[ix + 1]!) * 1.2 * k + (cy / count) * 0.8 * k;
        fz += (az / count - vel[ix + 2]!) * 1.2 * k + (cz / count) * 0.8 * k;
      }

      if (o.wrap) {
        // Camera-relative: the wrap box keeps the group together; no home range or band.
      } else if (chasing) {
        // A strike: straight at the target, in three dimensions.
        const tx = chasing.target.x - px, ty = chasing.target.y - py, tz = chasing.target.z - pz;
        const td = Math.hypot(tx, ty, tz) || 1;
        fx += (tx / td) * cruise * 3;
        fy += (ty / td) * cruise * 3;
        fz += (tz / td) * cruise * 3;
      } else {
        // Home range (soft, grows outside the radius) and depth band.
        const hx = o.home.x - px, hz = o.home.z - pz;
        const hd = Math.hypot(hx, hz);
        if (hd > o.homeRadius * 0.5) {
          const pull = ((hd - o.homeRadius * 0.5) / o.homeRadius) * cruise * 1.5;
          fx += (hx / hd) * pull;
          fz += (hz / hd) * pull;
        }
        if (py < o.yMin) fy += (o.yMin - py) * 2 * cruise;
        if (py > o.yMax) fy -= (py - o.yMax) * 2 * cruise;
      }

      // Seafloor.
      const floorY = o.floor(px, pz);
      if (floorY !== null && py < floorY + o.floorClearance) fy += (floorY + o.floorClearance - py) * 4 * cruise + cruise;

      // Camera: startle and give way.
      const ex = px - camera.x, ey = py - camera.y, ez = pz - camera.z;
      const ed = Math.hypot(ex, ey, ez);
      let startle = 0;
      if (ed < o.fleeRadius && ed > 1e-3) {
        startle = 1 - ed / o.fleeRadius;
        const push = startle * cruise * 6;
        fx += (ex / ed) * push;
        fy += (ey / ed) * push * 0.4;
        fz += (ez / ed) * push;
      }
      // Predators: flee harder than from the camera, and keep some depth discipline.
      for (const t of this.threats) {
        const qx = px - t.x, qy = py - t.y, qz = pz - t.z;
        const qd = Math.hypot(qx, qy, qz);
        if (qd >= this.threatRadius || qd < 1e-3) continue;
        const fear = 1 - qd / this.threatRadius;
        startle = Math.max(startle, fear);
        const push = fear * cruise * 9;
        fx += (qx / qd) * push;
        fy += (qy / qd) * push * 0.5;
        fz += (qz / qd) * push;
      }

      // Individual wander.
      const pers = this.personality[i]!;
      fx += Math.sin(time * 0.37 + pers * 40) * cruise * 0.35;
      fy += Math.sin(time * 0.23 + pers * 17) * cruise * 0.12;
      fz += Math.cos(time * 0.31 + pers * 29) * cruise * 0.35;

      // Integrate with turn-rate and speed limits.
      const vx = vel[ix]!, vy = vel[ix + 1]!, vz = vel[ix + 2]!;
      const speed = Math.hypot(vx, vy, vz) || cruise;
      let nx = vx + fx * dt, ny = vy + fy * dt, nz = vz + fz * dt;
      ny = Math.max(-0.45 * speed, Math.min(0.45 * speed, ny));
      const nSpeed = Math.hypot(nx, ny, nz) || 1e-6;
      const oldDir = p.set(vx / speed, vy / speed, vz / speed);
      const newDir = s.set(nx / nSpeed, ny / nSpeed, nz / nSpeed);
      const angle = Math.acos(Math.max(-1, Math.min(1, oldDir.dot(newDir))));
      const maxTurn = o.maxTurn * (1 + startle * 2) * dt;
      if (angle > maxTurn) {
        const k = maxTurn / angle;
        newDir.lerpVectors(oldDir, newDir, k).normalize();
      }
      const target = cruise * (0.75 + 0.5 * pers) * (1 + startle * 1.8);
      const newSpeed = speed + (target - speed) * Math.min(1, dt * 1.5);
      vel[ix] = newDir.x * newSpeed;
      vel[ix + 1] = newDir.y * newSpeed;
      vel[ix + 2] = newDir.z * newSpeed;
      pos[ix] = px + vel[ix]! * dt;
      pos[ix + 1] = py + vel[ix + 1]! * dt;
      pos[ix + 2] = pz + vel[ix + 2]! * dt;
      let fade = 1;
      if (o.wrap) {
        const w = o.wrap;
        for (let a = 0; a < 3; a++) {
          const size = a === 0 ? w.x : a === 1 ? w.y : w.z;
          const centre = a === 0 ? o.home.x : a === 1 ? o.home.y : o.home.z;
          const half = size / 2;
          let rel = pos[ix + a]! - centre;
          rel -= Math.round(rel / size) * size;
          pos[ix + a] = centre + rel;
          // Shrink to nothing over the outer quarter of the box.
          fade = Math.min(fade, Math.min(1, (half - Math.abs(rel)) / (half * 0.25)));
        }
      }

      // Swim state for the shader: tail-beat frequency from the Strouhal relation (St ≈ 0.3,
      // tail amplitude ≈ 0.2 L ⇒ f ≈ 1.5 · speed / L), bend from the signed turn rate.
      const freq = Math.min(9, Math.max(1.2, (1.5 * newSpeed) / len));
      const turnSign = Math.sign(oldDir.x * newDir.z - oldDir.z * newDir.x);
      const turnRate = angle / Math.max(dt, 1e-4);
      this.phase[i] = (this.phase[i]! + freq * Math.PI * 2 * dt) % (Math.PI * 2000);
      this.swim.setXYZW(
        slot,
        this.phase[i]!,
        0.6 + 0.8 * Math.min(1.6, newSpeed / cruise),
        -turnSign * Math.min(1, turnRate / o.maxTurn) * 0.12,
        this.variation[i]!,
      );

      // Orientation: forward along velocity, back kept up, banked into turns.
      f.copy(newDir);
      r.crossVectors(UP, f);
      if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
      r.normalize();
      up.crossVectors(f, r);
      const bank = -turnSign * Math.min(1, turnRate / o.maxTurn) * 0.35 + (o.roll ? Math.sin(time * 0.9 + pers * 40) * o.roll : 0);
      if (bank !== 0) {
        r.applyAxisAngle(f, bank);
        up.applyAxisAngle(f, bank);
      }
      this.basis.makeBasis(r, up, f);
      this.q.setFromRotationMatrix(this.basis);
      this.m.compose(p.set(pos[ix]!, pos[ix + 1]!, pos[ix + 2]!), this.q, s.setScalar(len * Math.max(fade, 0)));
      this.mesh.setMatrixAt(slot, this.m);
      slot++;
    }
    this.mesh.count = slot;
    this.markMatrices();
    this.swim.needsUpdate = true;
  }
}

function hashCell(x: number, y: number, z: number): number {
  return (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) & (TABLE - 1);
}
