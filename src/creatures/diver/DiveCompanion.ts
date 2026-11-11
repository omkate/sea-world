import {
  AdditiveBlending,
  AnimationMixer,
  CircleGeometry,
  ConeGeometry,
  DoubleSide,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Bone,
  type Material,
  type PerspectiveCamera,
  type Scene,
  type Texture,
} from 'three/webgpu';
import { abs, cameraPosition, cameraViewMatrix, dot, float, normalMap, normalWorld, normalize, positionLocal, positionWorld, pow, smoothstep, step, texture, uniform, uv, vec3, vec4 } from 'three/tsl';
import type { ShaderNode, Uniform } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { AssetLibrary, RigAsset, ScanAsset } from '../../assets/AssetLibrary';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import { School } from '../../ecosystem/schooling/School';
import { forEachBigAnimal } from '../bigAnimals';
import { divePathX, divePathZ, reefFloorY } from '../../environments/reef/ReefSite';
import { DIVE_START_DEPTH } from '../../depth/diveCurve';
import { stepCriticalSpring, type Spring } from '../../depth/spring';
import { DIVER_RANGE, Embers, KING_RANGE, burnAway, formIn, kingMaterial, type KingUniforms } from './seaKing';

/** Deepest scuba dive on record (Ahmed Gabr, 2014). Below it the diver is artistic licence. */
export const SCUBA_RECORD = 332;
/** Depth (m) the head torch switches on. */
const TORCH_ON = 100;
/** Depth below which the diver's kicks set plankton glowing (a real, often-filmed effect). */
const WAKE_FROM = 400;
/**
 * The surface story, by camera depth (negative = above the sea): seated on the boat, the back-roll,
 * righting and swimming down to the lens; and, coming back up, swim to the boat, hang on the tube,
 * haul out over it and sit.
 */
const SEATED = -3.3;
/** Hand to mask and regulator, then the tucked back-roll. */
const READY = -2.85;
const ROLL_END = -1.2;
const SWIM_IN = 4;
/** Coming up: the safety stop (hover ~5 m, check the computer), then a slow ascent, hand overhead. */
const CLIMB_FROM = 9;
const STOP_IN = 7;
const STOP_OUT = 5;
const APPROACH = 1.5;
const HANG = 0.3;
const HAUL = -1.4;
const OVER = -2.6;
/** How far ahead of the starting lens the boat is moored (m). */
const BOAT_AHEAD = 8;
/** Torch glow and beam radiance, camera-adapted. */
const BULB_ADAPTED = 3;
const BEAM_ADAPTED = 0.045;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Clearance (m) the diver's body keeps from the reef: body radius plus a margin. */
const REEF_CLEARANCE = 0.9;
/** How quickly the reef push takes hold (rad/s) and lets go: a spring, never a jump. */
const PUSH_IN = 7;
const PUSH_OUT = 1.6;

/**
 * The reef surface smoothed over ~1 m (the wall's small rugged bumps would otherwise make the
 * push, and the diver with it, twitch as the scroll carries him past them).
 */
function smoothFloorY(x: number, z: number): number {
  const r = 0.9;
  return (reefFloorY(x, z) * 2 + reefFloorY(x + r, z) + reefFloorY(x - r, z) + reefFloorY(x, z + r) + reefFloorY(x, z - r)) / 6;
}

/** Approximate distance (m) from p to the (smoothed) reef surface, and the outward surface normal. */
function reefDistance(p: Vector3, normal: Vector3): number {
  const e = 1.2;
  const f = smoothFloorY(p.x, p.z);
  const gx = (smoothFloorY(p.x + e, p.z) - smoothFloorY(p.x - e, p.z)) / (2 * e);
  const gz = (smoothFloorY(p.x, p.z + e) - smoothFloorY(p.x, p.z - e)) / (2 * e);
  const k = Math.sqrt(1 + gx * gx + gz * gz);
  normal.set(-gx / k, 1 / k, -gz / k);
  // Height over the surface along the normal (exact for a plane; on the wall, the distance to its face).
  return (p.y - f) / k;
}

/** Where the diver swims in the frame (half-width / half-height units) and how far ahead (m). */
const SLOT = { x: 0.3, y: -0.26, z: 4.4 };

/**
 * Joint poses as offsets (degrees, local Euler) on the rig's rest pose, which is a horizontal swim
 * pose with straight legs and arms at the sides. Axes found by posing the rig: hips and shoulders
 * flex on −y, knees on +y.
 */
type Pose = Partial<Record<string, readonly [number, number, number]>>;
const POSED_BONES = ['l_leg_02', 'r_leg_062', 'l_knee_03', 'r_knee_063', 'l_shoulder_018', 'r_shoulder_040', 'l_elbow_019', 'r_elbow_041', 'spine1_013', 'neck_015'] as const;
const STRAIGHT: Pose = {};
/**
 * The rig's rest pose is a frozen flutter-kick frame, not symmetric: its sagittal angles (degrees,
 * + = toward the front of the body), measured per side [left, right]: thighs from the torso line,
 * knees as the shin's bend from the thigh (− = back), upper arms from the torso line, elbows as the
 * forearm's bend from the upper arm (+ = flexed). On every one of these joints a +y rotation turns
 * the limb toward the back, so a target angle maps to an offset of −(target − rest).
 */
const REST_ANGLES = { thigh: [-7.6, 28.4], knee: [-42, -40.6], arm: [-7.8, 7.3], elbow: [21, 11] } as const;
type Pair = number | readonly [number, number];
interface BodyAngles {
  thigh?: Pair;
  /** Thigh twist (x) and inward swing (z, − = toward the other leg): the rest frame's feet are turned out. */
  hipTwist?: number;
  hipIn?: number;
  knee?: Pair;
  arm?: Pair;
  elbow?: Pair;
  spine?: number;
  neck?: number;
}

/** A pose from plain body angles (see REST_ANGLES), the same for both sides unless given as [left, right]. */
function body(b: BodyAngles): Pose {
  const both = (v: Pair): readonly [number, number] => (typeof v === 'number' ? [v, v] : v);
  const off = (target: number, rest: number): readonly [number, number, number] => [0, -(target - rest), 0];
  const p: Record<string, readonly [number, number, number]> = {};
  const sides = (v: Pair | undefined, rest: readonly [number, number], left: string, right: string) => {
    if (v === undefined) return;
    const [l, r] = both(v);
    p[left] = off(l, rest[0]);
    p[right] = off(r, rest[1]);
  };
  sides(b.thigh, REST_ANGLES.thigh, 'l_leg_02', 'r_leg_062');
  if (b.thigh !== undefined && (b.hipTwist || b.hipIn)) {
    for (const leg of ['l_leg_02', 'r_leg_062']) p[leg] = [b.hipTwist ?? 0, p[leg]![1], b.hipIn ?? 0];
  }
  sides(b.knee, REST_ANGLES.knee, 'l_knee_03', 'r_knee_063');
  sides(b.arm, REST_ANGLES.arm, 'l_shoulder_018', 'r_shoulder_040');
  sides(b.elbow, REST_ANGLES.elbow, 'l_elbow_019', 'r_elbow_041');
  if (b.spine !== undefined) p.spine1_013 = [0, b.spine, 0];
  if (b.neck !== undefined) p.neck_015 = [0, b.neck, 0];
  return p;
}

/** Seated on the tube: upright (the rig's swim arch taken out of spine and neck), shins down, fins on the floor, hands resting toward the knees. */
const SEATED_BODY: BodyAngles = { thigh: 88, knee: -88, hipTwist: 25, hipIn: -10, arm: 22, elbow: 52, spine: -15, neck: -22 };
const SIT: Pose = body(SEATED_BODY);
/** Ready to roll: right hand holding mask and regulator to the face, left forearm across the chest (holding the gauges). */
const READY_ARMS: BodyAngles = { arm: [50, 62], elbow: [105, 112] };
const READY_POSE: Pose = body({ ...SEATED_BODY, ...READY_ARMS });
/** The back-roll: knees to the chest, hands still on the mask. */
const TUCK: Pose = body({ ...SEATED_BODY, ...READY_ARMS, thigh: 120, knee: -125 });
/** Safety stop: hovering, left wrist raised before the mask to read the dive computer, knees softly bent. */
const STOP: Pose = body({ thigh: 10, knee: -55, arm: [70, 5], elbow: [85, 18] });
/** Final ascent: right hand up over the head (protecting it from the boat), left arm along the body, slow kicks. */
const ASCEND: Pose = body({ thigh: 10, knee: -40, arm: [5, 170], elbow: [18, 20] });
/** Reaching up for the tube, both hands. */
const REACH: Pose = body({ thigh: 15, knee: -35, arm: 140, elbow: 15 });
/** Pushing down on the tube to haul out. */
const PUSH: Pose = body({ thigh: 40, knee: -60, arm: 35, elbow: 20 });
/** The diver standing upright in the water as the crown comes to him (matches the king's stance). */
const STAND: Pose = body({ thigh: 2, knee: -6, arm: 6, elbow: 14 });
/** Swimming: arms held still along the body, as divers swim (the kick does the work). */
const SWIM_ARMS: Pose = body({ arm: 3, elbow: 14 });
const ARM_BONES = ['l_shoulder_018', 'r_shoulder_040', 'l_elbow_019', 'r_elbow_041'] as const;
/** The king's idle plays slowed, as if in the water's resistance; he turns to face the lens like a portrait. */
const KING_IDLE_SPEED = 0.45;
const KING_TURN = 1.2;
/** The king model faces its local −z. */
const KING_FRONT = Math.PI;
/** How far beyond the head bone (along the spine) the crown sits: the top of the head (m). */
const CROWN_ON_HEAD = 0.2;
/** Kneeling on the tube while hauling out. */
const KNEEL: Pose = body({ thigh: 100, knee: -120, arm: 20, elbow: 30 });

/**
 * The rest of the dive group, seated on the tubes (boat-local position, facing in), hands resting
 * toward their knees (each a touch differently), breathing quietly (BoatTalk).
 * The lead diver's seat is the port tube amidships (−0.8, 0.95, 0.35).
 */
const CREW: readonly { at: readonly [number, number, number]; yaw: number; pose: Pose }[] = [
  { at: [-0.8, 0.95, -0.95], yaw: Math.PI / 2, pose: body({ ...SEATED_BODY, arm: [20, 24], elbow: [50, 55] }) },
  { at: [0.8, 0.95, 0.5], yaw: -Math.PI / 2, pose: body({ ...SEATED_BODY, arm: [24, 20], elbow: [56, 48] }) },
  { at: [0.8, 0.95, -0.8], yaw: -Math.PI / 2, pose: body({ ...SEATED_BODY, arm: 22, elbow: 52 }) },
];

/** Where the lead diver sits on the boat (boat-local) and which way he faces. */
const LEAD_SEAT = { at: [-0.8, 0.95, 0.35] as const, yaw: Math.PI / 2 };
/** Bones the conversation moves, on top of each diver's seated pose. */
const TALK_BONES = ['spine1_013'] as const;
type TalkOffsets = Record<(typeof TALK_BONES)[number], [number, number, number]>;

/**
 * The group on the boat at rest while they wait: heads stay in their seated pose (any head motion
 * read as unnatural), and the torso only breathes, very slightly, each diver at his own rhythm; the
 * boat's own rocking on the swell does the rest. Offsets are Euler degrees on the rig's own axes
 * (spine y is a slight forward lean).
 */
class BoatTalk {
  constructor(private readonly seats: readonly { at: readonly [number, number, number]; yaw: number }[]) {}

  /** Offsets for every diver at time `t` (s). */
  update(t: number, _dt: number, out: TalkOffsets[]): void {
    this.seats.forEach((_, i) => {
      const o = out[i]!;
      for (const b of TALK_BONES) o[b] = [0, 0, 0];
      o.spine1_013 = [0, Math.sin(t * (1.1 + i * 0.07) + i * 1.7) * 0.8, 0];
    });
  }
}

/** A full diver state: place, orientation, how much the pose overrides the swim cycle, and the pose. */
interface DiverState {
  pos: Vector3;
  quat: Quaternion;
  poseWeight: number;
  pose: Map<string, [number, number, number]>;
}

function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out: Record<string, [number, number, number]> = {};
  for (const name of POSED_BONES) {
    const x = a[name] ?? [0, 0, 0];
    const y = b[name] ?? [0, 0, 0];
    out[name] = [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  }
  return out;
}

function newState(): DiverState {
  return { pos: new Vector3(), quat: new Quaternion(), poseWeight: 0, pose: new Map() };
}

function setPose(s: DiverState, p: Pose, weight: number): void {
  s.poseWeight = weight;
  for (const name of POSED_BONES) {
    const v = p[name] ?? [0, 0, 0];
    s.pose.set(name, [v[0], v[1], v[2]]);
  }
}

function blendStates(a: DiverState, b: DiverState, t: number, out: DiverState): DiverState {
  out.pos.lerpVectors(a.pos, b.pos, t);
  out.quat.slerpQuaternions(a.quat, b.quat, t);
  // A pose only counts as much as its weight, so a posed state blends cleanly with a swimming one.
  out.poseWeight = lerp(a.poseWeight, b.poseWeight, t);
  for (const name of POSED_BONES) {
    const x = a.pose.get(name) ?? [0, 0, 0];
    const y = b.pose.get(name) ?? [0, 0, 0];
    const wa = a.poseWeight * (1 - t), wb = b.poseWeight * t;
    const w = Math.max(wa + wb, 1e-6);
    out.pose.set(name, [(x[0] * wa + y[0] * wb) / w, (x[1] * wa + y[1] * wb) / w, (x[2] * wa + y[2] * wb) / w]);
  }
  return out;
}

/** Orientation from a heading yaw and a pitch (+ = head down), with roll. */
const EUL = new Euler(0, 0, 0, 'YXZ');
function orient(out: Quaternion, yaw: number, pitch: number, roll = 0): Quaternion {
  EUL.set(pitch, yaw, roll, 'YXZ');
  return out.setFromEuler(EUL);
}

/** Light-cone material for the head torch (drawn in the additive particle layer). */
function beamMaterial(u: FrameUniforms, strength: Uniform<number>, length: number): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  const along: ShaderNode = (positionLocal as ShaderNode).z.div(length).clamp(0, 1);
  const n: ShaderNode = normalize(normalWorld as ShaderNode);
  const v: ShaderNode = normalize((cameraPosition as ShaderNode).sub(positionWorld));
  // Brightest along the axis as seen from the lens, fading from the lamp out into the water.
  const core: ShaderNode = pow(abs(dot(n, v)), 2);
  const fade: ShaderNode = smoothstep(0, 0.08, along).mul(float(1).sub(along).pow(1.6));
  m.colorNode = vec3(1, 0.93, 0.8).mul(core.mul(fade)).mul((strength as ShaderNode).mul(BEAM_ADAPTED)).div(u.exposure as ShaderNode);
  return m;
}

/** A cone with its apex at the origin opening along +z. */
function beamGeometry(length: number, radius: number): ConeGeometry {
  const g = new ConeGeometry(radius, length, 32, 6, true);
  g.translate(0, -length / 2, 0);
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * A model's own materials rebuilt with the underwater lighting (shallow subject light, deep hero
 * rig). Below 130 m it also takes the torch and the crown's glow (the finale's props use it too).
 */
export function companionMaterial(
  u: FrameUniforms,
  kd: readonly [number, number, number],
  src: { color?: { r: number; g: number; b: number }; map?: Texture | null; normalMap?: Texture | null },
  look: { tint?: number; roughness?: number; specular?: number; hero?: number } = {},
): MeshBasicNodeMaterial {
  let albedo: ShaderNode = src.color ? vec3(src.color.r, src.color.g, src.color.b) : vec3(1, 1, 1);
  if (src.map) albedo = albedo.mul((texture(src.map, uv()) as ShaderNode).rgb);
  if (look.tint) albedo = albedo.mul(look.tint).min(0.9);
  let n0: ShaderNode = normalize(normalWorld as ShaderNode);
  if (src.normalMap) n0 = normalize(vec4(normalMap(texture(src.normalMap, uv())) as ShaderNode, 0).mul(cameraViewMatrix).xyz);
  const normal: ShaderNode = n0.mul(step(0, dot(n0, (cameraPosition as ShaderNode).sub(positionWorld))).mul(2).sub(1));
  const m = new MeshBasicNodeMaterial({ side: DoubleSide });
  m.colorNode = underwaterLit(u, kd, {
    albedo,
    normal,
    roughness: float(look.roughness ?? 0.45),
    specular: float(look.specular ?? 0.5),
    rim: float(0.3),
    // The subject light undoes the water between lens and diver: none when the lens is above the sea.
    subject: smoothstep(-0.3, 0.3, u.cameraDepth as ShaderNode),
    // Below the shallows the diver is lit like the deep heroes (as an ROV films a diver).
    hero: smoothstep(60, 220, u.cameraDepth as ShaderNode).mul(look.hero ?? 0.55),
    torch: true,
  });
  return m;
}

/** Bubbles exhaled by the diver: a burst every breath, rising and wobbling, larger ones faster. */
class Bubbles {
  readonly mesh: InstancedMesh;
  private readonly pos: Vector3[] = [];
  private readonly vel: number[] = [];
  private readonly size: number[] = [];
  private readonly age: number[] = [];
  private readonly phase: number[] = [];
  private next = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  constructor(u: FrameUniforms, torch: Uniform<number>, private readonly max = 260) {
    const mat = new MeshBasicNodeMaterial();
    const n: ShaderNode = normalize(normalWorld as ShaderNode);
    const v: ShaderNode = normalize((cameraPosition as ShaderNode).sub(positionWorld));
    // A bubble is a mirror: a bright silver rim from the water above, dark through the middle.
    const rim: ShaderNode = pow(float(1).sub(abs(dot(n, v))), 2);
    const sky: ShaderNode = (u.waterAboveColor as ShaderNode).mul(float(0.5).add(rim.mul(4)));
    const lit: ShaderNode = vec3(1, 0.95, 0.85).mul(rim.mul(0.8).add(0.1)).mul((torch as ShaderNode).mul(1.5)).div(u.exposure as ShaderNode);
    mat.colorNode = sky.add(lit);
    this.mesh = new InstancedMesh(new IcosahedronGeometry(1, 2), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < max; i++) {
      this.pos.push(new Vector3());
      this.vel.push(0);
      this.size.push(0);
      this.age.push(Infinity);
      this.phase.push(Math.random() * 6.28);
    }
  }

  emit(at: Vector3, n: number, spread: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const r = 0.003 + Math.random() ** 2.5 * 0.02;
      this.size[i] = r;
      this.pos[i]!.set(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread);
      // Rise speed grows with size (small bubbles ~0.2 m/s, large ~0.5 m/s).
      this.vel[i] = 0.18 + r * 16 + Math.random() * 0.05;
      this.age[i] = 0;
    }
  }

  update(dt: number, time: number): void {
    let count = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i]! > 9) continue;
      this.age[i]! += dt;
      const p = this.pos[i]!;
      p.y += this.vel[i]! * dt;
      // Larger bubbles wobble as they rise.
      const w = this.size[i]! * 6;
      p.x += Math.sin(time * 7 + this.phase[i]!) * w * dt;
      p.z += Math.cos(time * 6 + this.phase[i]!) * w * dt;
      // They burst at the surface.
      if (p.y > -0.05) {
        this.age[i] = Infinity;
        continue;
      }
      const r = this.size[i]!;
      // Large bubbles flatten into caps.
      this.s.set(r, r * (r > 0.012 ? 0.6 : 1), r);
      this.m.compose(p, this.q, this.s);
      this.mesh.setMatrixAt(count++, this.m);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** The splash of a diver entering the sea: sunlit spray thrown up and out, and a foam ring that spreads and fades. */
class Splash {
  readonly drops: InstancedMesh;
  readonly foam: Mesh;
  private readonly pos: Vector3[] = [];
  private readonly vel: Vector3[] = [];
  private readonly age: number[] = [];
  private readonly size: number[] = [];
  private readonly ring: Uniform<number> = uniform(0) as Uniform<number>;
  private ringAge = Infinity;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  constructor(u: FrameUniforms, kd: readonly [number, number, number], private readonly max = 180) {
    const mat = new MeshBasicNodeMaterial();
    mat.colorNode = underwaterLit(u, kd, { albedo: vec3(0.9, 0.95, 1), normal: normalWorld, roughness: float(0.1), specular: float(0.8) });
    this.drops = new InstancedMesh(new IcosahedronGeometry(1, 1), mat, max);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    for (let i = 0; i < max; i++) {
      this.pos.push(new Vector3());
      this.vel.push(new Vector3());
      this.age.push(Infinity);
      this.size.push(0);
    }
    // Foam: a flat ring on the water, white, fading from the inside out as it spreads.
    const foamMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const r: ShaderNode = (positionLocal as ShaderNode).xy.length();
    const life: ShaderNode = this.ring as ShaderNode;
    foamMat.colorNode = underwaterLit(u, kd, { albedo: vec3(0.92, 0.95, 0.97), normal: vec3(0, 1, 0), roughness: float(0.6), specular: float(0.2) });
    foamMat.opacityNode = smoothstep(0.2, 0.7, r).mul(smoothstep(1, 0.85, r)).mul(float(1).sub(life)).mul(0.85);
    this.foam = new Mesh(new CircleGeometry(1, 48), foamMat);
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.visible = false;
    this.foam.frustumCulled = false;
  }

  burst(at: Vector3): void {
    for (let i = 0; i < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 1.5 + Math.random() * 3.2;
      const out = 0.6 + Math.random() * 1.8;
      this.pos[i]!.copy(at).add(this.s.set(Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3));
      this.vel[i]!.set(Math.cos(a) * out, up, Math.sin(a) * out);
      this.size[i] = 0.01 + Math.random() ** 2 * 0.035;
      this.age[i] = Math.random() * 0.1;
    }
    this.ringAge = 0;
    this.foam.position.copy(at);
    this.foam.visible = true;
  }

  update(dt: number, surface: (x: number, z: number) => number): void {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i]! > 2) continue;
      this.age[i]! += dt;
      const p = this.pos[i]!;
      const v = this.vel[i]!;
      v.y -= 9.81 * dt;
      p.addScaledVector(v, dt);
      if (p.y < surface(p.x, p.z) - 0.05) {
        this.age[i] = Infinity;
        continue;
      }
      const r = this.size[i]!;
      this.s.set(r, r * 1.6, r);
      this.m.compose(p, this.q, this.s);
      this.drops.setMatrixAt(n++, this.m);
    }
    this.drops.count = n;
    this.drops.instanceMatrix.needsUpdate = true;
    if (this.ringAge < 4) {
      this.ringAge += dt;
      const t = this.ringAge / 4;
      this.ring.value = t;
      this.foam.scale.setScalar(0.6 + Math.sqrt(t) * 2.6);
      this.foam.position.y = surface(this.foam.position.x, this.foam.position.z) + 0.02;
    } else this.foam.visible = false;
  }
}

/**
 * The dive companion: a scuba diver who waits on the dive boat, back-rolls in as the scroll starts
 * and leads the whole descent, followed by the camera, swimming the way the camera travels (along
 * the reef, straight down the wall), kicking harder the faster the scroll. Coming back up, the
 * diver swims to the boat, hangs on the side tube, hauls out over it and sits. Fish part around
 * the diver and big animals are given room (the diver keeps its own line and does not turn to
 * look at them), and in the deep every kick sets the plankton glowing.
 */
export class DiveCompanion {
  readonly group = new Group();
  private readonly diver: Group;
  private readonly mixer: AnimationMixer;
  private readonly bones = new Map<string, { bone: Bone; rest: Quaternion }>();
  private readonly head: Bone | null;
  private readonly bubbles: Bubbles;
  private readonly torch: Uniform<number> = uniform(0) as Uniform<number>;
  private readonly bulb: Mesh;
  private readonly beam: Mesh;
  private torchLevel = 0;
  private readonly boat: Group;
  private boatAnchor: Vector3 | null = null;
  private boatYaw = 0;
  /** Unit vector from the seat out over the side (world, horizontal), and the inward heading. */
  private readonly outward = new Vector3();
  private inward = 0;
  private readonly faceDir = new Vector3();
  private readonly backDir = new Vector3();
  private readonly rootPos = new Vector3();
  private rootBone: Bone | null = null;
  /** The finale's transformation (see seaKing.ts) and what comes with it. */
  private readonly king: KingUniforms = { sweep: uniform(0) as Uniform<number> };
  private readonly tridentForm: Uniform<number> = uniform(0) as Uniform<number>;
  private readonly embers: Embers;
  private readonly trident: Mesh;
  private readonly tq = new Quaternion();
  private readonly yAxis = new Vector3(0, 1, 0);
  private readonly tAxis = new Vector3();
  private readonly kingRoot: Group;
  private readonly kingMixer: AnimationMixer;
  private readonly kingHand: Bone | null;
  private readonly kingHead: Bone | null;
  private kingYaw = NaN;
  private readonly spine = new Vector3(0, 1, 0);
  private readonly view = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly flatFwd = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly tmp3 = new Vector3();
  private readonly headPos = new Vector3();
  private readonly lastCam = new Vector3();
  private readonly camVel = new Vector3();
  private haveCam = false;
  /** 1 while the scroll is carrying the dive up (the climb-out path), 0 going down (the jump). */
  private climbing = 0;
  private climbGoal = 0;
  /** Deepest (descending) or shallowest (climbing) depth since the last change of direction. */
  private turnDepth = NaN;
  private readonly push = { x: 0, y: 0 };
  private yaw = 0;
  private pitch = 0;
  private breath = 0;
  private wasUnder = false;
  private readonly splash: Splash;
  private time = 0;
  private readonly sJump = newState();
  private readonly sClimb = newState();
  private readonly sSwim = newState();
  private readonly sOut = newState();
  private readonly sFinale = newState();
  private readonly sMix = newState();
  /** Offset that keeps the body out of the reef, and the head's offset from the body centre. */
  private readonly reefPush = new Vector3();
  private readonly reefGoal = new Vector3();
  private armHold = 0;
  /** The conversation on the boat: the lead diver (seat 0) and the crew. */
  private readonly talk = new BoatTalk([LEAD_SEAT, ...CREW]);
  private readonly talkOffsets: TalkOffsets[] = [LEAD_SEAT, ...CREW].map(() => ({}) as TalkOffsets);
  private readonly crewBones: Map<string, { bone: Bone; base: Quaternion }>[] = [];
  private readonly pushSprings: Spring[] = [{ value: 0, velocity: 0 }, { value: 0, velocity: 0 }, { value: 0, velocity: 0 }];
  private readonly bodyAxis = new Vector3(0, 0.85, 0);
  private readonly probe = new Vector3();
  private readonly probeN = new Vector3();
  /** The wreck finale's hold on the diver: weight, place and heading on its path (world). */
  private readonly finale = {
    weight: 0,
    pos: new Vector3(),
    dir: new Vector3(0, 0, 1),
    last: new Vector3(),
    speed: 0,
    have: false,
    /** +1 swimming along the path, −1 when the scroll runs it backwards (the diver turns round). */
    sense: 1,
    facing: new Quaternion(),
    goal: new Quaternion(),
    started: false,
    sweep: 0,
    upright: 0,
    trident: 0,
    /** Heading (rad), kept while the path runs mostly up or down; and the heading actually used. */
    yaw: 0,
    faceYaw: 0,
  };
  private readonly seat = new Vector3();
  private readonly seatQuat = new Quaternion();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly qe = new Quaternion();
  private readonly e = new Euler();

  static async create(
    u: FrameUniforms,
    kd: readonly [number, number, number],
    library: AssetLibrary,
    particleScene: Scene,
    surface: (x: number, z: number) => number,
  ): Promise<DiveCompanion> {
    const [rig, king] = await Promise.all([library.loadRig('scuba-diver'), library.loadRig('seaking'), library.load(['dive-boat', 'trident'])]);
    return new DiveCompanion(u, kd, rig, king, library.get('dive-boat'), library.get('trident'), particleScene, surface);
  }

  private constructor(
    private readonly u: FrameUniforms,
    kd: readonly [number, number, number],
    rig: RigAsset,
    kingRig: RigAsset,
    boatAsset: ScanAsset,
    tridentAsset: ScanAsset,
    particleScene: Scene,
    private readonly surface: (x: number, z: number) => number,
  ) {
    this.group.name = 'dive-companion';
    this.diver = rig.root;
    let head: Bone | null = null;
    this.diver.traverse((o) => {
      const bone = o as Bone;
      if (bone.isBone) {
        if (/^head/i.test(o.name)) head = bone;
        if (o.name === 'Root_01') this.rootBone = bone;
        if ((POSED_BONES as readonly string[]).includes(o.name)) this.bones.set(o.name, { bone, rest: bone.quaternion.clone() });
      }
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as Material & { color?: { r: number; g: number; b: number }; map?: Texture | null; normalMap?: Texture | null };
      // In the finale the diver burns away behind the sweep as the king forms in his place.
      mesh.material = burnAway(u, companionMaterial(u, kd, src), this.king, DIVER_RANGE);
      mesh.frustumCulled = false;
    });
    this.head = head;
    this.mixer = new AnimationMixer(this.diver);
    if (rig.animations[0]) this.mixer.clipAction(rig.animations[0]).play();
    this.group.add(this.diver);

    // The dive boat (an inflatable), floating on the waves.
    // Grey hypalon tubes with a wet sheen (the scan's rubber is painted near-black).
    const mats = boatAsset.materials.map((m) => companionMaterial(u, kd, m, { tint: 6, roughness: 0.3, specular: 0.7 }));
    const hull = new Mesh(boatAsset.geometry, mats.length === 1 ? mats[0]! : mats);
    hull.frustumCulled = false;
    this.boat = new Group();
    this.boat.name = 'dive-boat';
    this.boat.add(hull);
    this.boat.visible = false;
    this.group.add(this.boat);
    // The rest of the group, seated on the tubes; they ride with the boat and stay aboard.
    for (const c of CREW) {
      const mate = cloneRig(this.diver) as Group;
      const bones = new Map<string, { bone: Bone; base: Quaternion }>();
      mate.traverse((o) => {
        const bone = o as Bone;
        const e = bone.isBone ? c.pose[o.name] : undefined;
        if (e) bone.quaternion.multiply(this.qe.setFromEuler(this.e.set((e[0] * Math.PI) / 180, (e[1] * Math.PI) / 180, (e[2] * Math.PI) / 180)));
        if (bone.isBone && (TALK_BONES as readonly string[]).includes(o.name)) bones.set(o.name, { bone, base: bone.quaternion.clone() });
        if ((o as Mesh).isMesh) o.frustumCulled = false;
      });
      this.crewBones.push(bones);
      mate.position.set(c.at[0], c.at[1], c.at[2]);
      orient(mate.quaternion, c.yaw, (-84 * Math.PI) / 180);
      this.boat.add(mate);
    }

    this.bubbles = new Bubbles(u, this.torch);
    this.group.add(this.bubbles.mesh);
    this.splash = new Splash(u, kd);
    this.group.add(this.splash.drops, this.splash.foam);

    // Head torch: a bright lens on the mask strap, and its beam in the water.
    const bulbMat = new MeshBasicNodeMaterial();
    bulbMat.colorNode = vec3(1, 0.95, 0.85).mul((this.torch as ShaderNode).mul(BULB_ADAPTED)).div(u.exposure as ShaderNode);
    this.bulb = new Mesh(new SphereGeometry(0.035, 12, 8), bulbMat);
    this.group.add(this.bulb);
    this.beam = new Mesh(beamGeometry(7, 0.9), beamMaterial(u, this.torch, 7));
    this.beam.frustumCulled = false;
    particleScene.add(this.beam);

    this.embers = new Embers(u);
    this.group.add(this.embers.mesh);

    // The king of the sea, formed behind the sweep where the diver was.
    this.kingRoot = kingRig.root;
    let hand: Bone | null = null;
    let crownHead: Bone | null = null;
    this.kingRoot.traverse((o) => {
      // three.js sanitises node names (spaces become underscores, the rig names carry stray spaces).
      if ((o as Bone).isBone && /R[ _]Hand/.test(o.name)) hand = o as Bone;
      if ((o as Bone).isBone && /(^|[ _])Head/.test(o.name) && !crownHead) crownHead = o as Bone;
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as Material & { color?: { r: number; g: number; b: number }; map?: Texture | null; normalMap?: Texture | null };
      mesh.material = formIn(u, kingMaterial(u, kd, src), this.king, KING_RANGE);
      mesh.frustumCulled = false;
    });
    this.kingHand = hand;
    this.kingHead = crownHead;
    this.kingMixer = new AnimationMixer(this.kingRoot);
    const idle = kingRig.animations.find((a) => /idle/i.test(a.name)) ?? kingRig.animations[0];
    if (idle) this.kingMixer.clipAction(idle).play();
    this.kingMixer.timeScale = KING_IDLE_SPEED;
    this.kingRoot.visible = false;
    this.group.add(this.kingRoot);
    // The trident: gold, forming from its butt to its tines as it appears in his hand.
    const tAlbedo: ShaderNode = (tridentAsset.map ? (texture(tridentAsset.map, uv()) as ShaderNode).rgb : vec3(1, 1, 1)).mul(vec3(1, 0.78, 0.4));
    const along: ShaderNode = (positionLocal as ShaderNode).y.div(2.4);
    const formed: ShaderNode = step(along, this.tridentForm as ShaderNode);
    const front: ShaderNode = float(1).sub(smoothstep(0, 0.06, (this.tridentForm as ShaderNode).sub(along))).mul(formed).mul(step(this.tridentForm as ShaderNode, 0.999));
    const tMat = new MeshBasicNodeMaterial();
    tMat.colorNode = underwaterLit(u, kd, {
      albedo: tAlbedo,
      normal: normalWorld,
      roughness: float(0.22),
      specular: float(1),
      rim: float(0.4),
      hero: float(0.5),
      torch: true,
      emissive: vec3(1, 0.78, 0.4).mul(front.mul(3).add(0.04)).div(u.exposure as ShaderNode),
    });
    tMat.opacityNode = formed;
    tMat.alphaTestNode = float(0.5);
    this.trident = new Mesh(tridentAsset.geometry, tMat);
    this.trident.name = 'trident';
    this.trident.frustumCulled = false;
    this.trident.visible = false;
    this.group.add(this.trident);
  }

  /**
   * The diver is placed in the lens's frame, which knows nothing of the reef: on the drop-off or
   * beside the wall the slot can fall inside the rock. Head, body and fins are each kept
   * REEF_CLEARANCE from the (smoothed) surface by pushing out along its normal. The push follows
   * a critically damped spring: quick to take hold, slow to let go, so it never jumps.
   */
  private keepClearOfReef(dt: number): void {
    const c = this.diver.position;
    if (c.y > -1.5) {
      for (const s of this.pushSprings) s.value = s.velocity = 0;
      return;
    }
    this.reefGoal.set(0, 0, 0);
    for (let pass = 0; pass < 2; pass++) {
      for (const k of [0, 1, -1.15]) {
        this.probe.copy(c).add(this.reefGoal).addScaledVector(this.bodyAxis, k);
        const d = reefDistance(this.probe, this.probeN);
        if (d < REEF_CLEARANCE) this.reefGoal.addScaledVector(this.probeN, REEF_CLEARANCE - d);
      }
    }
    (['x', 'y', 'z'] as const).forEach((a, i) => {
      const s = this.pushSprings[i]!;
      const goal = this.reefGoal[a];
      stepCriticalSpring(s, goal, Math.abs(goal) > Math.abs(s.value) ? PUSH_IN : PUSH_OUT, dt);
      this.reefPush.setComponent(i, s.value);
    });
    c.add(this.reefPush);
  }

  /** Frame basis of the lens, and a flat forward for headings. */
  private basis(camera: PerspectiveCamera): void {
    camera.getWorldDirection(this.view);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.flatFwd.set(this.view.x, 0, this.view.z).normalize();
  }

  /** World point at a frame slot (x, y in half-frame units at distance z). */
  private place(camera: PerspectiveCamera, x: number, y: number, z0: number, out: Vector3): Vector3 {
    const z = z0 * Math.max(1, 16 / 9 / camera.aspect);
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * z;
    return out.copy(camera.position).addScaledVector(this.view, z).addScaledVector(this.right, x * halfH * camera.aspect).addScaledVector(this.up, y * halfH);
  }

  /**
   * Push (frame units) away from any big animal that would overlap the diver on screen. The diver
   * only gives way: it keeps swimming its own line and never turns to look at the animal (turning
   * toward each one read as the diver lagging behind the scroll).
   */
  private avoid(camera: PerspectiveCamera, dt: number): void {
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    let px = 0;
    let py = 0;
    forEachBigAnimal((p, r, yields) => {
      this.tmp.subVectors(p, camera.position);
      const z = this.tmp.dot(this.view);
      if (z < 0.5) return;
      const sx = this.tmp.dot(this.right) / (z * tanH * camera.aspect);
      const sy = this.tmp.dot(this.up) / (z * tanH);
      // Animals that steer around the diver themselves need no room.
      if (yields) return;
      const sr = r / (z * tanH);
      const dx = SLOT.x + this.push.x - sx;
      const dy = SLOT.y + this.push.y - sy;
      const d = Math.hypot(dx, dy * 1.4);
      const clear = sr + 0.28;
      if (d < clear) {
        const k = (clear - d) / Math.max(d, 0.05);
        px += dx * k;
        py += dy * k;
      }
    });
    // Ease the push (it gives way smoothly), capped so the diver stays in frame.
    const gx = px === 0 ? 0 : Math.max(-0.35, Math.min(0.35, this.push.x + px * 0.5));
    const gy = py === 0 ? 0 : Math.max(-0.2, Math.min(0.25, this.push.y + py * 0.5));
    this.push.x += (gx - this.push.x) * Math.min(1, dt * (px === 0 ? 0.6 : 2));
    this.push.y += (gy - this.push.y) * Math.min(1, dt * (py === 0 ? 0.6 : 2));
  }

  /** Turns `current` toward `target` (radians), quickly for big changes (a reversal). */
  private static turn(current: number, target: number, dt: number): number {
    const d = wrap(target - current);
    const rate = Math.abs(d) > 1.2 ? 4 : 1.4;
    return current + Math.max(-rate * dt, Math.min(rate * dt, d * Math.min(1, dt * 3)));
  }

  /** The dive boat, moored where the dive starts, rocking on the waves. */
  private updateBoat(depth: number): void {
    const boat = this.boat;
    if (!this.boatAnchor) {
      // Moored ahead of where the dive starts (the lens looks along −z at the surface): far enough
      // that the camera, which closes ~4 m on it by the waterline, still sees it whole.
      const start = DIVE_START_DEPTH;
      this.boatAnchor = new Vector3(divePathX(start) + 1.6, 0, divePathZ(start) - BOAT_AHEAD);
      // Bow toward the lens and turned a little, so the diver on the far tube is seen in profile.
      this.boatYaw = Math.PI + 0.55;
    }
    const a = this.boatAnchor;
    boat.visible = depth < 40;
    const h = this.surface(a.x, a.z);
    // Pitch and roll follow the wave slope under the hull.
    const sx = (this.surface(a.x + 1, a.z) - this.surface(a.x - 1, a.z)) / 2;
    const sz = (this.surface(a.x, a.z + 1) - this.surface(a.x, a.z - 1)) / 2;
    // Floating with the tubes half under: the waterline runs along their middle.
    boat.position.set(a.x, h - 0.42, a.z);
    boat.rotation.set(Math.atan(sz) * 0.6, this.boatYaw, -Math.atan(sx) * 0.6, 'YXZ');
    boat.updateMatrixWorld(true);
    // The seat: on top of the port tube, facing in (back to the sea), rocking with the boat.
    this.seat.set(-0.8, 0.95, 0.35).applyMatrix4(boat.matrixWorld);
    this.outward.set(-1, 0, 0).transformDirection(boat.matrixWorld).setY(0).normalize();
    this.inward = Math.atan2(-this.outward.x, -this.outward.z);
    // Seated upright with a slight forward lean, breathing and rocking with the boat.
    orient(this.q, Math.PI / 2 + Math.sin(this.time * 0.4) * 0.06, (-84 * Math.PI) / 180 + Math.sin(this.time * 1.1) * 0.015);
    this.seatQuat.copy(boat.quaternion).multiply(this.q);
  }

  /** Where the diver is while swimming with the camera. */
  private swimState(camera: PerspectiveCamera, dt: number, t: number, out: DiverState): void {
    // Heading follows the camera's actual travel: along the reef it swims level, down the wall
    // it swims head-down, coming back up head-up; at rest it keeps its heading and hangs level.
    const v = this.camVel;
    const speed = v.length();
    const flat = Math.hypot(v.x, v.z);
    if (speed > 0.25) {
      if (flat > 0.25 * speed) this.yaw = DiveCompanion.turn(this.yaw, Math.atan2(v.x, v.z), dt);
      else this.yaw = DiveCompanion.turn(this.yaw, Math.atan2(this.flatFwd.x, this.flatFwd.z) + 0.5, dt);
    }
    const climb = speed > 0.25 ? Math.atan2(-v.y, Math.max(flat, 0.4)) : 0;
    const pitchGoal = Math.max(-1.1, Math.min(1.1, climb)) * Math.min(1, speed / 1.5) + 0.1;
    const yaw = this.yaw;
    this.place(camera, SLOT.x + this.push.x + Math.sin(t * 0.21) * 0.03, SLOT.y + this.push.y - Math.tanh(-v.y / 6) * 0.1 + Math.sin(t * 0.33) * 0.025, SLOT.z, out.pos);
    this.pitch += (pitchGoal - this.pitch) * Math.min(1, dt * 1.5);
    orient(out.quat, yaw, this.pitch, Math.sin(t * 0.5) * 0.06);
    setPose(out, STRAIGHT, 0);
  }

  /** Going down: seated → hand to mask → tucked back-roll into the sea (splash) → right itself → swim to the lens. */
  private jumpState(depth: number, out: DiverState): void {
    const ready = smooth(SEATED, READY, depth);
    const roll = smooth(READY, ROLL_END, depth);
    const swim = smooth(ROLL_END, SWIM_IN, depth);
    // The roll: tipping backward off the tube (outboard), tucked, and plunging under.
    const rolled = this.tmp2.copy(this.seat).addScaledVector(this.outward, 0.15 + roll * 1.1);
    rolled.y = lerp(this.seat.y, this.seat.y - 2.2, roll * roll) + Math.sin(roll * Math.PI) * 0.25;
    orient(this.q2, this.inward, -((84 * Math.PI) / 180) - roll * Math.PI * 1.15);
    this.q.slerpQuaternions(this.seatQuat, this.q2, Math.min(1, roll * 5));
    // Underwater: from the inverted, tucked diver beside the boat to the swimming diver at the lens.
    out.pos.lerpVectors(rolled, this.sSwim.pos, swim * swim);
    out.quat.slerpQuaternions(this.q, this.sSwim.quat, smooth(0, 0.6, swim));
    let pose = blendPose(SIT, READY_POSE, ready);
    if (roll > 0) pose = blendPose(READY_POSE, TUCK, smooth(0, 0.35, roll));
    if (swim > 0) pose = blendPose(TUCK, STRAIGHT, smooth(0, 0.5, swim));
    setPose(out, pose, 1 - smooth(0.3, 0.7, swim));
  }

  /**
   * Coming up as a real diver does: the safety stop (hovering at ~5 m, checking the computer), a slow
   * vertical ascent with one hand over the head, surfacing beside the boat and holding the tube, a
   * strong kick to haul over it, and sitting back on the tube.
   */
  private climbState(depth: number, out: DiverState): void {
    const toStop = smooth(CLIMB_FROM, STOP_IN, depth);
    const ascend = smooth(STOP_OUT, APPROACH, depth);
    const approach = smooth(APPROACH, HANG, depth);
    const haul = smooth(HAUL, OVER, depth);
    const sit = smooth(OVER, SEATED, depth);
    const outward = this.outward;
    const inward = this.inward;
    // Hanging: chest at the waterline beside the tube, facing the boat, arms up on the tube.
    const hang = this.tmp.copy(this.seat).addScaledVector(outward, 0.6);
    hang.y = this.seat.y - 1.25 + Math.sin(this.time * 1.3) * 0.04;
    // Over: belly on the tube, leaning in.
    const over = this.tmp2.copy(this.seat).addScaledVector(outward, -0.1);
    over.y = this.seat.y + 0.1;
    // The safety stop and the ascent happen where the diver swims in the frame; only the last metre
    // takes them across to the boat.
    out.pos.copy(this.sSwim.pos);
    if (approach > 0) out.pos.lerp(hang, approach);
    if (haul > 0) out.pos.lerpVectors(hang, over, haul);
    if (sit > 0) out.pos.lerp(this.seat, sit);
    // Level and side-on at the stop (gently finning in place), upright on the ascent, turning to the
    // boat on the approach, leaning over the tube, then seated.
    const side = Math.atan2(this.flatFwd.x, this.flatFwd.z) + 1.3;
    orient(this.q, side, 0.05, Math.sin(this.time * 0.5) * 0.04);
    out.quat.slerpQuaternions(this.sSwim.quat, this.q, toStop);
    if (ascend > 0) out.quat.slerp(orient(this.q2, side, -Math.PI / 2 + 0.2), smooth(0, 0.5, ascend));
    if (approach > 0) out.quat.slerp(orient(this.q2, inward, -Math.PI / 2 + 0.15), approach);
    if (haul > 0) orient(out.quat, inward, lerp(-Math.PI / 2, -0.25, haul));
    if (sit > 0) out.quat.slerp(this.seatQuat, sit);
    let pose = blendPose(STRAIGHT, STOP, toStop);
    if (ascend > 0) pose = blendPose(STOP, ASCEND, smooth(0, 0.4, ascend));
    if (approach > 0) pose = blendPose(ASCEND, REACH, smooth(0.5, 1, approach));
    if (haul > 0) pose = blendPose(REACH, PUSH, haul);
    if (sit > 0) pose = blendPose(blendPose(PUSH, KNEEL, smooth(0, 0.5, sit)), SIT, smooth(0.5, 1, sit));
    setPose(out, pose, Math.max(toStop, haul, sit));
  }

  /** Applies a state's pose over the swim cycle the mixer has just written. */
  /**
   * While the group waits on the boat, they talk: the crew always (they stay aboard), the lead diver
   * only while seated (it fades out as he readies himself to roll in, and back in once he sits again).
   */
  private converse(dt: number, depth: number): void {
    if (!this.boat.visible) return;
    this.talk.update(this.time, dt, this.talkOffsets);
    this.crewBones.forEach((bones, k) => {
      const o = this.talkOffsets[k + 1]!;
      for (const [name, { bone, base }] of bones) {
        const e = o[name as (typeof TALK_BONES)[number]];
        bone.quaternion.copy(base).multiply(this.qe.setFromEuler(this.e.set((e[0] * Math.PI) / 180, (e[1] * Math.PI) / 180, (e[2] * Math.PI) / 180)));
      }
    });
    const seated = 1 - smooth(SEATED - 0.1, READY, depth);
    if (seated <= 0.001) return;
    const o = this.talkOffsets[0]!;
    for (const name of TALK_BONES) {
      const b = this.bones.get(name);
      if (!b) continue;
      const e = o[name];
      this.e.set((e[0] * seated * Math.PI) / 180, (e[1] * seated * Math.PI) / 180, (e[2] * seated * Math.PI) / 180);
      b.bone.quaternion.multiply(this.qe.setFromEuler(this.e));
    }
  }

  private holdArms(weight: number): void {
    if (weight <= 0.001) return;
    for (const name of ARM_BONES) {
      const b = this.bones.get(name);
      const e = SWIM_ARMS[name];
      if (!b || !e) continue;
      this.e.set((e[0] * Math.PI) / 180, (e[1] * Math.PI) / 180, (e[2] * Math.PI) / 180);
      this.q2.copy(b.rest).multiply(this.qe.setFromEuler(this.e));
      b.bone.quaternion.slerp(this.q2, weight);
    }
  }

  private applyPose(s: DiverState): void {
    if (s.poseWeight <= 0.001) return;
    for (const [name, { bone, rest }] of this.bones) {
      const e = s.pose.get(name) ?? [0, 0, 0];
      this.e.set((e[0] * Math.PI) / 180, (e[1] * Math.PI) / 180, (e[2] * Math.PI) / 180);
      this.q2.copy(rest).multiply(this.qe.setFromEuler(this.e));
      bone.quaternion.slerp(this.q2, s.poseWeight);
    }
  }

  /**
   * The finale takes the diver along its own path through the wreck: `weight` blends from swimming
   * with the lens (0) to the path (1), at `pos`, heading along `dir` (world).
   */
  setFinale(weight: number, pos: Vector3, dir: Vector3, king: { sweep: number; upright: number; trident: number } = { sweep: 0, upright: 0, trident: 0 }): void {
    const f = this.finale;
    f.weight = weight;
    f.pos.copy(pos);
    f.dir.copy(dir);
    f.sweep = king.sweep;
    f.upright = king.upright;
    f.trident = king.trident;
  }

  /**
   * The transformation's per-frame parts: the sweep's progress for the materials, embers shed
   * along its front, and the trident in his right hand, upright along his body.
   */
  private updateKing(dt: number): void {
    const f = this.finale;
    this.king.sweep.value = f.sweep;
    if (f.sweep > 0 && f.sweep < 1) {
      const n = Math.random() < dt * 240 % 1 ? Math.ceil(dt * 240) : Math.floor(dt * 240);
      for (let i = 0; i < n; i++) {
        this.tmp.copy(this.headPos).addScaledVector(this.spine, 0.2).lerp(this.finPosition(this.tmp2), f.sweep);
        this.embers.emit(this.tmp, 0.75);
      }
    }
    this.embers.update(dt);
    // The king: where the diver was, upright, turning slowly to face the lens, in a slowed idle.
    this.kingRoot.visible = f.sweep > 0 && f.weight > 0.5;
    if (this.kingRoot.visible) {
      // He takes the diver's heading, then keeps turning (slowly) to face the lens.
      const toLens = Math.atan2(this.lastCam.x - this.diver.position.x, this.lastCam.z - this.diver.position.z);
      if (Number.isNaN(this.kingYaw)) this.kingYaw = f.faceYaw;
      this.kingYaw += wrap(toLens - this.kingYaw) * Math.min(1, dt * KING_TURN);
      this.kingRoot.rotation.set(0, this.kingYaw + KING_FRONT, 0);
      this.kingMixer.update(dt);
      // His head exactly where the diver's head is, so the sweep turns one figure into the other in place.
      this.kingRoot.position.copy(this.diver.position);
      this.kingRoot.updateMatrixWorld(true);
      if (this.kingHead) {
        this.kingHead.getWorldPosition(this.tmp);
        this.kingRoot.position.add(this.tmp2.subVectors(this.headPos, this.tmp));
        this.kingRoot.updateMatrixWorld(true);
      }
    } else {
      this.kingYaw = NaN;
    }
    this.trident.visible = f.trident > 0 && this.kingRoot.visible;
    this.tridentForm.value = f.trident;
    if (this.trident.visible && this.kingHand) {
      this.kingHand.getWorldPosition(this.tmp);
      // Held upright, as a staff.
      this.tAxis.copy(this.yAxis);
      this.tq.setFromUnitVectors(this.yAxis, this.tAxis);
      this.trident.quaternion.copy(this.tq);
      // Gripped a little below its middle.
      this.trident.position.copy(this.tmp).addScaledVector(this.tAxis, -0.95);
    }
  }


  /** Where a crown sits on the diver's head (world), and the head's up (along the spine). */
  crownMount(pos: Vector3, up: Vector3): void {
    up.copy(this.spine);
    pos.copy(this.headPos).addScaledVector(up, CROWN_ON_HEAD);
  }

  /** Where the fins are (world). */
  finPosition(out: Vector3): Vector3 {
    return out.copy(this.diver.position).addScaledVector(this.bodyAxis, -1.15);
  }

  update(dt: number, camera: PerspectiveCamera, depth: number): void {
    this.time += dt;
    const t = this.time;
    this.basis(camera);

    // The camera's travel (smoothed), and which way the scroll is going.
    if (this.haveCam && dt > 0) {
      this.tmp.subVectors(camera.position, this.lastCam).divideScalar(dt);
      if (this.tmp.length() < 200) this.camVel.lerp(this.tmp, Math.min(1, dt * 3));
    }
    this.lastCam.copy(camera.position);
    this.haveCam = true;
    // Direction from the scroll depth itself (the camera also bobs on the waves), switching only once
    // the depth has really moved 0.25 m back the other way, so settling jitter never flips it.
    if (Number.isNaN(this.turnDepth)) this.turnDepth = depth;
    if (this.climbGoal === 0) {
      this.turnDepth = Math.max(this.turnDepth, depth);
      if (depth < this.turnDepth - 0.25) {
        this.climbGoal = 1;
        this.turnDepth = depth;
      }
    } else {
      this.turnDepth = Math.min(this.turnDepth, depth);
      if (depth > this.turnDepth + 0.25) {
        this.climbGoal = 0;
        this.turnDepth = depth;
      }
    }
    this.climbing += (this.climbGoal - this.climbing) * Math.min(1, dt * 2);

    this.updateBoat(depth);
    this.avoid(camera, dt);
    this.swimState(camera, dt, t, this.sSwim);

    // Near the surface the diver follows the boat story; deeper it simply swims with the lens.
    let s = this.sSwim;
    if (depth < CLIMB_FROM && this.boatAnchor) {
      this.jumpState(depth, this.sJump);
      this.climbState(depth, this.sClimb);
      s = blendStates(this.sJump, this.sClimb, this.climbing, this.sOut);
    }
    // The finale: the diver leaves the lens and swims the path through the wreck.
    const f = this.finale;
    if (f.have && dt > 0) {
      const moved = this.tmp.subVectors(f.pos, f.last);
      f.speed += (moved.length() / dt - f.speed) * Math.min(1, dt * 3);
      // Which way the diver is really travelling along the path, with a dead band so a settling
      // scroll never flips it: scrolling back, the diver turns round and swims head-first.
      const along = moved.dot(f.dir) / dt;
      if (along < -0.12) f.sense = -1;
      else if (along > 0.12) f.sense = 1;
    }
    f.last.copy(f.pos);
    f.have = true;
    if (f.weight > 0) {
      const dx = f.dir.x * f.sense, dy = f.dir.y * f.sense, dz = f.dir.z * f.sense;
      const flat = Math.hypot(dx, dz);
      // A diver rising or settling stays near level and keeps facing where he was going: only
      // travel with a real horizontal part turns him, and the path tilts him at most ~26°.
      if (!f.started || flat > 0.5) f.yaw = Math.atan2(dx, dz);
      const tilt = Math.max(-0.45, Math.min(0.45, Math.atan2(-dy, Math.max(flat, 0.2))));
      // Receiving the crown he straightens up in the water (head up, legs below) and turns to face
      // the lens, as the king who takes his place will stand: the two figures then coincide.
      const toLens = Math.atan2(camera.position.x - f.pos.x, camera.position.z - f.pos.z);
      f.faceYaw = f.yaw + wrap(toLens - f.yaw) * f.upright;
      orient(f.goal, f.faceYaw, lerp(tilt + 0.1, -1.55, f.upright));
      if (!f.started) f.facing.copy(f.goal);
      // Turning round takes about a second, as a diver rolls and kicks the other way.
      f.facing.slerp(f.goal, Math.min(1, dt * 2.2));
      f.started = true;
      this.sFinale.pos.copy(f.pos);
      this.sFinale.pos.y += Math.sin(t * 0.6) * 0.06;
      this.sFinale.quat.copy(f.facing).multiply(this.q2.setFromAxisAngle(this.tmp2.set(0, 0, 1), Math.sin(t * 0.5) * 0.05));
      // Standing straight in the water as he straightens: legs together and still, arms at his sides.
      setPose(this.sFinale, STAND, f.upright * 0.85);
      s = blendStates(s, this.sFinale, f.weight, this.sMix);
    } else {
      f.started = false;
    }
    this.diver.position.copy(s.pos);
    this.diver.quaternion.copy(s.quat);
    this.keepClearOfReef(dt);

    // Kick rate follows the effort: an easy fin when hovering, hard on a fast descent.
    const effort = lerp(Math.min(1.4, this.camVel.length() / 6), Math.min(1.2, 0.15 + f.speed / 1.4), f.weight);
    // The kick stills as he straightens to receive the crown.
    this.mixer.timeScale = (0.3 + effort) * (1 - 0.85 * f.upright);
    this.mixer.update(dt);
    this.applyPose(s);
    // Swimming, the arms stay still along the body (the swim clip lets one drift down); poses that
    // use the arms (the boat, the safety stop, the ascent) take over from this hold as they blend in.
    const holdGoal = (1 - s.poseWeight) * (this.diver.position.y < -0.8 ? 1 : 0);
    this.armHold += (holdGoal - this.armHold) * Math.min(1, dt * 3);
    this.holdArms(this.armHold);
    this.converse(dt, depth);
    this.diver.updateMatrixWorld(true);

    // Head torch: on once it gets dark, with a short flicker. It is strapped to the head: it sits on
    // the forehead and shines where the face looks (along the head, tilted from the back toward the
    // face), so beam and head always agree.
    if (this.head) this.head.getWorldPosition(this.headPos);
    else this.headPos.copy(this.diver.position);
    if (this.rootBone) this.rootBone.getWorldPosition(this.rootPos);
    else this.rootPos.copy(this.diver.position);
    const fwd = this.tmp3.subVectors(this.headPos, this.rootPos).normalize();
    this.spine.copy(fwd);
    this.bodyAxis.subVectors(this.headPos, this.diver.position);
    if (this.bodyAxis.lengthSq() < 0.04 || this.bodyAxis.lengthSq() > 4) this.bodyAxis.set(0, 0.85, 0);
    this.backDir.set(0, 1, 0).applyQuaternion(this.diver.quaternion);
    this.faceDir.copy(fwd).addScaledVector(this.backDir, -0.75).normalize();
    // Once he is the king of the sea his crown is his light: the head torch goes out with the sweep.
    const want = depth > TORCH_ON ? 1 - this.finale.sweep : 0;
    this.torchLevel += (want - this.torchLevel) * Math.min(1, dt * 6);
    const flicker = want > 0 && this.torchLevel < 0.97 ? 0.6 + 0.4 * Math.sin(t * 70) : 1;
    this.torch.value = this.torchLevel * flicker;
    this.bulb.visible = this.torch.value > 0.01;
    this.bulb.position.copy(this.headPos).addScaledVector(fwd, 0.1).addScaledVector(this.backDir, 0.05);
    this.beam.visible = this.bulb.visible;
    this.beam.position.copy(this.bulb.position);
    this.beam.lookAt(this.tmp2.copy(this.bulb.position).add(this.faceDir));
    // Surfaces that take the torch (the wreck, the terrace) read it from the frame uniforms.
    this.updateKing(dt);
    this.u.torch.value = this.torch.value;
    this.u.torchPos.value.copy(this.bulb.position);
    this.u.torchDir.value.copy(this.faceDir);

    // Breathing: an exhaled burst of bubbles every ~4 s from the regulator; a cloud at the plunge.
    this.breath += dt;
    if (this.breath > 4.2) this.breath = 0;
    // He breathes the sea once changed: no more bubbles.
    if (this.breath < 0.9 && this.headPos.y < -0.2 && this.finale.sweep < 0.5) this.bubbles.emit(this.tmp.copy(this.headPos).addScaledVector(fwd, 0.15), Math.random() < dt * 40 ? 1 : 0, 0.04);
    if (this.climbing < 0.5 && depth > ROLL_END - 0.5 && depth < SWIM_IN && this.diver.position.y < 0) this.bubbles.emit(this.diver.position, Math.random() < dt * 80 ? 3 : 0, 0.6);
    this.bubbles.update(dt, t);
    // The plunge: where the diver breaks the surface going in, a burst of spray and a foam ring.
    const surfaceH = this.surface(this.diver.position.x, this.diver.position.z);
    const under = this.diver.position.y < surfaceH;
    if (under && !this.wasUnder && this.climbing < 0.5 && depth < SWIM_IN) {
      this.splash.burst(this.tmp.set(this.diver.position.x, surfaceH, this.diver.position.z));
      this.bubbles.emit(this.tmp.set(this.diver.position.x, surfaceH - 0.4, this.diver.position.z), 70, 0.9);
    }
    this.wasUnder = under;
    this.splash.update(dt, (x, z) => this.surface(x, z));

    // Fish give the diver room.
    School.companion.position.copy(this.diver.position);
    School.companion.radius = this.diver.position.y < -0.5 ? 2.5 : 0;

    // In the deep, every kick lights up the plankton: ripples of light spread from the diver's fins.
    const wake = smooth(WAKE_FROM, WAKE_FROM + 300, depth) * (0.25 + 0.5 * Math.min(1, effort));
    if (wake > (this.u.constellation.value as number)) {
      this.u.constellation.value = wake;
      this.u.constellationOrigin.value.copy(this.diver.position).addScaledVector(fwd, -0.8);
    }
  }
}
