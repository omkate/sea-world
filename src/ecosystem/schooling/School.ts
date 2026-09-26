import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material } from 'three/webgpu';
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
}

const TABLE = 4096;
const UP = new Vector3(0, 1, 0);

/**
 * CPU boids for one species school. Separation, alignment and cohesion within a neighbour
 * radius (spatial hash), a soft home range and depth band, seafloor avoidance and a flight
 * response to the camera. Turn rate and acceleration are limited, so nothing snaps around.
 */
export class School {
  readonly mesh: InstancedMesh;
  readonly swim: InstancedBufferAttribute;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly size: Float32Array;
  private readonly personality: Float32Array;
  private readonly cellOf: Int32Array;
  private readonly cellStart = new Int32Array(TABLE + 1);
  private readonly sorted: Int32Array;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly basis = new Matrix4();
  private readonly tmp = { f: new Vector3(), r: new Vector3(), u: new Vector3(), p: new Vector3(), s: new Vector3() };

  constructor(
    geometry: BufferGeometry,
    material: Material,
    swim: InstancedBufferAttribute,
    private readonly o: SchoolOptions,
  ) {
    const n = o.count;
    this.swim = swim;
    this.swim.setUsage(DynamicDrawUsage);
    this.mesh = new InstancedMesh(geometry, material, n);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.personality = new Float32Array(n);
    this.cellOf = new Int32Array(n);
    this.sorted = new Int32Array(n);

    const rng = createRng(o.seed);
    const heading = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(rng()) * o.homeRadius * 0.6;
      const a = rng() * Math.PI * 2;
      this.pos[i * 3] = o.home.x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = o.yMin + (o.yMax - o.yMin) * (0.3 + 0.4 * rng());
      this.pos[i * 3 + 2] = o.home.z + Math.sin(a) * r;
      this.size[i] = o.length * (1 + (rng() * 2 - 1) * o.lengthVariation);
      const sp = o.cruiseBL * this.size[i]!;
      const h = heading + (rng() - 0.5) * (1.6 - o.cohesion);
      this.vel[i * 3] = Math.cos(h) * sp;
      this.vel[i * 3 + 2] = Math.sin(h) * sp;
      this.personality[i] = rng();
      swim.setXYZW(i, rng() * Math.PI * 2, 1, 0, rng());
    }
  }

  /** Centre of the school (for LOD / culling decisions). */
  get centre(): Vector3 {
    return this.o.home;
  }

  update(dt: number, time: number, camera: Vector3): void {
    const o = this.o;
    const n = o.count;
    const { pos, vel } = this;
    const cell = o.neighbourBL * o.length;
    const inv = 1 / cell;

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
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const px = pos[ix]!;
      const py = pos[ix + 1]!;
      const pz = pos[ix + 2]!;
      const len = this.size[i]!;
      const cruise = o.cruiseBL * len;
      const sepDist = o.separationBL * len;
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
        const k = o.cohesion;
        fx += (ax / count - vel[ix]!) * 1.2 * k + (cx / count) * 0.8 * k;
        fy += (ay / count - vel[ix + 1]!) * 1.2 * k + (cy / count) * 0.8 * k;
        fz += (az / count - vel[ix + 2]!) * 1.2 * k + (cz / count) * 0.8 * k;
      }

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

      // Swim state for the shader: tail-beat frequency from the Strouhal relation (St ≈ 0.3,
      // tail amplitude ≈ 0.2 L ⇒ f ≈ 1.5 · speed / L), bend from the signed turn rate.
      const freq = Math.min(9, Math.max(1.2, (1.5 * newSpeed) / len));
      const turnSign = Math.sign(oldDir.x * newDir.z - oldDir.z * newDir.x);
      const turnRate = angle / Math.max(dt, 1e-4);
      const prevPhase = this.swim.getX(i);
      this.swim.setXYZW(
        i,
        (prevPhase + freq * Math.PI * 2 * dt) % (Math.PI * 2000),
        0.6 + 0.8 * Math.min(1.6, newSpeed / cruise),
        -turnSign * Math.min(1, turnRate / o.maxTurn) * 0.12,
        this.swim.getW(i),
      );

      // Orientation: forward along velocity, back kept up, banked into turns.
      f.copy(newDir);
      r.crossVectors(UP, f);
      if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
      r.normalize();
      up.crossVectors(f, r);
      const bank = -turnSign * Math.min(1, turnRate / o.maxTurn) * 0.35;
      if (bank !== 0) {
        r.applyAxisAngle(f, bank);
        up.applyAxisAngle(f, bank);
      }
      this.basis.makeBasis(r, up, f);
      this.q.setFromRotationMatrix(this.basis);
      this.m.compose(p.set(pos[ix]!, pos[ix + 1]!, pos[ix + 2]!), this.q, s.setScalar(len));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.swim.needsUpdate = true;
  }
}

function hashCell(x: number, y: number, z: number): number {
  return (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) & (TABLE - 1);
}
