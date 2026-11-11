import { AdditiveBlending, DoubleSide, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3, type Texture } from 'three/webgpu';
import {
  attribute, cameraPosition, cameraViewMatrix, dot, float, max, mix, mx_noise_float, normalMap, normalWorld, normalize, positionWorld, smoothstep, step, texture, uv, vec3, vec4,
} from 'three/tsl';
import type { ShaderNode, Uniform } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';

/**
 * The finale's transformation, done as films do it: one front of light sweeps down from the crown
 * to the feet. Above it the diver has burned away in golden embers and the king of the sea has
 * formed in his place (a separate, rigged character, upright where the diver hung upright), so
 * the two never show at once in the same place. Each model's front runs along its own bind-pose
 * height (`position.y`), so it follows the body however it is posed.
 */
export interface KingUniforms {
  /** 0 = diver, 1 = the king (the sweep's progress from head to feet). */
  sweep: Uniform<number>;
}

/** A model's bind-pose height range: its top and bottom, and the width of the glowing front. */
export interface SweepRange {
  top: number;
  bottom: number;
  front: number;
}
/** The scuba diver rig (model units ≈ cm, fins at 0, top of the head at ~198). */
export const DIVER_RANGE: SweepRange = { top: 200, bottom: -4, front: 14 };
/** The king rig (≈ metres, feet at −1.02, the top of the plume at 0.98). */
export const KING_RANGE: SweepRange = { top: 1, bottom: -1.05, front: 0.14 };

function frontY(k: KingUniforms, r: SweepRange): ShaderNode {
  return mix(float(r.top + r.front), float(r.bottom - r.front), k.sweep as ShaderNode);
}

/** A ragged front: noise in bind space, a few fronts wide. */
function ragged(r: SweepRange): ShaderNode {
  const bind: ShaderNode = attribute('position', 'vec3');
  return bind.y.add(mx_noise_float(bind.mul(12 / (r.top - r.bottom))).mul(r.front * 1.3));
}

/** The diver and his gear burn away behind the sweep: everything above the ragged front is gone, its edge glowing like embers. */
export function burnAway(u: FrameUniforms, material: MeshBasicNodeMaterial, k: KingUniforms, r: SweepRange): MeshBasicNodeMaterial {
  const y = ragged(r);
  const front = frontY(k, r);
  const keep: ShaderNode = step(y, front);
  const ember: ShaderNode = float(1).sub(smoothstep(0, r.front * 0.6, front.sub(y))).mul(keep).mul(step(0.001, k.sweep as ShaderNode));
  material.colorNode = (material.colorNode as ShaderNode).add(vec3(1, 0.62, 0.22).mul(ember).mul(2.2).div(u.exposure as ShaderNode));
  material.opacityNode = keep;
  material.alphaTestNode = float(0.5);
  return material;
}

/** The king forms behind the sweep: everything above the ragged front is there, its newest edge glowing gold. */
export function formIn(u: FrameUniforms, material: MeshBasicNodeMaterial, k: KingUniforms, r: SweepRange): MeshBasicNodeMaterial {
  const y = ragged(r);
  const front = frontY(k, r);
  const formed: ShaderNode = step(front, y);
  const glow: ShaderNode = float(1).sub(smoothstep(0, r.front * 0.8, y.sub(front))).mul(formed).mul(step(k.sweep as ShaderNode, 0.999));
  material.colorNode = (material.colorNode as ShaderNode).add(vec3(1, 0.8, 0.45).mul(glow).mul(2).div(u.exposure as ShaderNode));
  material.opacityNode = formed;
  material.alphaTestNode = float(0.5);
  return material;
}

type Src = { color?: { r: number; g: number; b: number }; map?: Texture | null; normalMap?: Texture | null };

/**
 * The king's own materials, lit like the diver (hero rig in the deep, torch and crown light), with
 * his red cloth and plume dyed the colours of the sea: red becomes deep blue to sea-green by its
 * own shading; gold, steel and skin are left as they are.
 */
export function kingMaterial(u: FrameUniforms, kd: readonly [number, number, number], src: Src): MeshBasicNodeMaterial {
  let tex: ShaderNode = src.color ? vec3(src.color.r, src.color.g, src.color.b) : vec3(1, 1, 1);
  if (src.map) tex = tex.mul((texture(src.map, uv()) as ShaderNode).rgb);
  const lum: ShaderNode = dot(tex, vec3(0.3, 0.59, 0.11));
  // Red by hue, not by amount: the cape is a dark maroon, which in linear light is barely above zero.
  const red: ShaderNode = smoothstep(0.45, 0.7, tex.r.sub(max(tex.g, tex.b)).div(max(tex.r, 0.004)));
  const sea: ShaderNode = mix(vec3(0.01, 0.05, 0.14), vec3(0.03, 0.36, 0.4), smoothstep(0.05, 0.45, lum));
  const albedo: ShaderNode = mix(tex, sea, red);
  let n0: ShaderNode = normalize(normalWorld as ShaderNode);
  if (src.normalMap) n0 = normalize(vec4(normalMap(texture(src.normalMap, uv())) as ShaderNode, 0).mul(cameraViewMatrix).xyz);
  const normal: ShaderNode = n0.mul(step(0, dot(n0, (cameraPosition as ShaderNode).sub(positionWorld))).mul(2).sub(1));
  // Gold and steel are polished; cloth and skin are not.
  const metal: ShaderNode = smoothstep(0.25, 0.55, lum).mul(float(1).sub(red));
  const m = new MeshBasicNodeMaterial({ side: DoubleSide });
  m.colorNode = underwaterLit(u, kd, {
    albedo,
    normal,
    roughness: mix(float(0.6), float(0.28), metal),
    specular: mix(float(0.25), float(0.95), metal),
    rim: float(0.4),
    hero: smoothstep(60, 220, u.cameraDepth as ShaderNode).mul(0.6),
    torch: true,
  });
  return m;
}

/** Golden embers shed by the sweep: small sparks that drift up and out and fade. */
export class Embers {
  readonly mesh: InstancedMesh;
  private readonly pos: Vector3[] = [];
  private readonly vel: Vector3[] = [];
  private readonly age: number[] = [];
  private readonly life: InstancedBufferAttribute;
  private next = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  constructor(u: FrameUniforms, private readonly capacity = 260) {
    const g = new IcosahedronGeometry(1, 1);
    this.life = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    g.setAttribute('aLife', this.life);
    const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    const n: ShaderNode = normalize(normalWorld as ShaderNode);
    const v: ShaderNode = normalize((cameraPosition as ShaderNode).sub(positionWorld));
    const core: ShaderNode = max(dot(n, v), 0).pow(2);
    mat.colorNode = vec3(1, 0.75, 0.35).mul(core).mul(attribute('aLife', 'float')).mul(2.5).div(u.exposure as ShaderNode);
    this.mesh = new InstancedMesh(g, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < capacity; i++) {
      this.pos.push(new Vector3());
      this.vel.push(new Vector3());
      this.age.push(Infinity);
    }
  }

  emit(at: Vector3, spread: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos[i]!.set(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread);
    this.vel[i]!.set((Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.35, (Math.random() - 0.5) * 0.5);
    this.age[i] = 0;
  }

  update(dt: number): void {
    let count = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i]! >= 1.8) continue;
      this.age[i]! += dt;
      const a = this.age[i]! / 1.8;
      this.pos[i]!.addScaledVector(this.vel[i]!, dt);
      this.vel[i]!.multiplyScalar(Math.exp(-dt * 1.2));
      this.s.setScalar(0.012 + 0.01 * (1 - a));
      this.m.compose(this.pos[i]!, this.q, this.s);
      this.mesh.setMatrixAt(count, this.m);
      this.life.setX(count, (1 - a) ** 1.4);
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.life.needsUpdate = true;
  }
}
