import { DoubleSide, MeshBasicNodeMaterial, type InstancedBufferAttribute } from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  cos,
  dot,
  faceDirection,
  float,
  fract,
  instancedBufferAttribute,
  length,
  mix,
  normalize,
  normalWorld,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
} from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';
import { JELLY_PART } from './jellyGeometry';

const TAU = Math.PI * 2;

/** One bell beat: a quick contraction (~25% of the cycle) then a slower relaxation. */
const beat = (cycle: ShaderNode): ShaderNode => smoothstep(0, 0.22, cycle).mul(smoothstep(0.75, 0.3, cycle));

/**
 * Crown jellyfish. Per-instance `pulse` = (phase 0..1, beat rate Hz, sway seed, size m): the
 * bell margin squeezes inward and the bell grows taller on each beat; arms and filaments
 * follow with a lag down their length and sway in the current. Translucent: thin face-on,
 * denser at grazing angles, as gelatinous tissue reads underwater.
 */
export function createJellyMaterial(u: FrameUniforms, kd: readonly [number, number, number], pulse: InstancedBufferAttribute): MeshBasicNodeMaterial {
  const jelly: ShaderNode = attribute('aJelly', 'vec4');
  const part: ShaderNode = jelly.x;
  const t: ShaderNode = jelly.y;
  const angle: ShaderNode = jelly.z;
  const seed: ShaderNode = jelly.w;
  const inst: ShaderNode = instancedBufferAttribute(pulse);
  const time: ShaderNode = u.time as ShaderNode;

  const isPart = (id: number): ShaderNode => step(id - 0.5, part).mul(step(part, id + 0.5));
  const isBell: ShaderNode = isPart(JELLY_PART.bell);
  const isStrand: ShaderNode = float(1).sub(isBell);

  // --- Pulse and sway ------------------------------------------------------------------------
  const cycle: ShaderNode = fract(time.mul(inst.y).add(inst.x));
  const c: ShaderNode = beat(cycle);
  // Strands feel each beat later the further they are from the bell.
  const cLag: ShaderNode = beat(fract(cycle.sub(t.mul(0.18))));
  // three applies the instance matrix before positionNode, so deform the raw geometry and add
  // the offset scaled by the jelly's size (bells stay within ~10° of upright).
  const local: ShaderNode = attribute('position', 'vec3');
  const squeeze: ShaderNode = mix(
    float(1).sub(c.mul(0.16).mul(t.pow(1.5))),
    float(1).sub(cLag.mul(0.1)),
    isStrand,
  );
  const sway: ShaderNode = t.pow(1.5).mul(mix(float(0.05), float(0.12), isPart(JELLY_PART.filament)));
  const swayPhase: ShaderNode = time.mul(0.7).add(seed.mul(20)).add(inst.z.mul(TAU)).sub(t.mul(3));
  const deformed: ShaderNode = vec3(
    local.x.mul(squeeze).add(sin(swayPhase).mul(sway).mul(isStrand)),
    local.y.add(c.mul(0.05).mul(t).mul(isBell)).add(cLag.mul(0.04).mul(isStrand)),
    local.z.mul(squeeze).add(cos(swayPhase.mul(0.8)).mul(sway).mul(isStrand)),
  );

  // --- Colour ---------------------------------------------------------------------------------
  // Violet-brown bell, paler toward the thin margin, with a darker rim band.
  let bell: ShaderNode = mix(vec3(0.42, 0.18, 0.52), vec3(0.55, 0.42, 0.78), smoothstep(0.3, 0.95, t));
  bell = mix(bell, vec3(0.3, 0.1, 0.42), smoothstep(0.82, 0.9, t).mul(smoothstep(1.0, 0.94, t)));
  // Radial canals.
  const canal: ShaderNode = smoothstep(0.06, 0.0, abs(fract(angle.mul(16 / TAU)).sub(0.5)).sub(0.44));
  bell = mix(bell, vec3(0.28, 0.12, 0.38), canal.mul(smoothstep(0.35, 0.5, t)).mul(0.6));
  // Pale wart-like knobs over the crown.
  const knobCell: ShaderNode = vec2(fract(angle.mul(14 / TAU)).sub(0.5), fract(t.mul(9)).sub(0.5));
  const knob: ShaderNode = smoothstep(0.32, 0.18, length(knobCell)).mul(smoothstep(0.42, 0.3, t));
  bell = mix(bell, vec3(0.92, 0.86, 0.95), knob);
  // Arms: lilac frills with violet tips; filaments nearly white.
  const arm: ShaderNode = mix(vec3(0.82, 0.7, 0.92), vec3(0.5, 0.25, 0.65), smoothstep(0.5, 1, t));
  const frill: ShaderNode = smoothstep(0.3, 0.5, abs(fract(t.mul(14)).sub(0.5)));
  const armColor: ShaderNode = mix(arm, arm.mul(0.75), frill);
  const color: ShaderNode = mix(mix(bell, armColor, isPart(JELLY_PART.arm)), vec3(0.9, 0.88, 0.95), isPart(JELLY_PART.filament));

  const normal: ShaderNode = (normalWorld as ShaderNode).mul(faceDirection);
  const lit: ShaderNode = underwaterLit(u, kd, {
    albedo: color,
    normal,
    roughness: float(0.25),
    specular: float(0.25),
    rim: float(0.8),
    subject: float(1),
  });

  // --- Translucency ---------------------------------------------------------------------------
  const view: ShaderNode = normalize((cameraPosition as ShaderNode).sub(positionWorld));
  const grazing: ShaderNode = float(1).sub(abs(dot(normalize(normal), view)));
  const bellAlpha: ShaderNode = mix(float(0.4), float(0.9), grazing.pow(1.5)).add(knob.mul(0.3));
  const strandAlpha: ShaderNode = mix(float(0.75), float(0.5), isPart(JELLY_PART.filament)).mul(smoothstep(1, 0.7, t));

  // Opaque, so the medium pass fogs the jelly at its own distance. Blending toward the open
  // water's radiance gives the same result as true alpha over open water (T·(αC + (1−α)L∞)
  // + (1−T)·L∞ = α·T·C + (1 − α·T)·L∞) without sorting, and keeps depth for the medium.
  const alpha: ShaderNode = mix(bellAlpha, strandAlpha, isStrand).clamp(0, 1);
  const m = new MeshBasicNodeMaterial({ side: DoubleSide });
  m.positionNode = (positionLocal as ShaderNode).add(deformed.sub(local).mul(inst.w));
  m.colorNode = mix(u.waterColor as ShaderNode, lit, alpha);
  return m;
}
