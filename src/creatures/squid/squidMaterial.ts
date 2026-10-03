import { DoubleSide, MeshBasicNodeMaterial, type InstancedBufferAttribute, type InstancedInterleavedBuffer } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  cos,
  dot,
  float,
  fract,
  instancedBufferAttribute,
  instancedDynamicBufferAttribute,
  length,
  mat4,
  max,
  mix,
  normalWorld,
  normalize,
  positionWorld,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';
import type { Rgb } from '../fish/FishMorph';
import { SQUID_PART, headCentre, type SquidShape } from './squidGeometry';

const TAU = Math.PI * 2;
const col = (c: Rgb): ShaderNode => vec3(c.r, c.g, c.b);

/** How a squid species looks: pigment, photophores and eyes. */
export interface SquidLook {
  shape: SquidShape;
  body: Rgb;
  arms: Rgb;
  /** Contrast of the pale seed-like photophores on the skin (0 = none). */
  seeds: number;
  /** Their blue glow in camera-adapted units, from the underside only (0 = none). */
  glow: number;
  /** Eye radii (rad on the head sphere): the left eye and the right eye. */
  leftEye: number;
  rightEye: number;
  /** Skin gloss 0..1 (reflective skin catches the lamp at range). */
  sheen?: number;
  /** Blue light organs at the arm tips, in camera-adapted units (vampire squid). */
  tipGlow?: number;
}

/**
 * A squid's material. Per-instance `state` = (swim phase, jet 0..1, pose 0..1, unused): pose 1 is
 * the vampire squid's "pineapple" defence, arms and web flipped up over the mantle. `matrices`
 * is an interleaved view of the instance matrices (three applies them before positionNode, so
 * the body deforms in its own frame first; see createFishMaterial). Motion is deliberately
 * readable at a distance: a travelling wave along the fins, a breathing mantle that squeezes on
 * each jet, arms that open and close, and long tentacles that trail and curl.
 */
export function createSquidMaterial(u: FrameUniforms, kd: readonly [number, number, number], look: SquidLook, state: InstancedBufferAttribute, matrices: InstancedInterleavedBuffer): MeshBasicNodeMaterial {
  const shape = look.shape;
  const sq: ShaderNode = attribute('aSquid', 'vec4');
  const part: ShaderNode = sq.x;
  const t: ShaderNode = sq.y;
  const angle: ShaderNode = sq.z;
  const inst: ShaderNode = instancedBufferAttribute(state);
  const phase: ShaderNode = inst.x;
  const jet: ShaderNode = inst.y;
  const pose: ShaderNode = inst.z;
  const time: ShaderNode = u.time as ShaderNode;
  const isPart = (id: number): ShaderNode => step(id - 0.5, part).mul(step(part, id + 0.5));
  const isMantle = isPart(SQUID_PART.mantle);
  const isFin = isPart(SQUID_PART.fin);
  const isHead = isPart(SQUID_PART.head);
  const isArm: ShaderNode = max(isPart(SQUID_PART.arm), isPart(SQUID_PART.web));
  const isTentacle = isPart(SQUID_PART.tentacle);

  // --- Motion ---------------------------------------------------------------------------------
  const raw: ShaderNode = attribute('position', 'vec3');
  const breathe: ShaderNode = float(1).add(sin(time.mul(1.6).add(phase)).mul(0.05)).sub(jet.mul(0.2));
  // Arms open and close slowly, and gather into a streamlined bundle on a jet.
  const open: ShaderNode = float(1).add(sin(time.mul(0.7).add(phase)).mul(0.3).mul(t)).mul(float(1).sub(jet.mul(0.6).mul(t)));
  const armSway: ShaderNode = t.pow(1.5).mul(shape.armLength * 0.15);
  const tentacleSway: ShaderNode = t.pow(2).mul(shape.tentacleLength * 0.12);
  const swayPhase: ShaderNode = time.mul(0.8).add(angle.mul(2)).add(phase).sub(t.mul(2));
  const sway: ShaderNode = armSway.mul(isArm).add(tentacleSway.mul(isTentacle)).mul(float(1).sub(jet.mul(0.7)));
  const xzScale: ShaderNode = mix(mix(float(1), breathe, isMantle), open, max(isArm, isTentacle));
  // A wave travels along each fin from its root to its rim.
  const finWave: ShaderNode = sin(time.mul(2.4).add(phase).sub(t.mul(2))).mul(shape.finRadius * 0.6).mul(t).mul(isFin);
  const swum: ShaderNode = vec3(
    raw.x.mul(xzScale).add(sin(swayPhase).mul(sway)),
    raw.y.add(sin(swayPhase.mul(0.6)).mul(sway).mul(0.4)),
    raw.z.mul(xzScale).add(cos(swayPhase.mul(0.8)).mul(sway)).add(finWave),
  );
  // Pineapple posture: arms and web swing up past the head and wrap over the mantle.
  const armTop = headCentre(shape) - shape.headRadius * 0.6;
  const flipped: ShaderNode = vec3(
    swum.x.mul(float(1).add(t.mul(0.6))),
    float(armTop).add(float(armTop).sub(swum.y).mul(0.95)),
    swum.z.mul(float(1).add(t.mul(0.6))),
  );
  const deformed: ShaderNode = mix(swum, flipped, pose.mul(isArm.add(isTentacle).min(1)));

  // --- Colour ---------------------------------------------------------------------------------
  let color: ShaderNode = mix(col(look.body), col(look.arms), max(isArm, isTentacle));
  // Seed-like photophores: sparse rows on mantle, head and arm bases.
  const cellU: ShaderNode = mix(angle.mul(8 / TAU), angle.mul(1.5), isArm);
  const cellV: ShaderNode = mix(t.mul(9), t.mul(6), isArm);
  const cell: ShaderNode = vec2(fract(cellU).sub(0.5), fract(cellV.add(fract(cellU.floor().mul(0.5)))).sub(0.5));
  const onSkin: ShaderNode = max(max(isMantle, isHead), isPart(SQUID_PART.arm).mul(step(t, 0.6)));
  const seeds: ShaderNode = smoothstep(0.2, 0.12, length(cell)).mul(onSkin);
  if (look.seeds > 0) color = mix(color, vec3(0.75, 0.7, 0.72), seeds.mul(look.seeds));
  // Eyes on the head: left (−x) and right (+x), each a silvery iris round a black pupil.
  const toHead: ShaderNode = normalize(raw.sub(vec3(0, headCentre(shape), 0)));
  const leftD: ShaderNode = dot(toHead, normalize(vec3(-1, 0.35, 0.15)));
  const rightD: ShaderNode = dot(toHead, normalize(vec3(1, -0.3, 0.15)));
  const disc = (d: ShaderNode, r: number): ShaderNode => smoothstep(Math.cos(r), Math.cos(r * 0.85), d);
  const eyes: ShaderNode = max(disc(leftD, look.leftEye), disc(rightD, look.rightEye)).mul(isHead);
  const pupil: ShaderNode = max(disc(leftD, look.leftEye * 0.65), disc(rightD, look.rightEye * 0.6)).mul(isHead);
  color = mix(color, vec3(0.6, 0.58, 0.52), eyes);
  color = mix(color, vec3(0.01, 0.01, 0.015), pupil);

  // Light the side the camera sees (see createFishMaterial).
  const n0: ShaderNode = normalize(normalWorld as ShaderNode);
  const normal: ShaderNode = n0.mul(step(0, dot(n0, (cameraPosition as ShaderNode).sub(positionWorld))).mul(2).sub(1));

  // Photophores glow blue from the underside only (they hide the squid's silhouette from below).
  let emissive: ShaderNode | undefined;
  const depth: ShaderNode = max((positionWorld as ShaderNode).y.negate(), 0);
  if (look.tipGlow) {
    // Light organs at each arm tip, pulsing out of step; brighter in the pineapple display.
    const tips: ShaderNode = smoothstep(0.82, 0.95, t).mul(isPart(SQUID_PART.arm));
    const pulse: ShaderNode = sin(time.mul(2.6).add(angle.mul(3)).add(phase)).mul(0.4).add(0.6);
    emissive = vec3(0.08, 0.42, 1.0)
      .mul(tips.mul(pulse).mul(float(1).add(pose.mul(2))))
      .mul(look.tipGlow)
      .div(u.exposure as ShaderNode)
      .mul(smoothstep(200, 400, depth));
  }
  if (look.glow > 0) {
    emissive = vec3(0.3, 0.6, 1.0)
      .mul(seeds)
      .mul(smoothstep(-0.1, -0.7, n0.y))
      .mul(look.glow)
      .div(u.exposure as ShaderNode)
      .mul(smoothstep(200, 400, depth));
  }

  const lit: ShaderNode = underwaterLit(u, kd, {
    albedo: color,
    normal,
    roughness: mix(float(0.4 - (look.sheen ?? 0) * 0.2), float(0.08), eyes),
    specular: float(0.14 + (look.sheen ?? 0) * 0.5).add(eyes.mul(0.8)),
    rim: float(0.35),
    emissive,
  });

  const m = new MeshBasicNodeMaterial({ side: DoubleSide });
  const column = (offset: number): ShaderNode => instancedDynamicBufferAttribute(matrices, 'vec4', 16, offset);
  const instance: ShaderNode = mat4(column(0), column(4), column(8), column(12));
  m.positionNode = instance.mul(vec4(deformed, 1)).xyz;
  m.colorNode = lit;
  return m;
}
