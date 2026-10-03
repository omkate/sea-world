import { DoubleSide, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  cos,
  dot,
  float,
  max,
  mix,
  normalWorld,
  normalize,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  step,
  uniform,
  vec3,
} from 'three/tsl';
import type { ShaderNode, Uniform } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';
import { ANGLER_PART, JAW_HINGE } from './anglerGeometry';

/** Lure glow and the light it throws on the fish, in camera-adapted units. */
const LURE_ADAPTED = 3;
const LURE_LIGHT = 0.05;
const LURE_COLOR: ShaderNode = vec3(0.15, 0.95, 0.75);

export interface AnglerUniforms {
  /** Lower-jaw gape 0..1. */
  mouth: Uniform<number>;
  /** Lure offset from its rest position (local units), and its world position (for its light). */
  lureOffset: Uniform<Vector3>;
  lureWorld: Uniform<Vector3>;
  /** Lure brightness 0..1 (it dims and flickers). */
  lure: Uniform<number>;
}

export function createAnglerUniforms(): AnglerUniforms {
  return {
    mouth: uniform(0) as Uniform<number>,
    lureOffset: uniform(new Vector3()) as Uniform<Vector3>,
    lureWorld: uniform(new Vector3()) as Uniform<Vector3>,
    lure: uniform(1) as Uniform<number>,
  };
}

/**
 * Anglerfish. A single (non-instanced) mesh, so the body deforms in its own frame directly: the
 * lower jaw rotates open on its hinge, the rod and lure move by the shared lure offset, and the
 * tail sways. The black body is seen almost only by its own lure: the esca glows blue-green and
 * lights nearby surfaces that face it (inverse-square), in camera-adapted units.
 */
export function createAnglerMaterial(u: FrameUniforms, kd: readonly [number, number, number], a: AnglerUniforms): MeshBasicNodeMaterial {
  const attr: ShaderNode = attribute('aAngler', 'vec4');
  const part: ShaderNode = attr.x;
  const t: ShaderNode = attr.y;
  const side: ShaderNode = attr.z;
  const time: ShaderNode = u.time as ShaderNode;
  const isPart = (id: number): ShaderNode => step(id - 0.5, part).mul(step(part, id + 0.5));
  const raw: ShaderNode = positionLocal;

  // Lower jaw (and the teeth set in it) rotate down about the hinge.
  const onJaw: ShaderNode = max(isPart(ANGLER_PART.jaw), isPart(ANGLER_PART.tooth).mul(step(raw.y, -0.08)));
  const angle: ShaderNode = (a.mouth as ShaderNode).mul(0.9).mul(onJaw);
  const hinge = vec3(JAW_HINGE[0], JAW_HINGE[1], JAW_HINGE[2]);
  const d: ShaderNode = raw.sub(hinge);
  const jawed: ShaderNode = hinge.add(vec3(d.x, d.y.mul(cos(angle)).sub(d.z.mul(sin(angle))), d.y.mul(sin(angle)).add(d.z.mul(cos(angle)))));
  // Rod and lure follow the lure offset (more toward the tip); the tail sways.
  const rodWeight: ShaderNode = isPart(ANGLER_PART.rod).mul(t.pow(1.5)).add(isPart(ANGLER_PART.lure));
  const tail: ShaderNode = isPart(ANGLER_PART.fin).mul(step(side.abs(), 0.5)).mul(t);
  const swing: ShaderNode = sin(time.mul(2.2));
  const tailSway: ShaderNode = vec3(swing.mul(0.05).mul(tail), 0, 0);
  const deformed: ShaderNode = jawed.add((a.lureOffset as ShaderNode).mul(rodWeight)).add(tailSway);

  // Colour: velvet black; dark mouth lining; pale needle teeth; the bulb itself.
  let color: ShaderNode = vec3(0.03, 0.028, 0.032);
  color = mix(color, vec3(0.1, 0.015, 0.02), isPart(ANGLER_PART.jaw));
  color = mix(color, vec3(0.82, 0.8, 0.72), isPart(ANGLER_PART.tooth));
  color = mix(color, vec3(0.4, 0.9, 0.8), isPart(ANGLER_PART.lure));

  const n0: ShaderNode = normalize(normalWorld as ShaderNode);
  const normal: ShaderNode = n0.mul(step(0, dot(n0, (cameraPosition as ShaderNode).sub(positionWorld))).mul(2).sub(1));

  // The esca's own glow, and the light it throws on the fish (inverse-square, facing it).
  const lure: ShaderNode = a.lure as ShaderNode;
  const toLure: ShaderNode = (a.lureWorld as ShaderNode).sub(positionWorld);
  const d2: ShaderNode = dot(toLure, toLure);
  const facing: ShaderNode = max(dot(normal, normalize(toLure)), 0).mul(0.8).add(0.2);
  const exposure: ShaderNode = u.exposure as ShaderNode;
  const lureLight: ShaderNode = color.mul(LURE_COLOR).mul(facing).mul(LURE_LIGHT).div(d2.add(0.002)).mul(lure).div(exposure);
  const lureGlow: ShaderNode = LURE_COLOR.mul(isPart(ANGLER_PART.lure)).mul(LURE_ADAPTED).mul(lure).div(exposure);
  const depth: ShaderNode = max((positionWorld as ShaderNode).y.negate(), 0);

  const isTooth = isPart(ANGLER_PART.tooth);
  const lit: ShaderNode = underwaterLit(u, kd, {
    albedo: color,
    normal,
    roughness: mix(float(0.85), float(0.3), isTooth),
    specular: mix(float(0.05), float(0.6), isTooth),
    rim: float(0.15),
    emissive: lureLight.add(lureGlow).mul(smoothstep(200, 400, depth)),
  });

  const m = new MeshBasicNodeMaterial({ side: DoubleSide });
  m.positionNode = deformed;
  m.colorNode = lit;
  return m;
}
