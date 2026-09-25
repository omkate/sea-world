import { AdditiveBlending, InstancedBufferAttribute, Scene, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import {
  clamp,
  cos,
  dot,
  exp,
  float,
  fract,
  instancedBufferAttribute,
  length,
  max,
  mix,
  mod,
  normalize,
  pow,
  sin,
  smoothstep,
  step,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { Wave } from '../../ocean/surface/waves';
import { createRng } from '../../core/math/rng';
import { ABSORPTION, SCATTER } from '../../ocean/medium/optics';
import { CAUSTIC_MEAN, CAUSTIC_TILE, caustic } from '../../shaders/tsl/caustics';

/** Side of the camera-relative wrap volume (m). Small enough that particles fill the frame. */
const VOLUME = 16;
/** Sprites never shrink below this many pixels; their alpha drops instead (energy preserving). */
const MIN_PIXELS = 2;
/** Radiance of the dive lamp at 1 m, scene-linear. */
export const LAMP_RADIANCE = 1.8;
/**
 * Particles are lit by the whole downwelling hemisphere and scatter strongly forward, so they
 * read brighter than the water behind them (background ≈ in-scatter radiance only).
 */
const PARTICLE_GAIN = 3.2;
/** Fraction of particles that are (unidentified) bioluminescent plankton. */
const BIOLUMINESCENT_FRACTION = 0.0015;
/** Flash brightness in camera-adapted units: visible to a low-light camera, lost under the lamp. */
const FLASH_ADAPTED = 2.2;

/**
 * Suspended organic particles: plankton, detritus and marine snow, in a camera-relative
 * wrapping volume. Lit by downwelling sunlight (with caustic sparkle near the surface) and, in
 * the deep, by the camera lamp. A tiny fraction flash blue-green like bioluminescent plankton.
 * Sinking is time-compressed for visibility (real marine snow: ~1–100 m/day).
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
    const inst: ShaderNode = instancedBufferAttribute(new InstancedBufferAttribute(data, 4));
    const base: ShaderNode = inst.xyz;
    const seedN: ShaderNode = inst.w;
    const t: ShaderNode = u.time;

    const sink: ShaderNode = mix(float(0.002), float(0.018), seedN.mul(seedN));
    const wander: ShaderNode = vec3(sin(t.mul(0.07).add(seedN.mul(40))), sin(t.mul(0.043).add(seedN.mul(71))).mul(0.3), cos(t.mul(0.05).add(seedN.mul(23)))).mul(0.18);
    const current: ShaderNode = vec3(0.03, 0, 0.012).mul(t);
    const drift: ShaderNode = wander.add(current).sub(vec3(0, sink.mul(t), 0));

    const half = VOLUME / 2;
    const local: ShaderNode = mod(base.add(drift).sub(u.cameraPos).add(half), VOLUME).sub(half);
    let world: ShaderNode = u.cameraPos.add(local);
    world = world.add(orbitalSurge(swell, world, t));

    const toCam: ShaderNode = world.sub(u.cameraPos);
    const dist: ShaderNode = length(toCam);
    const z: ShaderNode = max(world.y.negate(), 0);

    const edge = float(1).sub(smoothstep(half * 0.55, half * 0.95, dist));
    const bokeh = smoothstep(0.1, 0.55, dist);
    // Independent of size: gating on the raw seed would cull every large flake first.
    const gate = step(fract(seedN.mul(7.137).add(0.31)), u.particleDensity);
    const belowSurface = smoothstep(-0.05, -0.6, world.y);

    // Sizes: mostly sub-millimetre to few-millimetre flecks, a few centimetre-scale snow flakes.
    const s3 = seedN.mul(seedN).mul(seedN);
    // Below the productive layer most particles are marine-snow aggregates, which are larger.
    const aggregate: ShaderNode = float(1).add(smoothstep(150, 1500, z).mul(1.6));
    const size: ShaderNode = mix(float(0.001), float(0.009), s3).add(step(0.985, seedN).mul(0.012)).mul(aggregate);
    const defocus = float(1).add(float(1).sub(smoothstep(0.15, 1.2, dist)).mul(3));
    const wanted: ShaderNode = size.mul(defocus);
    const minSize: ShaderNode = dist.mul(MIN_PIXELS).div(u.pixelsPerMetre);
    const drawn: ShaderNode = max(wanted, minSize);
    const coverage = pow(wanted.div(drawn), 1.1);

    const sigma = vec3(ABSORPTION[0] + SCATTER[0], ABSORPTION[1] + SCATTER[1], ABSORPTION[2] + SCATTER[2]);
    const transmittance: ShaderNode = exp(sigma.mul(dist).negate());

    // Sunlight, focused into moving caustic filaments near the surface.
    const toSun: ShaderNode = u.sunDirWater.negate();
    const entry: ShaderNode = world.xz.add(toSun.xz.mul(z.div(max(toSun.y, 0.2))));
    const sparkle: ShaderNode = caustic(entry.div(CAUSTIC_TILE), t.mul(0.55)).div(CAUSTIC_MEAN);
    const causticWeight = exp(z.div(-12)).mul(0.7);
    const sunLit: ShaderNode = u.ambientWater.mul(PARTICLE_GAIN).mul(mix(float(1), sparkle, causticWeight));

    // Camera lamp: inverse-square falloff inside a soft cone, extinguished along the path.
    const forward: ShaderNode = normalize(u.cameraWorld.mul(vec4(0, 0, -1, 0)).xyz);
    const cone = smoothstep(0.55, 0.9, dot(normalize(toCam), forward));
    const lampLit: ShaderNode = vec3(1.0, 0.95, 0.86)
      .mul(LAMP_RADIANCE)
      .mul(cone)
      .mul(exp(sigma.mul(dist).negate()))
      .div(dist.mul(dist).add(0.3))
      .mul(u.diveLight);

    const brightness = mix(float(0.5), float(1.4), fract(seedN.mul(173.1)));
    const reflected: ShaderNode = sunLit.add(lampLit).mul(brightness).mul(transmittance);

    // Rare flashes: ~0.6 s pulses every 20–60 s, blue-green (~480 nm).
    const isEmitter = step(1 - BIOLUMINESCENT_FRACTION, fract(seedN.mul(9173.3)));
    const period = mix(float(20), float(60), fract(seedN.mul(311.7)));
    const phase = fract(t.div(period).add(seedN.mul(97)));
    const window = float(0.6).div(period);
    const pulse = smoothstep(0, window.mul(0.15), phase).mul(smoothstep(window, window.mul(0.3), phase));
    const flash: ShaderNode = vec3(0.02, 0.55, 1.0)
      .mul(FLASH_ADAPTED)
      .div(u.exposure)
      .mul(pulse)
      .mul(isEmitter)
      .mul(u.bioluminescence)
      .mul(transmittance);

    const disc = smoothstep(0.5, 0.12, length((uv() as ShaderNode).sub(0.5)));
    const opacity = disc.mul(edge).mul(bokeh).mul(gate).mul(belowSurface).mul(coverage).mul(0.8);

    const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    material.positionNode = world;
    material.scaleNode = mix(drawn, max(drawn, float(0.025)), isEmitter.mul(u.bioluminescence));
    material.colorNode = clamp(reflected.add(flash), 0, 1e4);
    material.opacityNode = opacity;

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
