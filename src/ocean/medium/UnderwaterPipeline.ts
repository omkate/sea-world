import { RenderPipeline, Vector2, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu';
import {
  abs,
  clamp,
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  Fn,
  getViewPosition,
  hash,
  If,
  int,
  Loop,
  length,
  max,
  min,
  mix,
  normalize,
  pass,
  pow,
  renderOutput,
  rtt,
  screenCoordinate,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  sqrt,
  step,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { ShaderNode, Uniform } from '../../shaders/tsl/types';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import { gerstnerHeight } from '../../shaders/tsl/gerstner';
import { CAUSTIC_SHAFT_MEAN, CAUSTIC_TILE, caustic } from '../../shaders/tsl/caustics';
import { LAMP_RADIANCE } from '../../particles/suspended/SuspendedParticles';
import type { Wave } from '../surface/waves';
import { ABSORPTION, BAND_TO_DISPLAY, DIRECTIONAL_DEPTH_SCALE, PHASE_G, PHASE_WEIGHT, SCATTER, SUN_RADIANCE, TURBIDITY_TINT } from './optics';

type N = ShaderNode;

const MAX_VIEW_DISTANCE = 20000;
/** Light shafts are marched over at most this distance (m) and fade out below SHAFT_MAX_DEPTH. */
const SHAFT_RANGE = 45;
const SHAFT_MAX_DEPTH = 220;
const SHAFT_STRENGTH = 0.9;
/** Fraction of the internal render resolution used for the light-shaft pass. */
const SHAFT_RESOLUTION = 0.35;
const LAMP_BACKSCATTER = 0.035;

/**
 * Bilinear upscale plus a 5-tap contrast-adaptive sharpen, clamped to the local min/max so it
 * never rings. A fraction of FSR 1's cost; used below the Ultra tier.
 */
function sharpenUpscale(tex: N, texel: N): N {
  const c: N = tex.sample(screenUV).rgb;
  const n: N = tex.sample(screenUV.add(vec2(0, texel.y))).rgb;
  const s: N = tex.sample(screenUV.sub(vec2(0, texel.y))).rgb;
  const e: N = tex.sample(screenUV.add(vec2(texel.x, 0))).rgb;
  const w: N = tex.sample(screenUV.sub(vec2(texel.x, 0))).rgb;
  const lo: N = min(min(min(n, s), min(e, w)), c);
  const hi: N = max(max(max(n, s), max(e, w)), c);
  const sharpened: N = c.add(c.mul(4).sub(n).sub(s).sub(e).sub(w).mul(0.18));
  const result: N = clamp(sharpened, lo, hi);
  return vec4(result, 1);
}

/**
 * Per-pixel, per-frame white noise from an integer PCG hash of the pixel index. Unlike
 * sin-based hashes (moiré at large coordinates) or interleaved gradient noise (diagonal
 * structure), it shows no pattern. Index stays below 2^24 so float→uint is exact.
 */
const pixelNoise = (frame: N, channel: number): N => {
  const px: N = floor(screenCoordinate.x).add(floor(screenCoordinate.y).mul(4099));
  return hash(px.add(frame.mul(16411)).add(channel * 331));
};

const v3 = (c: readonly number[]): N => vec3(c[0]!, c[1]!, c[2]!);

export interface PipelineToggles {
  [name: string]: Uniform<number>;
  /** 0 final · 1 attenuated scene term · 2 in-scatter · 3 view distance (km) */
  view: Uniform<number>;
  medium: Uniform<number>;
  lens: Uniform<number>;
  particles: Uniform<number>;
}

/**
 * Screen pass that turns a dry render into a camera underwater:
 *  1. per-pixel waterline test against the live wave field at the near plane
 *  2. per-channel view-path extinction (surfaces light themselves with depth-attenuated sun,
 *     see shaders/tsl/underwaterLighting.ts; the sea surface itself sits at depth 0)
 *  3. analytic single-scatter in-scattering with a forward-peaked phase toward the refracted sun
 *  4. lens effects: underwater shimmer near the surface, droplets after surfacing
 *  5. particle layer added on top (particles carry their own extinction; the layer is
 *     additive because post-effect RTT nodes reset the clear alpha, so alpha can't be trusted)
 */
export function createUnderwaterPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  particleScene: Scene,
  camera: Camera,
  u: FrameUniforms,
  waves: readonly Wave[],
  kd: readonly [number, number, number],
  useFsr: boolean,
) {
  const scenePass = pass(scene, camera);
  const particlePass = pass(particleScene, camera);
  const color: N = scenePass.getTextureNode('output');
  const depth: N = scenePass.getTextureNode('depth');
  const particles: N = particlePass.getTextureNode('output');

  const m = BAND_TO_DISPLAY;
  const bandToDisplay = (c: N): N =>
    vec3(
      dot(c, vec3(m[0]!, m[1]!, m[2]!)),
      dot(c, vec3(m[3]!, m[4]!, m[5]!)),
      dot(c, vec3(m[6]!, m[7]!, m[8]!)),
    );

  const toggles: PipelineToggles = { view: uniform(0) as Uniform<number>, medium: uniform(1) as Uniform<number>, lens: uniform(1) as Uniform<number>, particles: uniform(1) as Uniform<number> };
  const KD = v3(kd);

  const droplets: N = Fn(([uvIn, wet]: [N, N]) => {
    const aspect: N = screenSize.x.div(screenSize.y);
    const grid = vec2(aspect.mul(9), 9);
    const p = uvIn.mul(grid);
    const cell: N = floor(p);
    const seed = cell.x.mul(17.13).add(cell.y.mul(113.7));
    const h1 = hash(seed);
    const h2 = hash(seed.add(3.1));
    const h3 = hash(seed.add(7.7));
    const alive = step(h3, wet.mul(0.55));
    const radius = mix(float(0.07), float(0.2), h1);
    const slide = fract(u.time.mul(mix(float(0.02), float(0.09), h2)).add(h1));
    const centre = vec2(mix(radius, float(1).sub(radius), h2), mix(radius, float(1).sub(radius), slide));
    const d = fract(p).sub(centre).div(radius);
    const inside = smoothstep(1.0, 0.85, length(d)).mul(alive);
    return vec3(d.mul(inside).mul(-0.006), inside);
  });

  /**
   * Light shafts: march the view ray; at each sample, follow the refracted sun ray back up to
   * where it entered the surface and read how strongly the waves focused light there. Runs at
   * reduced resolution and is Gaussian-blurred: shafts are low-frequency, and the blur removes
   * the sampling noise of a short, jittered march (no visible speckle or dither pattern).
   */
  const shaftField = Fn(() => {
    const uv: N = screenUV;
    const t = u.time;
    const camDepth: N = max(u.cameraDepth, 0);
    const d = depth.sample(uv).x;
    const dist: N = min(length(getViewPosition(uv, d, u.projectionInverse)), MAX_VIEW_DISTANCE);
    const ray: N = normalize(u.cameraWorld.mul(vec4(getViewPosition(uv, float(0), u.projectionInverse), 0)).xyz);
    const b = v3(SCATTER).add(v3(TURBIDITY_TINT).mul(u.turbidity));
    const sigma = v3(ABSORPTION).add(b);
    const submerged: N = step(0.3, u.cameraDepth);
    const shafts: N = vec3(0).toVar();
    If(submerged.greaterThan(0.5).and(camDepth.lessThan(SHAFT_MAX_DEPTH)).and(u.shaftSamples.greaterThan(0.5)), () => {
      const samples: N = u.shaftSamples;
      const range: N = min(dist, float(SHAFT_RANGE));
      const stepLen: N = range.div(samples);
      const jitter: N = pixelNoise(floor(t.mul(60)).mod(256), 7);
      const toSun: N = u.sunDirWater.negate();
      Loop({ start: int(0), end: int(samples), type: 'int', condition: '<' }, ({ i }: { i: N }) => {
        const tt: N = float(i).add(jitter).mul(stepLen);
        const p: N = u.cameraPos.add(ray.mul(tt));
        const zp: N = max(p.y.negate(), 0);
        const inWater: N = step(p.y, 0);
        const entry: N = p.xz.add(toSun.xz.mul(zp.div(max(toSun.y, 0.2))));
        // The pattern blurs with depth below the surface and becomes unresolvable with distance.
        const spread: N = float(1).add(zp.div(22)).add(tt.div(14));
        const c: N = sqrt(caustic(entry.div(spread.mul(CAUSTIC_TILE)), t.mul(0.55), 2)).div(CAUSTIC_SHAFT_MEAN).sub(1);
        const contrast: N = exp(zp.div(-38));
        const light: N = exp(KD.mul(zp).negate());
        const atten: N = exp(sigma.mul(tt).negate());
        shafts.addAssign(light.mul(atten).mul(c.mul(contrast)).mul(stepLen).mul(inWater));
      });
    });
    return vec4(shafts, 1);
  });
  const shaftRT: N = rtt(shaftField(), null, null, { resolutionScale: SHAFT_RESOLUTION });
  // 12-tap disc blur over the low-resolution field (signed values, so no 8-bit blur passes).
  const shaftTexel = uniform(new Vector2(1 / 640, 1 / 360)) as Uniform<Vector2>;
  const DISC: readonly (readonly [number, number])[] = Array.from({ length: 12 }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / 12) * 3.2;
    const a = i * 2.39996;
    return [Math.cos(a) * r, Math.sin(a) * r] as const;
  });
  const blurredShafts = (uv: N): N => {
    let sum: N = shaftRT.sample(uv).rgb;
    for (const [x, y] of DISC) sum = sum.add(shaftRT.sample(uv.add(vec2(x, y).mul(shaftTexel))).rgb);
    return sum.div(DISC.length + 1);
  };

  const output = Fn(() => {
    const uv0: N = screenUV;
    const t = u.time;
    const camDepth: N = max(u.cameraDepth, 0);

    const nearView: N = getViewPosition(uv0, float(0), u.projectionInverse);
    const nearWorld: N = u.cameraWorld.mul(vec4(nearView, 1)).xyz;
    const aboveLine = nearWorld.y.sub(gerstnerHeight(waves, nearWorld.xz, t));
    const submerged = smoothstep(0.006, -0.006, aboveLine);
    const nearSurface = float(1).sub(smoothstep(0.5, 2.5, abs(u.cameraDepth)));
    const meniscus = exp(abs(aboveLine).mul(-180)).mul(nearSurface);

    const shallow = float(1).sub(smoothstep(2, 14, camDepth)).mul(submerged);
    const shimmer = vec2(sin(uv0.y.mul(38).add(t.mul(1.9))), cos(uv0.x.mul(31).add(t.mul(1.6)))).mul(0.0016).mul(shallow);
    const drop = droplets(uv0, u.wetness.mul(float(1).sub(submerged))).mul(toggles.lens);
    const uv = uv0.add(shimmer.mul(toggles.lens)).add(drop.xy);

    const sceneColor = color.sample(uv).rgb;
    const d = depth.sample(uv).x;
    // Direction comes from the near-plane point: reconstructing it from depth = 1 (sky) is
    // numerically degenerate and produced NaNs at depth.
    const viewPos: N = getViewPosition(uv, d, u.projectionInverse);
    const dist: N = min(length(viewPos), MAX_VIEW_DISTANCE);
    const ray: N = normalize(u.cameraWorld.mul(vec4(getViewPosition(uv, float(0), u.projectionInverse), 0)).xyz);

    const b = v3(SCATTER).add(v3(TURBIDITY_TINT).mul(u.turbidity));
    const sigma = v3(ABSORPTION).add(b);
    const transmittance = exp(sigma.mul(dist).negate());

    const toSurface = camDepth.div(max(ray.y, 1e-4));
    const pathLength = mix(dist, min(dist, toSurface), step(0, ray.y));
    const s = max(sigma.sub(KD.mul(ray.y)), vec3(0.004));
    const cosTheta = dot(u.sunDirWater, ray.negate());
    const g = float(PHASE_G);
    const hg = float(1).sub(g.mul(g)).div(pow(float(1).add(g.mul(g)).sub(g.mul(2).mul(cosTheta)), 1.5));
    const directional = exp(camDepth.div(-DIRECTIONAL_DEPTH_SCALE));
    const phase = float(1).add(hg.sub(1).mul(PHASE_WEIGHT).mul(directional));
    const inscatter = b
      .mul(SUN_RADIANCE)
      .mul(exp(KD.mul(camDepth).negate()))
      .mul(float(1).sub(exp(s.mul(pathLength).negate())))
      .div(s)
      .mul(phase);

    // Light shafts come from a separate quarter-resolution pass, blurred (see shaftField).
    const shafts: N = blurredShafts(uv);
    const shaftDepthFade = float(1).sub(smoothstep(SHAFT_MAX_DEPTH * 0.45, SHAFT_MAX_DEPTH, camDepth));
    const shaftPhase = float(0.35).add(hg.mul(0.2));
    const shaftLight: N = shafts.mul(b).mul(SUN_RADIANCE * SHAFT_STRENGTH).mul(shaftPhase).mul(shaftDepthFade);

    // Backscatter from the camera lamp: the soft glow of lit water in front of the lens.
    const forward: N = normalize(u.cameraWorld.mul(vec4(0, 0, -1, 0)).xyz);
    // Lamps sit beside the port, so only a faint glow reaches the lens (backscatter).
    const lampCone = smoothstep(0.72, 0.98, dot(ray, forward));
    const lampPath = min(dist, float(10));
    const lampHaze: N = b
      .mul(LAMP_RADIANCE * LAMP_BACKSCATTER)
      .mul(float(1).sub(exp(sigma.mul(lampPath).mul(-2))))
      .div(sigma.mul(2))
      .mul(lampCone)
      .mul(u.diveLight);

    const pMask = submerged.mul(toggles.particles);
    const scattered = particles.sample(uv).rgb.mul(pMask);
    const wet: N = max(sceneColor.mul(transmittance).add(inscatter).add(shaftLight).add(lampHaze).add(scattered), vec3(0));
    // Documentary grade: deep water loses saturation the way low-light sensors render it.
    const graded: N = bandToDisplay(wet.mul(u.whiteBalance));
    const luma: N = dot(graded, vec3(0.2126, 0.7152, 0.0722));
    const water: N = mix(vec3(luma), graded, mix(float(1), float(0.72), smoothstep(30, 400, camDepth)));
    const mediumMix = submerged.mul(toggles.medium);
    // Weighted sum, not mix(): mix(a, b, 1) = a + (b − a) loses b entirely in fp32 when the
    // dry sky (~10) is ten orders of magnitude brighter than deep water (~1e-7).
    let result: N = sceneColor.add(scattered).mul(float(1).sub(mediumMix)).add(water.mul(mediumMix));
    result = mix(result, result.mul(0.35).add(vec3(0.01, 0.03, 0.035)), clamp(meniscus.mul(0.85), 0, 1));
    result = result.mul(u.exposure);

    // Lens vignette: stronger behind a dome port underwater.
    const r: N = length(uv0.sub(0.5).mul(vec2(1, 0.78))).mul(1.55);
    result = result.mul(float(1).sub(mix(float(0.14), float(0.34), submerged).mul(smoothstep(0.35, 1.05, r))));

    const v = toggles.view;
    const isView = (n: number): N => step(n - 0.5, v).mul(step(v, n + 0.5));
    result = mix(result, sceneColor.mul(transmittance).mul(u.exposure), isView(1));
    result = mix(result, inscatter.mul(u.exposure), isView(2));
    result = mix(result, vec3(dist.div(1000)), isView(3));
    return vec4(result, 1);
  });

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  // Sensor grain after tone mapping, so it also dithers the dark gradients (no 8-bit banding).
  // Resolution strategy: everything expensive (scene, particles, medium, shafts, AA) runs at an
  // internal scale chosen by dynamic resolution; FSR 1 then upscales and sharpens to the
  // native canvas (up to 3840×2160). Grain is added at output resolution.
  const medium: N = rtt(output(), null, null, { resolutionScale: 1 });
  const antialiased: N = rtt(fxaa(renderOutput(medium)), null, null, { resolutionScale: 1 });
  const texel = uniform(new Vector2(1 / 1920, 1 / 1080)) as Uniform<Vector2>;
  const upscaled: N = useFsr ? fsr1(antialiased, 0.25) : sharpenUpscale(antialiased, texel);
  const grain = Fn(() => {
    const frame: N = floor(u.time.mul(60)).mod(256);
    const n: N = vec3(pixelNoise(frame, 0), pixelNoise(frame, 1), pixelNoise(frame, 2)).sub(0.5);
    const mono: N = n.x.mul(0.8).add(n.y.mul(0.2));
    const amount: N = mix(float(0.006), float(0.05), u.sensorGain).mul(float(1).sub(u.diveLight.mul(0.45)));
    const colour: N = upscaled.rgb.add(vec3(mono).add(n.mul(0.15)).mul(amount));
    return vec4(colour, 1);
  });
  pipeline.outputNode = grain();

  /** Internal render scale (0..1] for every pass before the upscaler. */
  const setInternalScale = (scale: number): void => {
    const size = renderer.getDrawingBufferSize(new Vector2());
    texel.value.set(1 / Math.max(1, Math.floor(size.x * scale)), 1 / Math.max(1, Math.floor(size.y * scale)));
    scenePass.setResolutionScale(scale);
    shaftRT.setResolutionScale(scale * SHAFT_RESOLUTION);
    shaftTexel.value.set(1 / Math.max(1, size.x * scale * SHAFT_RESOLUTION), 1 / Math.max(1, size.y * scale * SHAFT_RESOLUTION));
    particlePass.setResolutionScale(scale);
    medium.setResolutionScale(scale);
    antialiased.setResolutionScale(scale);
  };
  return { pipeline, toggles, setInternalScale };
}
