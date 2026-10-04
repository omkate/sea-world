import { DoubleSide, MeshBasicNodeMaterial, type InstancedBufferAttribute, type InstancedInterleavedBuffer } from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  cos,
  dot,
  float,
  floor,
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
  vec4,
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
import type { FishMorph, FishPattern, FishPhotophores, Rgb } from './FishMorph';

const col = (c: Rgb): ShaderNode => vec3(c.r, c.g, c.b);

/** Photophore glow in camera-adapted units (the plankton flashes use 2.2 at their peak). */
const PHOTOPHORE_ADAPTED = 2.6;

/**
 * Light organs on the flank: rows of dots that glow steadily (camera-adapted, from ~200 m where
 * the eye can see them against the water), optional signalling flashes, and an optional ventral
 * glow matched to the downwelling light (counterillumination).
 */
function photophoreGlow(
  u: FrameUniforms,
  kd: readonly [number, number, number],
  p: FishPhotophores,
  s: ShaderNode,
  v: ShaderNode,
  onBody: ShaderNode,
  variation: ShaderNode,
): ShaderNode {
  let colored: ShaderNode = vec3(0);
  for (const row of p.rows) {
    const span = row.sMax - row.sMin;
    // Organ centres sit evenly along the row; v is stretched ~4× relative to s on a fish flank.
    const t: ShaderNode = s.sub(row.sMin).div(span).mul(row.count);
    const inRow: ShaderNode = step(0, t).mul(step(t, row.count));
    const d: ShaderNode = length(vec2(fract(t).sub(0.5).mul(span / row.count), v.sub(row.v).div(4)));
    const dot: ShaderNode = smoothstep(row.radius, row.radius * 0.45, d).mul(inRow);
    colored = max(colored, col(row.color ?? p.color).mul(dot));
  }
  // Organs are fractions of a millimetre: beyond a metre or two they are sub-pixel and would
  // shimmer, so they blend into their average glow over the organ-bearing flank.
  const lens: ShaderNode = length((cameraPosition as ShaderNode).sub(positionWorld));
  const lowest = Math.min(...p.rows.map((r) => r.v));
  const flank: ShaderNode = smoothstep(lowest + 0.5, lowest + 0.1, v);
  const far: ShaderNode = smoothstep(1.2, 4, lens);
  // The far glow takes the organs' colours weighted by their area, so a large red organ (the
  // loosejaw's searchlight) colours it rather than the default blue.
  const area = (r: (typeof p.rows)[number]) => r.count * r.radius * r.radius;
  const total = p.rows.reduce((sum, r) => sum + area(r), 0);
  const avg = p.rows.reduce((acc, r) => {
    const c = r.color ?? p.color;
    const w = area(r) / total;
    return { r: acc.r + c.r * w, g: acc.g + c.g * w, b: acc.b + c.b * w };
  }, { r: 0, g: 0, b: 0 });
  colored = mix(colored, col(avg).mul(flank.mul(0.5)), far);
  const depth: ShaderNode = max((positionWorld as ShaderNode).y.negate(), 0);
  const dark: ShaderNode = smoothstep(200, 400, depth);
  let level: ShaderNode = float(p.brightness);
  if (p.flash) {
    // Flashes: ~0.5 s every 5–12 s out of step between fish, or as waves sweeping across the
    // layer (a 1 s front moving at 1.5 m/s every 4 s, slightly ragged between fish).
    const period: ShaderNode = p.flashWave ? float(4) : mix(float(5), float(12), variation);
    const offset: ShaderNode = p.flashWave
      ? (positionWorld as ShaderNode).x.add((positionWorld as ShaderNode).y.mul(0.5)).div(-1.5 * 4).add(variation.mul(0.06))
      : variation.mul(37);
    const phase: ShaderNode = fract((u.time as ShaderNode).div(period).add(offset));
    const window: ShaderNode = float(p.flashWave ? 1 : 0.5).div(period);
    level = level.add(smoothstep(0, window.mul(0.2), phase).mul(smoothstep(window, window.mul(0.4), phase)).mul(p.flashWave ? 6 : 4));
  }
  let glow: ShaderNode = colored.mul(level).mul(PHOTOPHORE_ADAPTED).div(u.exposure as ShaderNode).mul(dark);
  // Counterillumination matches the brightness of the water seen looking up from below, so the
  // belly vanishes against it from beneath (and reads as a faint glow from the side).
  if (p.counterillumination) glow = glow.add((u.waterAboveColor as ShaderNode).mul(smoothstep(-0.35, -0.75, v)).mul(0.9));
  return glow.mul(onBody);
}

/**
 * The single-scattering water model understates the radiance overhead (in clear ocean water it
 * is roughly ten times the horizontal; the model gives ~2×), so the overhead term is scaled up.
 */
const OVERHEAD_GAIN = 5;

/**
 * Mirror flanks: the reflection of the water seen along the mirrored view ray, approximated by
 * blending horizontal and overhead water radiance by how far the reflection points upward.
 * Upright, a mirror shows the horizontal water (it vanishes); tilted, it catches the bright
 * water overhead and flashes.
 */
function mirrorReflection(u: FrameUniforms, normal: ShaderNode): ShaderNode {
  const view: ShaderNode = normalize((positionWorld as ShaderNode).sub(cameraPosition));
  const r: ShaderNode = view.sub(normal.mul(dot(view, normal).mul(2)));
  const up: ShaderNode = smoothstep(0.1, 0.8, r.y);
  const overhead: ShaderNode = (u.waterAboveColor as ShaderNode).mul(OVERHEAD_GAIN);
  return mix(u.waterColor as ShaderNode, overhead, up).mul(smoothstep(-0.2, 0.2, r.y).mul(0.7).add(0.3));
}

function emission(
  u: FrameUniforms,
  kd: readonly [number, number, number],
  pattern: FishPattern,
  s: ShaderNode,
  v: ShaderNode,
  onBody: ShaderNode,
  variation: ShaderNode,
  normal: ShaderNode,
): ShaderNode | undefined {
  let e: ShaderNode | undefined = pattern.photophores ? photophoreGlow(u, kd, pattern.photophores, s, v, onBody, variation) : undefined;
  if (pattern.mirror) {
    // Silver flank only (below the dark back).
    const flank: ShaderNode = smoothstep(pattern.bellyLine + 0.1, pattern.bellyLine - 0.1, v).mul(onBody);
    const m: ShaderNode = mirrorReflection(u, normal).mul(flank).mul(pattern.mirror);
    e = e ? e.add(m) : m;
  }
  return e;
}

/**
 * Per-instance swim state: x = tail-beat phase (rad), y = amplitude scale, z = turn bend,
 * w = individual variation 0..1. Written by the school simulation every frame.
 *
 * `matrices` is an interleaved view of the mesh's instance matrices. three applies the instance
 * matrix before `positionNode`, so the body wave is computed on the raw body-space position and
 * the matrix is applied here: the tail beats along each fish's own flank, scaled to its length.
 */
export function createFishMaterial(
  u: FrameUniforms,
  kd: readonly [number, number, number],
  morph: FishMorph,
  pattern: FishPattern,
  swim: InstancedBufferAttribute,
  matrices: InstancedInterleavedBuffer,
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
  const isTooth: ShaderNode = isPart(FISH_PART.tooth);
  const isFin: ShaderNode = step(0.5, part).mul(float(1).sub(isTooth));

  // --- Swimming: a travelling body wave whose amplitude grows toward the tail -------------
  // Where the body starts to bend: thunniform swimmers keep the body rigid and beat the tail.
  const bendStart = morph.swim.style === 'labriform' ? 0.35 : morph.swim.style === 'thunniform' ? 0.6 : 0.15;
  const tailward: ShaderNode = smoothstep(bendStart, 1, s);
  const amplitude: ShaderNode = float(morph.swim.bodyWave).mul(float(0.06).add(tailward.mul(tailward).mul(0.94))).mul(ampScale);
  const wave: ShaderNode = sin(phase.sub(s.mul(5.2)));
  const turn: ShaderNode = bend.mul(max(s.sub(0.25), 0).pow(2));
  let lateral: ShaderNode = amplitude.mul(wave).add(turn);
  // Fin membranes ripple a little more than the body they are attached to.
  lateral = lateral.add(isPart(FISH_PART.dorsalAnal).mul(t).mul(0.012).mul(sin(phase.mul(0.7).add(s.mul(9)))));
  lateral = lateral.add(isPart(FISH_PART.caudal).mul(t).mul(0.02).mul(sin(phase.sub(1.2))));
  const local: ShaderNode = attribute('position', 'vec3');
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
  for (const ln of pattern.lines ?? []) {
    const along: ShaderNode = smoothstep(ln.sMin, ln.sMax, s);
    const half: ShaderNode = mix(float(ln.halfHeight), float(ln.halfHeightTail), along);
    const region: ShaderNode = smoothstep(ln.sMin - 0.02, ln.sMin + 0.02, s).mul(smoothstep(ln.sMax + 0.02, ln.sMax - 0.02, s));
    color = mix(color, col(ln.color), smoothstep(half, half.mul(0.75), abs(v.sub(ln.v))).mul(region));
  }
  for (const sp of pattern.spots ?? []) {
    const p: ShaderNode = vec2(s, v.mul(sp.aspect)).div(sp.cell);
    const cell: ShaderNode = floor(p);
    // Per-cell jitter so the spots read as organic rather than a grid.
    const h: ShaderNode = fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5));
    const centre: ShaderNode = vec2(h, fract(h.mul(7.13))).sub(0.5).mul(0.45).add(0.5);
    const d: ShaderNode = length(fract(p).sub(centre));
    const region: ShaderNode = smoothstep(sp.sMin - 0.02, sp.sMin + 0.02, s)
      .mul(smoothstep(sp.sMax + 0.02, sp.sMax - 0.02, s))
      .mul(smoothstep(sp.vMin - 0.06, sp.vMin + 0.06, v))
      .mul(smoothstep(sp.vMax + 0.06, sp.vMax - 0.06, v));
    color = mix(color, col(sp.color), smoothstep(sp.radius, sp.radius * 0.7, d).mul(region));
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
  // Fangs: translucent ivory.
  color = mix(color, vec3(0.82, 0.8, 0.72), isTooth);

  // Eye: pupil, iris ring, dark rim; on both flanks at (s, v) = eye position.
  const eyeH = catmullRom(morph.profile.map((p) => [p[0], p[1]] as const), morph.eye.s);
  const eyeD: ShaderNode = length(vec2(s.sub(morph.eye.s), v.sub(morph.eye.v).mul(eyeH))).div(morph.eye.radius);
  const onBody: ShaderNode = float(1).sub(isFin).sub(isTooth);
  const pupil: ShaderNode = smoothstep(0.56, 0.5, eyeD);
  const iris: ShaderNode = smoothstep(1.02, 0.96, eyeD);
  const rimEye: ShaderNode = smoothstep(1.15, 1.05, eyeD);
  color = mix(color, color.mul(0.35), rimEye.mul(onBody));
  color = mix(color, col(pattern.iris), iris.mul(onBody));
  color = mix(color, vec3(0.005, 0.005, 0.006), pupil.mul(onBody));

  // Scale shimmer and individual variation.
  const scales: ShaderNode = sin(s.mul(160)).mul(cos(v.mul(38).add(s.mul(40))));
  color = color.mul(float(1).add(scales.mul(0.04).mul(onBody))).mul(float(0.9).add(variation.mul(0.2)));

  // Light the side the camera sees. The body mesh is wound inward and this render path reports
  // its outer side as front-facing, so faceDirection would leave the normals pointing inward;
  // facing the normal toward the lens is right for a closed body and for both sides of a fin.
  const n0: ShaderNode = normalize(normalWorld as ShaderNode);
  const normal: ShaderNode = n0.mul(step(0, dot(n0, (cameraPosition as ShaderNode).sub(positionWorld))).mul(2).sub(1));
  const glint: ShaderNode = iris.mul(onBody);
  const lit: ShaderNode = underwaterLit(u, kd, {
    albedo: color,
    normal,
    roughness: mix(float(pattern.roughness), float(0.08), glint),
    // Wet scales are glossy but not mirrors: modest specular, a small iridescent boost, eye glint.
    specular: float(0.06).add(float(pattern.sheen).mul(0.18).mul(onBody)).add(glint.mul(0.6)),
    rim: float(0.25).add(isFin.mul(0.15)),
    subject: float(1),
    emissive: emission(u, kd, pattern, s, v, onBody, variation, normal),
  });

  const m = new MeshBasicNodeMaterial({ side: DoubleSide });
  const column = (offset: number): ShaderNode => instancedDynamicBufferAttribute(matrices, 'vec4', 16, offset);
  const instance: ShaderNode = mat4(column(0), column(4), column(8), column(12));
  m.positionNode = instance.mul(vec4(deformed, 1)).xyz;
  m.colorNode = lit;
  return m;
}
