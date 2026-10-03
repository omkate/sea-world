import { DoubleSide, MeshBasicNodeMaterial, type InstancedBufferAttribute, type InstancedInterleavedBuffer } from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  cos,
  dot,
  float,
  fract,
  instancedBufferAttribute,
  instancedDynamicBufferAttribute,
  mat4,
  max,
  mix,
  normalWorld,
  normalize,
  positionWorld,
  sin,
  smoothstep,
  step,
  vec3,
  vec4,
} from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';
import { ATOLLA_PART } from './atollaGeometry';

const TAU = Math.PI * 2;
/** Peak brightness of the alarm display in camera-adapted units (plankton flashes peak at 2.2). */
const ALARM_ADAPTED = 1.2;

/**
 * Atolla wyvillei. Per-instance `state` = (swim phase, alarm 0..1, unused, unused). The bell
 * pulses; the short tentacles sway and the long one trails. The alarm ("burglar alarm") display:
 * spiral arms of blue light sweep round the coronal ring and margin, thought to summon larger
 * predators to whatever is attacking the jelly.
 */
export function createAtollaMaterial(u: FrameUniforms, kd: readonly [number, number, number], state: InstancedBufferAttribute, matrices: InstancedInterleavedBuffer): MeshBasicNodeMaterial {
  const a: ShaderNode = attribute('aAtolla', 'vec4');
  const part: ShaderNode = a.x;
  const t: ShaderNode = a.y;
  const angle: ShaderNode = a.z;
  const inst: ShaderNode = instancedBufferAttribute(state);
  const phase: ShaderNode = inst.x;
  const alarm: ShaderNode = inst.y;
  const time: ShaderNode = u.time as ShaderNode;
  const isPart = (id: number): ShaderNode => step(id - 0.5, part).mul(step(part, id + 0.5));
  const isBell = isPart(ATOLLA_PART.bell);
  const isLong = isPart(ATOLLA_PART.longTentacle);
  const isShort = isPart(ATOLLA_PART.tentacle);

  // --- Motion: bell beats (quick contraction, slow relaxation); tentacles sway ----------------
  const cycle: ShaderNode = fract(time.mul(0.55).add(phase));
  const beat: ShaderNode = smoothstep(0, 0.2, cycle).mul(smoothstep(0.75, 0.3, cycle));
  const raw: ShaderNode = attribute('position', 'vec3');
  const squeeze: ShaderNode = float(1).sub(beat.mul(0.14).mul(t.pow(1.5)).mul(isBell)).sub(beat.mul(0.08).mul(isShort));
  const swayAmp: ShaderNode = t.pow(1.5).mul(mix(float(0.04), float(0.25), isLong)).mul(float(1).sub(isBell));
  const swayPhase: ShaderNode = time.mul(0.7).add(phase).add(angle.mul(3)).sub(t.mul(4));
  const deformed: ShaderNode = vec3(
    raw.x.mul(squeeze).add(sin(swayPhase).mul(swayAmp)),
    raw.y.add(beat.mul(0.03).mul(isBell)),
    raw.z.mul(squeeze).add(cos(swayPhase.mul(0.8)).mul(swayAmp)),
  );

  // --- Colour: deep red; the dome a little lighter, the groove darker ---------------------------
  let color: ShaderNode = mix(vec3(0.62, 0.07, 0.06), vec3(0.42, 0.02, 0.03), smoothstep(0.45, 0.65, t));
  color = mix(color, vec3(0.25, 0.01, 0.02), smoothstep(0.08, 0.0, abs(t.sub(0.6))).mul(isBell));
  color = mix(color, vec3(0.5, 0.05, 0.05), float(1).sub(isBell));

  // --- The alarm display: three spiral arms of blue light sweeping round the ring --------------
  const ring: ShaderNode = smoothstep(0.5, 0.6, t).mul(smoothstep(1.0, 0.85, t)).mul(isBell);
  const sweep: ShaderNode = fract(angle.div(TAU).mul(3).sub(time.mul(1.4)).add(t.mul(0.9)));
  const arms: ShaderNode = smoothstep(0.0, 0.08, sweep).mul(smoothstep(0.35, 0.08, sweep));
  const flicker: ShaderNode = sin(time.mul(23).add(angle.mul(17))).mul(0.25).add(0.75);
  const depth: ShaderNode = max((positionWorld as ShaderNode).y.negate(), 0);
  const glow: ShaderNode = vec3(0.05, 0.35, 1.0)
    .mul(ring.mul(arms).mul(flicker).mul(alarm))
    .mul(ALARM_ADAPTED)
    .div(u.exposure as ShaderNode)
    .mul(smoothstep(200, 400, depth));

  // Light the side the camera sees (see createFishMaterial).
  const n0: ShaderNode = normalize(normalWorld as ShaderNode);
  const normal: ShaderNode = n0.mul(step(0, dot(n0, (cameraPosition as ShaderNode).sub(positionWorld))).mul(2).sub(1));
  const lit: ShaderNode = underwaterLit(u, kd, { albedo: color, normal, roughness: float(0.3), specular: float(0.3), rim: float(0.4), emissive: glow });

  const m = new MeshBasicNodeMaterial({ side: DoubleSide });
  const column = (offset: number): ShaderNode => instancedDynamicBufferAttribute(matrices, 'vec4', 16, offset);
  const instance: ShaderNode = mat4(column(0), column(4), column(8), column(12));
  m.positionNode = instance.mul(vec4(deformed, 1)).xyz;
  m.colorNode = lit;
  return m;
}
