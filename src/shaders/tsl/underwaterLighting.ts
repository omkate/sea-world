import { abs, cameraPosition, dot, exp, float, max, min, mix, normalize, positionWorld, pow, smoothstep, sqrt, vec3 } from 'three/tsl';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { ABSORPTION, DIRECTIONAL_DEPTH_SCALE, SCATTER } from '../../ocean/medium/optics';
import { CAUSTIC_SHAFT_MEAN, CAUSTIC_TILE, caustic } from './caustics';
import type { ShaderNode } from './types';

/**
 * Irradiance of the refracted sun just below the surface, in the same units as the medium's
 * in-scatter. Clear ocean water reflects ~1% of the light falling on it while sand reflects
 * ~30%, so sunlit substrate must be many times brighter than the water behind it.
 */
export const SUN_UNDERWATER = 3.2;
/** Diffuse sky light arriving from the upper hemisphere just below the surface. */
export const SKY_UNDERWATER = 1.1;
/** Camera fill: a low-power video light, like documentary crews use on reefs (radiance at 1 m). */
export const FILL_LIGHT = 0.45;
/** Dive lamp strength relative to the fill, used where sunlight is gone. */
export const LAMP_LIGHT = 1.6;

export interface SurfaceInputs {
  albedo: ShaderNode;
  normal: ShaderNode;
  roughness: ShaderNode;
  specular: ShaderNode;
  emissive?: ShaderNode;
  /** Strength of the silhouette rim from the bright water above (0..1). */
  rim?: ShaderNode;
  /** Receive surface caustics (seafloor, coral). */
  caustics?: boolean;
  /** Strength (0..1) of the documentary subject light, which shows a subject's true colours. */
  subject?: ShaderNode;
}

/**
 * Documentary subject light: crews light hero animals with strong video lights and grade them
 * back to true colour. Art-directed, not physical: the light is pre-divided by the view-path
 * transmittance and the camera white balance, so the subject reads in its own colours at
 * SUBJECT_LIGHT, fading into the blue beyond SUBJECT_REACH. Only above SUBJECT_MAX_DEPTH.
 */
export const SUBJECT_LIGHT = 0.9;
export const SUBJECT_REACH = 7;
export const SUBJECT_MAX_DEPTH = 60;

/**
 * Lighting for anything below the surface. Sunlight and skylight are attenuated per band by
 * the water above the shaded point (Beer–Lambert on Kd), so reds vanish with depth exactly as
 * in the medium pass; the camera fill and dive lamp travel only the short path from the lens.
 * The medium pass then applies view-path extinction and in-scattering.
 */
export function underwaterLit(u: FrameUniforms, kd: readonly [number, number, number], s: SurfaceInputs): ShaderNode {
  const p: ShaderNode = positionWorld;
  const n: ShaderNode = normalize(s.normal);
  const z: ShaderNode = max(p.y.negate(), 0);
  const KD = vec3(kd[0], kd[1], kd[2]);
  const down: ShaderNode = exp(KD.mul(z).negate());
  const toCam: ShaderNode = (cameraPosition as ShaderNode).sub(p);
  const dist: ShaderNode = toCam.length();
  const v: ShaderNode = toCam.div(dist);

  const l: ShaderNode = (u.sunDirWater as ShaderNode).negate();
  const nl: ShaderNode = max(dot(n, l), 0);
  // Scattering turns the sun into a diffuse glow from above with depth (the medium pass fades
  // its directional effects on the same scale): the hard sun term hands over to the sky term.
  const directional: ShaderNode = exp(z.div(-DIRECTIONAL_DEPTH_SCALE));
  let sun: ShaderNode = down.mul(SUN_UNDERWATER).mul(nl).mul(directional);
  if (s.caustics) {
    const toSun: ShaderNode = l;
    const entry: ShaderNode = p.xz.add(toSun.xz.mul(z.div(max(toSun.y, 0.2))));
    // Two-iteration softened network (same as the light shafts): cheaper, and the sharp
    // filaments of the full pattern would alias on distant seafloor anyway.
    const c: ShaderNode = sqrt(caustic(entry.div(CAUSTIC_TILE), (u.time as ShaderNode).mul(0.55), 2)).div(CAUSTIC_SHAFT_MEAN);
    sun = sun.mul(mix(float(1), c.mul(c).mul(0.55).add(0.45), exp(z.div(-10)).mul(0.85)));
  }
  const skyWeight: ShaderNode = mix(float(0.12), float(1), n.y.mul(0.5).add(0.5));
  const sky: ShaderNode = down.mul(float(SKY_UNDERWATER).add(float(1).sub(directional).mul(SUN_UNDERWATER * 0.25))).mul(skyWeight);

  const sigma = vec3(ABSORPTION[0] + SCATTER[0], ABSORPTION[1] + SCATTER[1], ABSORPTION[2] + SCATTER[2]);
  // The low-power fill is a shallow-water documentary light: it fades out through 60–200 m, where
  // the camera's exposure climbs so high it would blow out anything nearby, and the twilight is
  // seen by its own light until the dive lamp comes on.
  const fillFade: ShaderNode = smoothstep(200, 60, u.cameraDepth as ShaderNode);
  const fillStrength: ShaderNode = float(FILL_LIGHT).mul(fillFade).add((u.diveLight as ShaderNode).mul(LAMP_LIGHT));
  // Camera-mounted light: it travels to the subject and back along (almost) the view ray.
  const fillReach: ShaderNode = vec3(1, 0.96, 0.9).mul(fillStrength).mul(exp(sigma.mul(dist).negate())).div(dist.mul(dist).add(0.6));
  const fill: ShaderNode = fillReach.mul(max(dot(n, v), 0));

  const diffuse: ShaderNode = s.albedo.mul(sun.add(sky).add(fill));

  const hv: ShaderNode = normalize(l.add(v));
  const shininess: ShaderNode = mix(float(180), float(8), s.roughness);
  const fresnel: ShaderNode = float(0.04).add(float(0.96).mul(pow(float(1).sub(max(dot(n, v), 0)), 5)));
  const specular: ShaderNode = down
    .mul(SUN_UNDERWATER)
    .mul(pow(max(dot(n, hv), 0), shininess))
    .mul(nl)
    .mul(s.specular)
    .mul(fresnel.mul(2).add(0.4));

  // The lamp sits beside the lens, so its highlight is where the surface faces the camera:
  // mirror-sided fish (hatchetfish, lanternfish) flash back at the lens, as in ROV footage.
  const lampSpecular: ShaderNode = fillReach
    .mul(pow(max(dot(n, v), 0), shininess))
    .mul(s.specular)
    .mul(fresnel.mul(2).add(0.4))
    .mul(shininess.mul(0.05));

  let color: ShaderNode = diffuse.add(specular).add(lampSpecular);
  if (s.rim) {
    const rimShape: ShaderNode = pow(float(1).sub(abs(dot(n, v))), 3).mul(max(n.y, 0).mul(0.7).add(0.3));
    color = color.add(down.mul(SKY_UNDERWATER).mul(rimShape).mul(s.rim));
  }
  if (s.subject) {
    const d: ShaderNode = min(dist, 14);
    const falloff: ShaderNode = float(1).div(d.div(SUBJECT_REACH).pow(2).add(1));
    const shape: ShaderNode = max(dot(n, v), 0).mul(0.5).add(0.5);
    const shallow: ShaderNode = smoothstep(SUBJECT_MAX_DEPTH, SUBJECT_MAX_DEPTH * 0.5, z);
    const restore: ShaderNode = exp(sigma.mul(d)).div(max(u.whiteBalance as ShaderNode, vec3(0.05)));
    color = color.add(s.albedo.mul(restore).mul(falloff.mul(shape).mul(shallow).mul(s.subject).mul(SUBJECT_LIGHT)));
  }
  if (s.emissive) color = color.add(s.emissive);
  return color;
}
