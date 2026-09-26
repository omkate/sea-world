import { DoubleSide, MeshBasicNodeMaterial, type InstancedBufferAttribute } from 'three/webgpu';
import {
  abs,
  attribute,
  cos,
  faceDirection,
  float,
  fract,
  instancedBufferAttribute,
  length,
  max,
  mix,
  normalWorld,
  positionLocal,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
} from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';
import { catmullRom } from '../../core/math/noise';
import { FISH_PART } from './fishGeometry';
import type { FishMorph, FishPattern, Rgb } from './FishMorph';

const col = (c: Rgb): ShaderNode => vec3(c.r, c.g, c.b);

/**
 * Per-instance swim state: x = tail-beat phase (rad), y = amplitude scale, z = turn bend,
 * w = individual variation 0..1. Written by the school simulation every frame.
 */
export function createFishMaterial(
  u: FrameUniforms,
  kd: readonly [number, number, number],
  morph: FishMorph,
  pattern: FishPattern,
  swim: InstancedBufferAttribute,
): MeshBasicNodeMaterial {
  const fish: ShaderNode = attribute('aFish', 'vec4');
  const s: ShaderNode = fish.x;
  const v: ShaderNode = fish.y;
  const part: ShaderNode = fish.z;
  const t: ShaderNode = fish.w;
  const inst: ShaderNode = instancedBufferAttribute(swim);
  const phase: ShaderNode = inst.x;
  const ampScale: ShaderNode = inst.y;
  const bend: ShaderNode = inst.z;
  const variation: ShaderNode = inst.w;

  const isPart = (id: number): ShaderNode => step(id - 0.5, part).mul(step(part, id + 0.5));
  const isFin: ShaderNode = step(0.5, part);

  // --- Swimming: a travelling body wave whose amplitude grows toward the tail -------------
  const tailward: ShaderNode = smoothstep(morph.swim.style === 'labriform' ? 0.35 : 0.15, 1, s);
  const amplitude: ShaderNode = float(morph.swim.bodyWave).mul(float(0.06).add(tailward.mul(tailward).mul(0.94))).mul(ampScale);
  const wave: ShaderNode = sin(phase.sub(s.mul(5.2)));
  const turn: ShaderNode = bend.mul(max(s.sub(0.25), 0).pow(2));
  let lateral: ShaderNode = amplitude.mul(wave).add(turn);
  // Fin membranes ripple a little more than the body they are attached to.
  lateral = lateral.add(isPart(FISH_PART.dorsalAnal).mul(t).mul(0.012).mul(sin(phase.mul(0.7).add(s.mul(9)))));
  lateral = lateral.add(isPart(FISH_PART.caudal).mul(t).mul(0.02).mul(sin(phase.sub(1.2))));
  const local: ShaderNode = positionLocal;
  // Labriform swimmers row with their pectoral fins.
  const pectoralBeat: ShaderNode = isPart(FISH_PART.pectoral).mul(t).mul(0.05).mul(sin(phase.mul(1.4)));
  const deformed: ShaderNode = vec3(
    local.x.add(lateral).add(pectoralBeat.mul(local.x.sign())),
    local.y.add(isPart(FISH_PART.pelvic).mul(t).mul(0.01).mul(sin(phase))),
    local.z,
  );

  // --- Colour pattern ----------------------------------------------------------------------
  let color: ShaderNode = mix(col(pattern.belly), col(pattern.back), smoothstep(pattern.bellyLine - pattern.bellySoftness, pattern.bellyLine + pattern.bellySoftness, v));
  for (const b of pattern.bands) {
    const centre: ShaderNode = float(b.s).add(v.mul(b.slant));
    const d: ShaderNode = abs(s.sub(centre));
    let mask: ShaderNode = smoothstep(b.halfWidth + 0.004, b.halfWidth - 0.002, d);
    if (b.vMin !== undefined) mask = mask.mul(smoothstep(b.vMin - 0.08, b.vMin + 0.04, v));
    if (b.vMax !== undefined) mask = mask.mul(smoothstep(b.vMax + 0.08, b.vMax - 0.04, v));
    if (b.edge) color = mix(color, col(b.edge), smoothstep(b.halfWidth + 0.012, b.halfWidth + 0.004, d).mul(float(1).sub(mask)));
    color = mix(color, col(b.color), mask);
  }
  for (const st of pattern.stripes) {
    const q: ShaderNode = s.mul(Math.cos(st.angle)).add(v.mul(0.2).mul(Math.sin(st.angle)));
    const band: ShaderNode = abs(fract(q.div(st.spacing)).sub(0.5)).mul(st.spacing);
    const region: ShaderNode = smoothstep(st.sMin - 0.02, st.sMin + 0.02, s)
      .mul(smoothstep(st.sMax + 0.02, st.sMax - 0.02, s))
      .mul(smoothstep(st.vMin - 0.1, st.vMin + 0.1, v))
      .mul(smoothstep(st.vMax + 0.1, st.vMax - 0.1, v));
    color = mix(color, col(st.color), smoothstep(st.width, st.width * 0.4, band).mul(region));
  }

  // Fins: species colours, thinning toward translucent edges.
  const finColor: ShaderNode = mix(
    mix(mix(col(pattern.fins.dorsal), col(pattern.fins.anal), step(v, 0)), col(pattern.fins.caudal), isPart(FISH_PART.caudal)),
    col(pattern.fins.pectoral),
    max(isPart(FISH_PART.pectoral), isPart(FISH_PART.pelvic)),
  );
  // Radiating fin rays.
  const rays: ShaderNode = smoothstep(0.35, 0.5, abs(fract(s.mul(90).add(v.mul(6))).sub(0.5))).mul(0.12);
  color = mix(color, finColor.mul(float(1).sub(rays)), isFin);

  // Eye: pupil, iris ring, dark rim; on both flanks at (s, v) = eye position.
  const eyeH = catmullRom(morph.profile.map((p) => [p[0], p[1]] as const), morph.eye.s);
  const eyeD: ShaderNode = length(vec2(s.sub(morph.eye.s), v.sub(morph.eye.v).mul(eyeH))).div(morph.eye.radius);
  const onBody: ShaderNode = float(1).sub(isFin);
  const pupil: ShaderNode = smoothstep(0.56, 0.5, eyeD);
  const iris: ShaderNode = smoothstep(1.02, 0.96, eyeD);
  const rimEye: ShaderNode = smoothstep(1.15, 1.05, eyeD);
  color = mix(color, color.mul(0.35), rimEye.mul(onBody));
  color = mix(color, col(pattern.iris), iris.mul(onBody));
  color = mix(color, vec3(0.005, 0.005, 0.006), pupil.mul(onBody));

  // Scale shimmer and individual variation.
  const scales: ShaderNode = sin(s.mul(160)).mul(cos(v.mul(38).add(s.mul(40))));
  color = color.mul(float(1).add(scales.mul(0.04).mul(onBody))).mul(float(0.9).add(variation.mul(0.2)));

  const normal: ShaderNode = (normalWorld as ShaderNode).mul(faceDirection);
  const glint: ShaderNode = iris.mul(onBody);
  const lit: ShaderNode = underwaterLit(u, kd, {
    albedo: color,
    normal,
    roughness: mix(float(pattern.roughness), float(0.08), glint),
    // Wet scales are glossy but not mirrors: modest specular, a small iridescent boost, eye glint.
    specular: float(0.06).add(float(pattern.sheen).mul(0.18).mul(onBody)).add(glint.mul(0.6)),
    rim: float(0.25).add(isFin.mul(0.15)),
  });

  const m = new MeshBasicNodeMaterial({ side: DoubleSide });
  m.positionNode = deformed;
  m.colorNode = lit;
  return m;
}
