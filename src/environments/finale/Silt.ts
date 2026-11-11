import { IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { attribute, cameraPosition, dot, float, max, normalWorld, normalize, positionWorld, pow, vec3 } from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';

/** How long a puff lives (s), how far it spreads (m) and how dense it starts. */
const LIFE = 5;
const SPREAD = 1.1;
const DENSITY = 0.3;

/**
 * Silt stirred off the floor by the diver's fins: soft puffs that billow up, spread and settle
 * out of sight. Lit like the haze around them (a little brighter, the fine sediment scatters),
 * plus the torch's warmth where it falls. Each puff is a sphere whose opacity falls toward its
 * rim, so overlapping puffs read as one cloud.
 */
export class Silt {
  readonly mesh: InstancedMesh;
  private readonly pos: Vector3[] = [];
  private readonly vel: Vector3[] = [];
  private readonly age: number[] = [];
  private readonly life: InstancedBufferAttribute;
  private next = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  constructor(u: FrameUniforms, private readonly capacity = 160) {
    const geometry = new IcosahedronGeometry(1, 2);
    this.life = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    geometry.setAttribute('aLife', this.life);
    const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const n: ShaderNode = normalize(normalWorld as ShaderNode);
    const v: ShaderNode = normalize((cameraPosition as ShaderNode).sub(positionWorld));
    const core: ShaderNode = pow(max(dot(n, v), 0), 1.6);
    const life: ShaderNode = attribute('aLife', 'float');
    mat.colorNode = (u.waterColor as ShaderNode).mul(2.4).add(vec3(0.05, 0.045, 0.035).mul(u.torch as ShaderNode).div(u.exposure as ShaderNode));
    mat.opacityNode = core.mul(life).mul(DENSITY);
    this.mesh = new InstancedMesh(geometry, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    for (let i = 0; i < capacity; i++) {
      this.pos.push(new Vector3());
      this.vel.push(new Vector3());
      this.age.push(Infinity);
    }
  }

  /** A puff from the floor at `at`, pushed along `away` (the fins' wash). */
  emit(at: Vector3, away: Vector3): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos[i]!.set(at.x + (Math.random() - 0.5) * 0.4, at.y, at.z + (Math.random() - 0.5) * 0.4);
    this.vel[i]!.set(away.x * 0.25 + (Math.random() - 0.5) * 0.12, 0.12 + Math.random() * 0.1, away.z * 0.25 + (Math.random() - 0.5) * 0.12);
    this.age[i] = 0;
  }

  update(dt: number): void {
    let count = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i]! >= LIFE) continue;
      this.age[i]! += dt;
      const a = this.age[i]! / LIFE;
      const p = this.pos[i]!;
      const v = this.vel[i]!;
      p.addScaledVector(v, dt);
      // The water slows the wash; the finest silt keeps drifting up a little.
      v.multiplyScalar(Math.exp(-dt * 0.9));
      const r = 0.15 + SPREAD * Math.sqrt(a);
      this.s.setScalar(r);
      this.m.compose(p, this.q, this.s);
      this.mesh.setMatrixAt(count, this.m);
      // Builds quickly, then thins as it spreads.
      this.life.setX(count, Math.min(1, a * 8) * (1 - a) ** 1.5);
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.life.needsUpdate = true;
  }
}
