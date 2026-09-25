import { RenderPipeline, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu';
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
  length,
  max,
  min,
  mix,
  normalize,
  pass,
  pow,
  renderOutput,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  step,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { ShaderNode, Uniform } from '../../shaders/tsl/types';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { gerstnerHeight } from '../../shaders/tsl/gerstner';
import type { Wave } from '../surface/waves';
import { ABSORPTION, BAND_TO_DISPLAY, DIRECTIONAL_DEPTH_SCALE, PHASE_G, PHASE_WEIGHT, SCATTER, SUN_RADIANCE, TURBIDITY_TINT } from './optics';

type N = ShaderNode;

const MAX_VIEW_DISTANCE = 20000;

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
 *  2. downwelling attenuation at the surface point, then per-channel view-path extinction
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
    const hitDepth = max(u.cameraPos.y.add(ray.y.mul(dist)).negate(), 0);
    const downwellingAtHit = exp(KD.mul(hitDepth).negate());
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

    const pMask = submerged.mul(toggles.particles);
    const scattered = particles.sample(uv).rgb.mul(pMask);
    const water = bandToDisplay(sceneColor.mul(downwellingAtHit).mul(transmittance).add(inscatter).add(scattered));
    const mediumMix = submerged.mul(toggles.medium);
    // Weighted sum, not mix(): mix(a, b, 1) = a + (b − a) loses b entirely in fp32 when the
    // dry sky (~10) is ten orders of magnitude brighter than deep water (~1e-7).
    let result: N = sceneColor.add(scattered).mul(float(1).sub(mediumMix)).add(water.mul(mediumMix));
    result = mix(result, result.mul(0.35).add(vec3(0.01, 0.03, 0.035)), clamp(meniscus.mul(0.85), 0, 1));
    result = result.mul(u.exposure);

    const v = toggles.view;
    const isView = (n: number): N => step(n - 0.5, v).mul(step(v, n + 0.5));
    result = mix(result, sceneColor.mul(downwellingAtHit).mul(transmittance).mul(u.exposure), isView(1));
    result = mix(result, inscatter.mul(u.exposure), isView(2));
    result = mix(result, vec3(dist.div(1000)), isView(3));
    return vec4(result, 1);
  });

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = fxaa(renderOutput(output()));
  return { pipeline, toggles };
}
