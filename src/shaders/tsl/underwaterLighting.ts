import { abs, cameraPosition, dot, exp, float, max, mix, normalize, positionWorld, pow, sqrt, vec3 } from 'three/tsl';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { ABSORPTION, SCATTER } from '../../ocean/medium/optics';
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
}

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
  let sun: ShaderNode = down.mul(SUN_UNDERWATER).mul(nl);
  if (s.caustics) {
    const toSun: ShaderNode = l;
    const entry: ShaderNode = p.xz.add(toSun.xz.mul(z.div(max(toSun.y, 0.2))));
    // Two-iteration softened network (same as the light shafts): cheaper, and the sharp
    // filaments of the full pattern would alias on distant seafloor anyway.
    const c: ShaderNode = sqrt(caustic(entry.div(CAUSTIC_TILE), (u.time as ShaderNode).mul(0.55), 2)).div(CAUSTIC_SHAFT_MEAN);
    sun = sun.mul(mix(float(1), c.mul(c).mul(0.55).add(0.45), exp(z.div(-10)).mul(0.85)));
  }
  const skyWeight: ShaderNode = mix(float(0.12), float(1), n.y.mul(0.5).add(0.5));
  const sky: ShaderNode = down.mul(SKY_UNDERWATER).mul(skyWeight);

  const sigma = vec3(ABSORPTION[0] + SCATTER[0], ABSORPTION[1] + SCATTER[1], ABSORPTION[2] + SCATTER[2]);
  const fillStrength: ShaderNode = float(FILL_LIGHT).add((u.diveLight as ShaderNode).mul(LAMP_LIGHT));
  const fill: ShaderNode = vec3(1, 0.96, 0.9)
    .mul(fillStrength)
    .mul(max(dot(n, v), 0))
    .mul(exp(sigma.mul(dist).negate()))
    .div(dist.mul(dist).add(0.6));

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

  let color: ShaderNode = diffuse.add(specular);
  if (s.rim) {
    const rimShape: ShaderNode = pow(float(1).sub(abs(dot(n, v))), 3).mul(max(n.y, 0).mul(0.7).add(0.3));
    color = color.add(down.mul(SKY_UNDERWATER).mul(rimShape).mul(s.rim));
  }
  if (s.emissive) color = color.add(s.emissive);
  return color;
}
