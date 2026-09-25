import { AdditiveBlending, InstancedBufferAttribute, Scene, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import {
  cos,
  exp,
  float,
  instancedBufferAttribute,
  length,
  max,
  mix,
  mod,
  sin,
  smoothstep,
  step,
  uv,
  vec3,
} from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { Wave } from '../../ocean/surface/waves';
import { createRng } from '../../core/math/rng';
import { ABSORPTION, SCATTER } from '../../ocean/medium/optics';

const VOLUME = 26;

/**
 * Suspended organic particles (plankton, detritus, early marine snow) in a camera-relative
 * wrapping volume. Sinking speeds are time-compressed for visibility; real marine snow sinks
 * ~1–100 m/day (documented in docs/architecture.md § Approximations).
 */
export class SuspendedParticles {
  readonly scene = new Scene();
  readonly sprite: Sprite;

  constructor(u: FrameUniforms, count: number, swell: readonly Wave[], seed = 7) {
    const rng = createRng(seed);
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      data[i * 4] = rng() * VOLUME;
      data[i * 4 + 1] = rng() * VOLUME;
      data[i * 4 + 2] = rng() * VOLUME;
      data[i * 4 + 3] = rng();
    }
    const attr = new InstancedBufferAttribute(data, 4);
    const inst: ShaderNode = instancedBufferAttribute(attr);
    const base = inst.xyz;
    const seedN = inst.w;
    const t: ShaderNode = u.time;

    const sink: ShaderNode = mix(float(0.003), float(0.022), seedN.mul(seedN));
    const wander: ShaderNode = vec3(sin(t.mul(0.07).add(seedN.mul(40))), float(0), cos(t.mul(0.05).add(seedN.mul(23)))).mul(0.22);
    const current: ShaderNode = vec3(0.035, 0, 0.012).mul(t);
    const drift = wander.add(current).sub(vec3(0, sink.mul(t), 0));

    const half = VOLUME / 2;
    const local = mod(base.add(drift).sub(u.cameraPos).add(half), VOLUME).sub(half);
    let world: ShaderNode = u.cameraPos.add(local);
    world = world.add(orbitalSurge(swell, world, t));

    const toCam = world.sub(u.cameraPos);
    const dist: ShaderNode = length(toCam);
    const edge = float(1).sub(smoothstep(half * 0.62, half * 0.98, dist));
    const bokeh = smoothstep(0.12, 0.8, dist);
    const gate = step(seedN, u.particleDensity);
    const belowSurface = smoothstep(-0.05, -0.6, world.y);

    const sizeBase = mix(float(0.0025), float(0.011), seedN.mul(seedN).mul(seedN));
    const defocus = float(1).add(float(1).sub(smoothstep(0.2, 1.4, dist)).mul(2.5));

    const disc = smoothstep(0.5, 0.18, length((uv() as ShaderNode).sub(0.5)));
    const sigma: ShaderNode = vec3(ABSORPTION[0] + SCATTER[0], ABSORPTION[1] + SCATTER[1], ABSORPTION[2] + SCATTER[2]);
    const transmittance: ShaderNode = exp(sigma.mul(dist).negate());
    const tMean = transmittance.x.add(transmittance.y).add(transmittance.z).div(3);
    const brightness = mix(float(0.55), float(1.5), seedN);

    const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    material.positionNode = world;
    material.scaleNode = sizeBase.mul(defocus);
    material.colorNode = u.ambientWater.mul(brightness).mul(transmittance).div(max(tMean, 0.0001));
    material.opacityNode = disc.mul(edge).mul(bokeh).mul(gate).mul(belowSurface).mul(tMean).mul(0.65);

    this.sprite = new Sprite(material);
    this.sprite.count = count;
    this.sprite.frustumCulled = false;
    this.scene.add(this.sprite);
  }

  setCount(count: number): void {
    this.sprite.count = count;
  }
}

/** Wave orbital motion: particles near the surface sway with the swell, decaying as e^(−kz). */
function orbitalSurge(swell: readonly Wave[], p: ShaderNode, t: ShaderNode): ShaderNode {
  let offset: ShaderNode = vec3(0, 0, 0);
  for (const w of swell.slice(0, 3)) {
    const theta = p.x.mul(w.dirX).add(p.z.mul(w.dirZ)).mul(w.k).sub(t.mul(w.omega)).add(w.phase);
    const decay = exp(max(p.y, -60).mul(w.k)).mul(w.amplitude);
    offset = offset.add(vec3(cos(theta).mul(w.dirX), sin(theta), cos(theta).mul(w.dirZ)).mul(decay));
  }
  return offset;
}
