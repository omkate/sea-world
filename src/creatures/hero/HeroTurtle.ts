import { DoubleSide, Matrix4, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu';
import { Wanderer } from './Wanderer';
import { abs, cos, float, max, normalWorld, positionLocal, sin, smoothstep, texture, uniform, uv, vec3 } from 'three/tsl';
import type { ShaderNode, Uniform } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { ScanAsset } from '../../assets/AssetLibrary';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';
import { reefFloorY } from '../../environments/reef/ReefSite';

/** Green turtles cruise at roughly 0.3–0.6 m/s with a slow, deep flipper stroke. */
const CRUISE = 0.42;
const STROKE_HZ = 0.35;

/**
 * A single hero animal: the scanned green turtle, wandering slowly above the slope.
 * Flippers are animated in the vertex shader (the model has no skeleton): vertices far from
 * the midline rotate about the body's long axis, front flippers with a deeper stroke.
 */
export class HeroTurtle {
  readonly mesh: Mesh;
  private readonly phase: Uniform<number>;
  readonly motion: Wanderer;

  constructor(u: FrameUniforms, kd: readonly [number, number, number], asset: ScanAsset, near: Vector3, neighbours: Wanderer[], seed = 71) {
    this.motion = new Wanderer({ home: near, radius: 9, yMin: 0.8, yMax: 3, floor: reefFloorY, cruise: CRUISE, maxTurn: 0.35, maxPitch: 0.25, seed, neighbours, space: 1.2 });
    this.phase = uniform(0) as Uniform<number>;
    // The scanned model's head points along −z; turn it to face +z (the direction of travel).
    const g = asset.geometry.clone();
    g.applyMatrix4(new Matrix4().makeRotationY(Math.PI));
    g.computeBoundingBox();
    const half = Math.max(g.boundingBox!.max.x, -g.boundingBox!.min.x);
    const length = g.boundingBox!.max.z - g.boundingBox!.min.z;

    const p: ShaderNode = positionLocal;
    // Distance from the midline, 0 on the shell spine → 1 at flipper tips.
    const lateral: ShaderNode = smoothstep(half * 0.32, half, abs(p.x));
    const front: ShaderNode = smoothstep(-length * 0.05, length * 0.2, p.z);
    const stroke: ShaderNode = sin(this.phase).mul(float(0.25).add(front.mul(0.45))).mul(lateral);
    const pivotX: ShaderNode = p.x.sign().mul(half * 0.3);
    const rx: ShaderNode = p.x.sub(pivotX);
    const angle: ShaderNode = stroke.mul(p.x.sign());
    const bent: ShaderNode = vec3(pivotX.add(rx.mul(cos(angle))).sub(p.y.mul(sin(angle)).mul(lateral)), p.y.add(rx.mul(sin(angle))), p.z.add(max(front, 0).mul(lateral).mul(cos(this.phase)).mul(length * 0.04)));

    const m = new MeshBasicNodeMaterial({ side: DoubleSide });
    m.positionNode = bent;
    const albedo: ShaderNode = asset.map ? (texture(asset.map, uv()) as ShaderNode).rgb : vec3(0.35, 0.3, 0.2);
    m.colorNode = underwaterLit(u, kd, { albedo, normal: normalWorld, roughness: float(0.5), specular: float(0.2), rim: float(0.35) });
    this.mesh = new Mesh(g, m);
    this.mesh.name = 'chelonia-mydas';
    this.mesh.frustumCulled = false;
    this.sync();
  }

  update(dt: number, time: number): void {
    this.motion.update(dt);
    this.phase.value = time * STROKE_HZ * Math.PI * 2;
    this.sync();
  }

  private sync(): void {
    this.mesh.position.copy(this.motion.position);
    this.mesh.quaternion.copy(this.motion.quaternion);
  }
}
