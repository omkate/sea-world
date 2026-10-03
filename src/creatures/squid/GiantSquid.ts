import { InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { createSchoolMatrices } from '../../ecosystem/schooling/School';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { createSquidGeometry } from './squidGeometry';
import { createSquidMaterial } from './squidMaterial';
import { GIANT_LOOK } from './squidSpecies';

export interface GiantSquidOptions {
  /** Centre of its patrol (world) and horizontal radius (m). */
  home: Vector3;
  radius: number;
  /** Total length including the tentacles (m). */
  length: number;
  /** Cruise speed (m/s) and turn rate (rad/s). */
  cruise: number;
  turn: number;
  /**
   * Camera depths (m) over which the encounter happens. Within them the squid eases toward
   * just below the lens, so a level 8 m animal stays in frame for more than a moment.
   */
  encounter: readonly [number, number];
}

const UP = new Vector3(0, 1, 0);
/** Body axis tilt from vertical (rad): giant squid swim nearly level, mantle first. */
const TILT = 1.35;

/**
 * A giant squid patrolling a stretch of the twilight: one large animal gliding mantle-first on
 * slow fin beats, tentacles trailing, crossing the view and turning back at each end, with a slow jet
 * now and then. Its patrol is fixed in the water (it swims across the frame), but during the
 * encounter its depth eases toward the lens. A single instance of the shared squid mesh.
 */
export class GiantSquid {
  readonly mesh: InstancedMesh;
  private readonly state = new InstancedBufferAttribute(new Float32Array(4), 4);
  private readonly matrices = createSchoolMatrices(1);
  readonly position: Vector3;
  private heading = 0;
  /** Which end of the patrol line it is heading for (+1 / −1 along x). */
  private leg = 1;
  private jet = 0;
  private nextJet = 9;
  private readonly m = new Matrix4();
  private readonly axis = new Vector3();
  private readonly h = new Vector3();
  private readonly x = new Vector3();
  private readonly z = new Vector3();
  private readonly s = new Vector3();
  private readonly toHome = new Vector3();

  constructor(u: FrameUniforms, kd: readonly [number, number, number], private readonly o: GiantSquidOptions) {
    this.mesh = new InstancedMesh(createSquidGeometry(GIANT_LOOK.shape, 22), createSquidMaterial(u, kd, GIANT_LOOK, this.state, this.matrices.interleaved), 1);
    this.mesh.instanceMatrix = this.matrices.attribute;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'architeuthis-dux';
    this.position = o.home.clone().add(new Vector3(-o.radius, 0, 0));
  }

  update(dt: number, time: number, camera: PerspectiveCamera): void {
    const { o } = this;
    const depth = -camera.position.y;
    this.mesh.visible = depth > o.encounter[0] && depth < o.encounter[1];
    if (!this.mesh.visible) return;
    const targetY = camera.position.y - 1.5;
    this.position.y += (targetY - this.position.y) * Math.min(1, dt * 0.4);
    // Patrol back and forth across the view: swim toward one end of the line, then the other.
    const end = this.toHome.copy(o.home).add(this.s.set(this.leg * o.radius, 0, 0)).sub(this.position).setY(0);
    if (end.length() < 1) this.leg = -this.leg;
    const want = Math.atan2(end.z, end.x);
    let dh = want - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += Math.max(-o.turn, Math.min(o.turn, dh)) * dt;
    // A slow jet now and then (the mantle squeezes, the arms gather).
    this.nextJet -= dt;
    if (this.nextJet <= 0) {
      this.jet = 1;
      this.nextJet = 10 + (time % 6);
    }
    this.jet = Math.max(0, this.jet - dt * 0.5);
    // Shy of the lens: drift away if the camera comes closer than a body length.
    const away = this.s.subVectors(this.position, camera.position);
    const shy = away.length() < o.length ? away.setY(0).normalize().multiplyScalar(0.6) : this.s.set(0, 0, 0);

    this.h.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    this.axis.copy(UP).multiplyScalar(Math.cos(TILT)).addScaledVector(this.h, Math.sin(TILT)).normalize();
    const speed = o.cruise * (1 + this.jet * 1.5);
    this.position.addScaledVector(this.axis, speed * dt).addScaledVector(shy, dt);
    this.position.y += Math.sin(time * 0.3) * 0.05 * dt;

    this.x.crossVectors(this.axis, this.h).normalize();
    this.z.crossVectors(this.x, this.axis);
    this.m.makeBasis(this.x, this.axis, this.z);
    this.m.scale(this.s.setScalar(o.length));
    this.m.setPosition(this.position);
    this.mesh.setMatrixAt(0, this.m);
    this.state.setXYZW(0, 1.3, this.jet, 0, 0);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.matrices.interleaved.needsUpdate = true;
    this.state.needsUpdate = true;
  }

  sighting(): SightingSource {
    return {
      species: 'architeuthis-dux',
      nearest: (from, out, accept) => (this.mesh.visible && accept(this.position) ? (out.copy(this.position), this.position.distanceTo(from)) : Infinity),
    };
  }
}
