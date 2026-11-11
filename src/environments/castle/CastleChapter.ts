import { AnimationMixer, Box3, Group, Mesh, MeshBasicNodeMaterial, Quaternion, Vector3, type AnimationAction, type Material, type Texture } from 'three/webgpu';
import { float, normalWorld, texture, uv, vec3 } from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { AssetLibrary, RigAsset, ScanAsset } from '../../assets/AssetLibrary';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';
import { companionMaterial } from '../../creatures/diver/DiveCompanion';
import { CASTLE_SITE } from '../reef/ReefSite';
import { CASTLE_BASE_Y, CASTLE_UNIT, CHEST_AT, CHEST_HEADING, finaleWeights } from '../finale/finalePath';
import { smoothstep } from '../../core/math/monotoneCubic';
import { ruinMaterial } from '../finale/ruinMaterial';
import { FINALE_VISIBLE_FROM } from '../wreck/WreckChapter';

/** The chest model's front faces its local +z. */
const CHEST_FRONT = 0;
/** How far the crown rises out of the chest as it lights up (m), and the height of its flight to his head. */
const CROWN_RISE = 0.14;
const CROWN_ARC = 0.45;

/**
 * The last set of the finale: a ruined fortress on the terrace (a scan of a real castle ruin,
 * roofless, with round corner towers and a carved portal on its courtyard), and what the diver
 * came for: an iron-bound chest at the foot of the portal with a gold crown inside. The lid opens
 * and the crown's glow lights the courtyard and the diver's mask (`u.relic`).
 */
export class CastleChapter {
  readonly group = new Group();
  private readonly chest: Group;
  private readonly lid: AnimationAction | null;
  private readonly mixer: AnimationMixer;
  private readonly crown: Mesh;
  private readonly crownRest = new Vector3();
  private readonly inFlight = new Vector3();
  private readonly free = new Quaternion();
  private readonly onHead = new Quaternion();
  private readonly yUp = new Vector3(0, 1, 0);

  static async create(u: FrameUniforms, kd: readonly [number, number, number], library: AssetLibrary): Promise<CastleChapter> {
    const [chest] = await Promise.all([library.loadRig('chest'), library.load(['castle', 'crown'])]);
    return new CastleChapter(u, kd, library.get('castle'), chest, library.get('crown'));
  }

  private constructor(private readonly u: FrameUniforms, kd: readonly [number, number, number], castle: ScanAsset, chest: RigAsset, crown: ScanAsset) {
    this.group.name = 'castle-chapter';
    this.group.visible = false;

    // The castle: daylight limestone and turf, weathered and silted; coarse masonry relief.
    castle.geometry.computeBoundingBox();
    const extent = castle.geometry.boundingBox!.getSize(new Vector3());
    // The shot list was measured in the scan's units (5.04 tall, 31.73 wide); a re-processed scan must match.
    if (Math.abs(extent.y / CASTLE_UNIT - 5.04) > 0.1) console.warn(`castle scan changed: shot list assumes ${CASTLE_UNIT.toFixed(3)} m/unit`);
    const look = { lift: 1, bare: [0.5, 0.48, 0.44] as const, relief: 1.6, silt: 0.85 };
    const mats = castle.materials.map((m) => ruinMaterial(u, kd, m.map, look));
    const fort = new Mesh(castle.geometry, mats.length === 1 ? mats[0]! : mats);
    fort.name = 'castle';
    fort.position.set(CASTLE_SITE.x, CASTLE_BASE_Y, CASTLE_SITE.z);
    fort.rotation.y = CASTLE_SITE.yaw;
    this.group.add(fort);

    // The chest, standing on the floor before the portal, its front to the courtyard.
    this.chest = chest.root;
    this.chest.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as Material & { color?: { r: number; g: number; b: number }; map?: Texture | null; normalMap?: Texture | null };
      mesh.material = companionMaterial(u, kd, src, { roughness: 0.6, specular: 0.35, hero: 0.25 });
      mesh.frustumCulled = false;
    });
    const box = new Box3().setFromObject(this.chest, true);
    const size = box.getSize(new Vector3());
    this.chest.position.set(CHEST_AT.x, CHEST_AT.y + size.y / 2, CHEST_AT.z);
    this.chest.rotation.y = CHEST_HEADING + CHEST_FRONT;
    this.group.add(this.chest);
    this.mixer = new AnimationMixer(this.chest);
    const open = chest.animations.find((a) => /open/i.test(a.name)) ?? chest.animations[0];
    this.lid = open ? this.mixer.clipAction(open) : null;
    if (this.lid) {
      this.lid.play();
      this.lid.paused = true;
    }

    // The crown, resting on the chest's contents; gold under the torch, glowing as it is found.
    const glow: ShaderNode = (u.relic as ShaderNode).mul(0.25).div(u.exposure as ShaderNode);
    // Pushed toward gold: under the blue water a pale gold reads silver.
    const gold: ShaderNode = crown.map ? (texture(crown.map, uv()) as ShaderNode).rgb.mul(vec3(1, 0.78, 0.42)) : vec3(0.95, 0.7, 0.3);
    const m = new MeshBasicNodeMaterial();
    m.colorNode = underwaterLit(u, kd, { albedo: gold, normal: normalWorld, roughness: float(0.25), specular: float(0.95), torch: true, emissive: vec3(1, 0.7, 0.28).mul(glow) });
    this.crown = new Mesh(crown.geometry, m);
    this.crown.name = 'crown';
    this.crownRest.set(CHEST_AT.x, CHEST_AT.y + size.y * 0.42, CHEST_AT.z);
    this.crown.position.copy(this.crownRest);
    this.crown.visible = false;
    this.group.add(this.crown);
  }

  /**
   * `head`: where a crown sits on the diver's head (world) and the head's up. The crown rises out
   * of the chest, arcs up and over, and settles on his head, turning upright along it; it flares
   * as it lands, and stays.
   */
  update(t: number, depth: number, time: number, head: { pos: Vector3; up: Vector3 } | null): void {
    this.group.visible = depth > FINALE_VISIBLE_FROM;
    const { lid, glow, crownFly, flash, sweep } = finaleWeights(t);
    if (this.lid) {
      this.lid.time = lid * this.lid.getClip().duration * 0.999;
      this.mixer.update(0);
    }
    // Once the sweep has passed his head the crown is the king's own crown-helm.
    this.crown.visible = this.group.visible && lid > 0.02 && sweep < 0.12;
    this.crown.position.copy(this.crownRest).setY(this.crownRest.y + CROWN_RISE * glow + Math.sin(time * 0.9) * 0.01 * glow);
    // Turning slowly as it rises, faster in flight, still once it is on.
    const spin = CHEST_HEADING + glow * 0.6 + time * 0.15 * glow + crownFly * Math.PI * 2;
    this.free.setFromAxisAngle(this.yUp, spin);
    if (head && crownFly > 0) {
      const f = crownFly * crownFly * (3 - 2 * crownFly);
      this.inFlight.lerpVectors(this.crown.position, head.pos, f);
      // An arc: up out of the chest, then down onto his head.
      this.inFlight.y += Math.sin(Math.PI * f) * CROWN_ARC;
      this.crown.position.copy(this.inFlight);
      this.onHead.setFromUnitVectors(this.yUp, head.up);
      this.crown.quaternion.slerpQuaternions(this.free, this.onHead, smoothstep(0.55, 1, crownFly));
    } else {
      this.crown.quaternion.copy(this.free);
    }
    this.u.relic.value = this.group.visible ? glow + flash * 2.2 : 0;
    this.u.relicPos.value.copy(this.crown.position).y += 0.2;
  }
}
