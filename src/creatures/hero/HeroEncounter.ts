import { DoubleSide, Matrix4, Mesh, MeshBasicNodeMaterial, Vector3, type BufferGeometry, type PerspectiveCamera } from 'three/webgpu';
import { abs, attribute, cameraPosition, cameraViewMatrix, dot, float, normalMap, normalWorld, normalize, positionLocal, positionWorld, sin, smoothstep, step, texture, uniform, uv, vec3, vec4 } from 'three/tsl';
import type { ShaderNode, Uniform } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { AssetMaterial, ScanAsset } from '../../assets/AssetLibrary';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';

/**
 * How the body moves (the scans have no skeleton, so it is a vertex deformation):
 * - lateral: a fish's travelling wave, strongest at the tail;
 * - thunniform: a stiff body and a fast tail (tunas);
 * - eel: an anguilliform wave down the whole body;
 * - fluke: a whale's up-and-down tail stroke;
 * - hover: a finned octopus — the ear fins flap and the web pulses.
 */
export type HeroStyle = 'lateral' | 'thunniform' | 'eel' | 'fluke' | 'hover';

export interface HeroEncounterOptions {
  /** Species id (sightings and mesh name). */
  species: string;
  /** Direction the head (or face) points in the file: rotated to +z. */
  forward: '+x' | '-x' | '+z' | '-z';
  style: HeroStyle;
  /** Camera depths over which the scene plays; the animal is in frame anywhere in this band. */
  encounter: readonly [number, number];
  /** Distance from the lens (m) at which it crosses the view. */
  ahead: number;
  /**
   * Which diagonal it crosses as the camera scrolls down: 1 from the top-left corner to the
   * bottom-right, −1 from the top-right to the bottom-left. Scrolling up runs it back.
   */
  path: 1 | -1;
  /** Body wave / fin beat frequency (Hz) and amplitude (fraction of body length). */
  beatHz: number;
  amplitude: number;
  /** Albedo multiplier (a scan painted lighter than the living animal). */
  tint?: readonly [number, number, number];
  /** Emissive-map glow (camera-adapted), e.g. a lure or photophores painted in the scan. */
  glow?: number;
  /** Hero-rig strength (pale animals need less to keep their colour). Default 1. */
  light?: number;
  /** Surface response. */
  roughness?: number;
  specular?: number;
}

const HEAD_TO_PLUS_Z: Record<HeroEncounterOptions['forward'], number> = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 };

/** Fraction of the band at each end spent entering / leaving through a corner of the frame. */
const EDGE = 0.05;
/** Where the inner path starts and ends, in half-widths / half-heights of the frame. */
const CORNER_X = 0.62;
const CORNER_Y = 0.5;
/** How far the path bows away from the straight diagonal (half-frame units). */
const ARC = 0.12;
/** Just outside the frame, where it enters and leaves. */
const OUTSIDE = 1.3;
/** Spring stiffness (rad/s) that the animal follows its place with: settles in ~0.6 s. */
const SPRING = 6;

/**
 * Place in the frame (x right, y up, in half-widths / half-heights) at band progress p (0 at the
 * top of the band). With path 1 it crosses from the top-left corner to the bottom-right as the
 * camera descends; it is on screen everywhere except the first and last EDGE of the band.
 */
export function scenePlace(p: number, path: 1 | -1, out: { x: number; y: number }): { x: number; y: number } {
  const q = Math.min(1, Math.max(0, p));
  let t: number;
  let reach: number;
  if (q < EDGE) {
    t = 0;
    reach = OUTSIDE + (1 - OUTSIDE) * (q / EDGE);
  } else if (q > 1 - EDGE) {
    t = 1;
    reach = 1 + (OUTSIDE - 1) * ((q - (1 - EDGE)) / EDGE);
  } else {
    t = (q - EDGE) / (1 - 2 * EDGE);
    reach = 1;
  }
  // Along the diagonal from (−CX, +CY) to (+CX, −CY), pushed out past the corners at the ends.
  const s = (t * 2 - 1) * (t === 0 || t === 1 ? reach : 1);
  // Animals swim in arcs, not ruled lines: the path bows out to one side of the diagonal.
  const len = Math.hypot(CORNER_X, CORNER_Y);
  const bow = Math.sin(Math.PI * t) * ARC;
  out.x = path * s * CORNER_X + (CORNER_Y / len) * bow;
  out.y = -s * CORNER_Y + ((path * CORNER_X) / len) * bow;
  return out;
}

const ORIENTED = new Map<string, BufferGeometry>();

/** The scan turned head-to-+z and centred on its bounding box, so it turns about its middle. */
function oriented(asset: ScanAsset, forward: HeroEncounterOptions['forward']): BufferGeometry {
  const key = `${asset.entry.id}|${forward}`;
  let g = ORIENTED.get(key);
  if (!g) {
    g = asset.geometry.clone();
    g.applyMatrix4(new Matrix4().makeRotationY(HEAD_TO_PLUS_Z[forward]));
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new Vector3());
    g.translate(-c.x, -c.y, -c.z);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    ORIENTED.set(key, g);
  }
  return g;
}

/**
 * A scene's hero animal: a textured scan held in front of the lens for the whole of its depth
 * band, so a fast scroll can never skip it. Its place is kept in the camera's frame and follows
 * the scroll: it crosses the view corner to corner along a diagonal as the camera descends, swimming
 * the way it travels, and it is lit by the deep-sea hero rig so it stands out of the black water.
 */
export class HeroEncounter {
  readonly mesh: Mesh;
  readonly position = new Vector3();
  private readonly phase: Uniform<number> = uniform(0) as Uniform<number>;
  private beat = 0;
  /** Current offset in the camera's yaw frame: x right, y up, z ahead. */
  private readonly offset = new Vector3();
  private readonly goal = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly view = new Vector3();
  private readonly viewRight = new Vector3();
  private readonly viewUp = new Vector3();
  private yaw = 0;
  private pitch = 0;
  private placed = false;
  private clock = 0;
  private roll = 0;
  /** Smoothed place in the frame (half-frame units) and its velocity: a critically damped spring. */
  private readonly at = { x: 0, y: 0 };
  private readonly vel = { x: 0, y: 0 };
  /** Which way along x it last swam (+1 right), and its smoothed speed (half-frames / s). */
  private across: 1 | -1 = 1;
  private speed = 0;
  private readonly place = { x: 0, y: 0 };
  /** Last scroll-driven place (before the idle wander) and its smoothed x velocity. */
  private lastBaseX = NaN;
  private baseVx = 0;

  constructor(u: FrameUniforms, kd: readonly [number, number, number], asset: ScanAsset, private readonly o: HeroEncounterOptions) {
    const g = oriented(asset, o.forward);
    const box = g.boundingBox!;
    const length = box.max.z - box.min.z;
    const height = box.max.y - box.min.y;
    const halfWidth = Math.max(box.max.x, -box.min.x);

    const p: ShaderNode = positionLocal;
    const phase: ShaderNode = this.phase as ShaderNode;
    let deformed: ShaderNode;
    if (o.style === 'hover') {
      // Ear fins (upper sides) flap up and down; the web (lower part) opens and closes.
      const up: ShaderNode = p.y.sub(box.min.y).div(height);
      const ears: ShaderNode = smoothstep(0.55, 0.85, up).mul(smoothstep(halfWidth * 0.25, halfWidth * 0.7, abs(p.x)));
      const flap: ShaderNode = sin(phase).mul(ears).mul(o.amplitude * height);
      const web: ShaderNode = float(1).add(sin(phase.mul(0.5).sub(1)).mul(0.1).mul(smoothstep(0.45, 0, up)));
      deformed = vec3(p.x.mul(web), p.y.add(flap).add(float(1).sub(web).mul(height * 0.6)), p.z.mul(web));
    } else {
      const fromHead: ShaderNode = float(box.max.z).sub(p.z).div(length).clamp(0, 1);
      const weight: ShaderNode =
        o.style === 'eel' ? fromHead.mul(0.85).add(0.15)
        : o.style === 'thunniform' ? smoothstep(0.6, 1, fromHead).pow(2)
        : o.style === 'fluke' ? smoothstep(0.35, 1, fromHead).pow(2)
        : smoothstep(0.25, 1, fromHead).pow(2);
      const waves = o.style === 'eel' ? 9 : o.style === 'thunniform' ? 2.5 : 4.5;
      const wave: ShaderNode = sin(phase.sub(fromHead.mul(waves))).mul(weight).mul(o.amplitude * length);
      // Whales beat the fluke up and down; fish sweep the tail side to side.
      deformed = o.style === 'fluke' ? vec3(p.x, p.y.add(wave), p.z) : vec3(p.x.add(wave), p.y, p.z);
    }

    const materials = asset.materials.map((am) => this.material(u, kd, asset, am));
    this.mesh = new Mesh(g, materials.length === 1 ? materials[0]! : materials);
    for (const m of materials) m.positionNode = deformed;
    this.mesh.name = o.species;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  private material(u: FrameUniforms, kd: readonly [number, number, number], asset: ScanAsset, am: AssetMaterial): MeshBasicNodeMaterial {
    const o = this.o;
    let albedo: ShaderNode = vec3(am.color.r, am.color.g, am.color.b);
    for (const map of [am.map, am.normalMap, am.emissiveMap]) if (map) map.anisotropy = 8;
    if (am.map) albedo = albedo.mul((texture(am.map, uv()) as ShaderNode).rgb);
    if (asset.vertexColors) albedo = albedo.mul(attribute('color', 'vec3'));
    if (o.tint) albedo = albedo.mul(vec3(...o.tint));
    // Painted normal detail (skin, scales), brought from view to world space.
    let n0: ShaderNode = normalize(normalWorld as ShaderNode);
    if (am.normalMap) n0 = normalize(vec4(normalMap(texture(am.normalMap, uv())) as ShaderNode, 0).mul(cameraViewMatrix).xyz);
    const normal: ShaderNode = n0.mul(step(0, dot(n0, (cameraPosition as ShaderNode).sub(positionWorld))).mul(2).sub(1));
    let emissive: ShaderNode | undefined;
    if (am.emissiveMap && o.glow) {
      const pulse: ShaderNode = sin((u.time as ShaderNode).mul(1.3)).mul(0.2).add(0.8);
      emissive = (texture(am.emissiveMap, uv()) as ShaderNode).rgb.mul(vec3(am.emissive.r, am.emissive.g, am.emissive.b)).mul(o.glow).mul(pulse).div(u.exposure as ShaderNode);
    }
    const m = new MeshBasicNodeMaterial({ side: DoubleSide });
    m.colorNode = underwaterLit(u, kd, {
      albedo,
      normal,
      roughness: float(o.roughness ?? 0.4),
      specular: float(o.specular ?? 0.5),
      rim: float(0.2),
      hero: float(o.light ?? 1),
      emissive,
    });
    return m;
  }

  /** 0 at the top of the band, 1 at the bottom. */
  private progress(depth: number): number {
    const [a, b] = this.o.encounter;
    return Math.min(1, Math.max(0, (depth - a) / (b - a)));
  }

  /** True while the camera is inside this scene's band. */
  active(depth: number): boolean {
    return depth >= this.o.encounter[0] && depth < this.o.encounter[1];
  }

  update(dt: number, camera: PerspectiveCamera): void {
    const { o } = this;
    const on = this.active(-camera.position.y);
    this.mesh.visible = on;
    if (!on) {
      this.placed = false;
      return;
    }
    this.clock += dt;
    const t = this.clock;
    const depth = -camera.position.y;
    camera.getWorldDirection(this.forward);
    // Placement is in the lens's own frame (pitch included), so the framing holds however the camera looks.
    this.view.copy(this.forward);
    this.viewRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.viewUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.set(-this.forward.z, 0, this.forward.x);

    // On a narrower screen than 16:9 it sits farther back so it keeps the same share of the width.
    const fit = Math.max(1, 16 / 9 / camera.aspect);
    const z = o.ahead * fit * (1 + 0.04 * Math.sin(t * 0.23));
    scenePlace(this.progress(depth), o.path, this.place);
    // Which way the scroll is carrying it decides which way it faces; the idle wander never does.
    if (!Number.isNaN(this.lastBaseX) && dt > 0) this.baseVx += ((this.place.x - this.lastBaseX) / dt - this.baseVx) * Math.min(1, dt * 12);
    this.lastBaseX = this.place.x;
    // Station-keeping while the scroll rests: a slow, small wander, as animals hang in the water.
    this.place.x += Math.sin(t * 0.29) * 0.025 + Math.sin(t * 0.71) * 0.01;
    this.place.y += Math.sin(t * 0.37 + 1) * 0.02;
    if (!this.placed) {
      this.offset.z = z + o.ahead * 0.5;
      this.at.x = this.place.x;
      this.at.y = this.place.y;
      this.vel.x = this.vel.y = 0;
      // Until it has been carried, face along its diagonal as if the camera were descending.
      this.across = o.path;
      this.lastBaseX = NaN;
      this.placed = true;
    }
    this.offset.z += (z - this.offset.z) * Math.min(1, dt * 1.5);
    // The animal follows its place on a critically damped spring: it keeps up with the scroll but
    // accelerates and slows like a body with mass instead of being dragged rigidly.
    const h = Math.min(dt, 0.05);
    for (const k of ['x', 'y'] as const) {
      const acc = SPRING * SPRING * (this.place[k] - this.at[k]) - 2 * SPRING * this.vel[k];
      this.vel[k] += acc * h;
      this.at[k] += this.vel[k] * h;
    }
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * this.offset.z;
    this.offset.x = this.at.x * halfH * camera.aspect;
    this.offset.y = this.at.y * halfH;
    this.position.copy(camera.position).addScaledVector(this.viewRight, this.offset.x).addScaledVector(this.viewUp, this.offset.y).addScaledVector(this.view, this.offset.z);
    this.mesh.position.copy(this.position);

    // Swim the way it is actually moving across the frame (screen-space velocity, aspect-corrected).
    const vx = this.vel.x * camera.aspect;
    const vy = this.vel.y;
    const v = Math.hypot(vx, vy);
    this.speed += (v - this.speed) * Math.min(1, dt * 3);
    if (Math.abs(this.baseVx) > 0.03) this.across = this.baseVx > 0 ? 1 : -1;
    const moving = Math.min(1, v / 0.15);
    // Yaw: along its travel, a little toward the lens; a hovering octopus keeps its face to the lens.
    const toward = o.style === 'hover' ? 1 : 0.3;
    const sideways = o.style === 'hover' ? this.across * 0.4 : this.across;
    const hx = this.right.x * sideways - this.forward.x * toward;
    const hz = this.right.z * sideways - this.forward.z * toward;
    let d = Math.atan2(hx, hz) - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // Steering is gentle (about 70°/s), but a reversal is a fast turn (~0.5 s for a half-turn, as
    // fish turn), so it is never carried tail-first for long when the scroll changes direction.
    const rate = Math.abs(d) > 1.2 ? 6.5 : 1.2;
    const turn = Math.max(-rate * dt, Math.min(rate * dt, d * Math.min(1, dt * (Math.abs(d) > 1.2 ? 8 : 2.5))));
    this.yaw += turn;
    this.roll += (Math.max(-0.5, Math.min(0.5, -(turn / Math.max(dt, 1e-3)) * 0.12)) - this.roll) * Math.min(1, dt * 4);
    // Pitch follows the climb or descent of its path (nose down going down), relaxing to level at rest.
    const climb = Math.atan2(vy, Math.max(Math.abs(vx), 0.05));
    const pitchGoal = Math.max(-0.55, Math.min(0.55, -climb)) * moving * (o.style === 'hover' ? 0.4 : 1);
    this.pitch += (pitchGoal - this.pitch) * Math.min(1, dt * 2);
    this.mesh.rotation.set(this.pitch + Math.sin(t * 0.31) * 0.03, this.yaw, this.roll + Math.sin(t * 0.43) * 0.04, 'YXZ');

    // Beat frequency rises with swimming speed (as tail-beat frequency does), with a resting scull.
    this.beat += dt * o.beatHz * (0.35 + 1.4 * Math.min(1.5, this.speed / 0.25)) * Math.PI * 2;
    this.phase.value = this.beat;
  }

  sighting(): SightingSource {
    return {
      species: this.o.species,
      nearest: (from, out, accept) => (this.mesh.visible && accept(this.position) ? (out.copy(this.position), this.position.distanceTo(from)) : Infinity),
    };
  }
}
