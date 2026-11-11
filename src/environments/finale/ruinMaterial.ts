import { DoubleSide, MeshBasicNodeMaterial, type Texture } from 'three/webgpu';
import { float, mix, mx_noise_vec3, normalWorld, normalize, positionWorld, smoothstep, texture, uv, vec3 } from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';

export interface RuinLook {
  /** Lift on the photograph: scans captured in daylight on land read too dark under 150 m of water. */
  lift: number;
  /** Colour of bare material where there is no photograph. */
  bare: readonly [number, number, number];
  /** Scale of the flaking relief (per metre): rust scale is fine, masonry coarse. */
  relief: number;
  /** How much of every upward face is buried under silt and a growth film (0..1). */
  silt: number;
}

/**
 * A scanned structure that has lain under 150 m of water: its own photograph lifted for the dim
 * light, procedural relief (flaking rust or weathered stone), and silt with a thin growth film
 * settled on every upward face, so grass, sand and bare tops of a scan captured on land read as
 * seabed. Lit by the diver's torch and the crown's glow.
 */
export function ruinMaterial(u: FrameUniforms, kd: readonly [number, number, number], map: Texture | null, look: RuinLook): MeshBasicNodeMaterial {
  const p: ShaderNode = positionWorld;
  const flakes: ShaderNode = mx_noise_vec3(p.mul(look.relief));
  const pits: ShaderNode = mx_noise_vec3(p.mul(look.relief * 4.2));
  const patches: ShaderNode = mx_noise_vec3(p.mul(0.7).add(3.3));
  const normal: ShaderNode = normalize((normalWorld as ShaderNode).add(flakes.mul(0.28)).add(pits.mul(0.18)));
  const photo: ShaderNode = map ? (texture(map, uv()) as ShaderNode).rgb.mul(look.lift) : vec3(...look.bare);
  const weathered: ShaderNode = photo.mul(float(0.85).add(flakes.x.mul(0.25)));
  const upward: ShaderNode = smoothstep(0.25, 0.85, (normalWorld as ShaderNode).y);
  const film: ShaderNode = mix(vec3(0.36, 0.34, 0.27), vec3(0.24, 0.3, 0.2), patches.x.mul(0.5).add(0.5));
  const albedo: ShaderNode = mix(weathered, film, upward.mul(smoothstep(-0.2, 0.4, patches.y)).mul(look.silt));
  const m = new MeshBasicNodeMaterial({ side: DoubleSide });
  m.colorNode = underwaterLit(u, kd, {
    albedo,
    normal,
    roughness: float(0.9),
    specular: float(0.12),
    rim: float(0.3),
    torch: true,
  });
  return m;
}
