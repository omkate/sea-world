import { Group, Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { AssetLibrary, ScanAsset } from '../../assets/AssetLibrary';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { HeroSwimmer } from '../../creatures/hero/HeroSwimmer';
import { CAMERA_KEYS, CASTLE_UNIT, CUT_T, DIVER_KEYS, FINALE_FISH, TARGET_KEYS, WHALE_PASS, finaleFloorY, finaleToWorld, finaleWeights, sampleKeys } from './finalePath';
import { SchoolSet, addCounts } from '../../ecosystem/schooling/SchoolSet';
import { REEF_FISH } from '../../creatures/fish/reefFish';
import { PELAGIC_FISH } from '../../creatures/fish/pelagicFish';
import { loadSpecies } from '../../data/species';
import { eligibleSpecies } from '../../ecosystem/spawning/eligibility';
import { Silt } from './Silt';

/** Finale progress per second beyond which the scroll counts as running forward or back. */
const WHALE_SENSE_RATE = 0.002;
/** How fast the whale turns round (rad/s, eased). */
const WHALE_TURN = 0.9;
/** Fins closer than this to the floor (m) stir up silt. */
const SILT_REACH = 1.1;

const fishVisual = (id: string) => {
  const v = [...REEF_FISH, ...PELAGIC_FISH].find((f) => f.speciesId === id);
  if (!v) throw new Error(`No visual for ${id}`);
  return v;
};

/**
 * Runs the finale's shot list (finalePath.ts): frames the camera, tells the diver where to swim,
 * and flies the sperm whale over the swim to the castle. Below 130 m only; at the hand-over every
 * weight is 0, so the approach is untouched.
 */
export class FinaleDirector {
  readonly group = new Group();
  private readonly whale: HeroSwimmer;
  private readonly eye = new Vector3();
  private readonly target = new Vector3();
  private readonly prev = new Vector3();
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly wPos = new Vector3();
  private readonly wDir = new Vector3();
  private lastT = NaN;
  private whaleSense = 1;
  private whaleYaw = NaN;
  private readonly fish: SchoolSet;
  private readonly silt: Silt;
  private readonly lastFins = new Vector3();
  private readonly wash = new Vector3();
  private readonly floorAt = new Vector3();
  private siltDue = 0;
  private haveFins = false;

  static async create(u: FrameUniforms, kd: readonly [number, number, number], library: AssetLibrary): Promise<FinaleDirector> {
    await library.load(['sperm-whale']);
    return new FinaleDirector(u, kd, library.get('sperm-whale'));
  }

  private constructor(u: FrameUniforms, kd: readonly [number, number, number], whale: ScanAsset) {
    this.group.name = 'finale';
    // Lit by the hero rig so the 12 m animal reads against the blue, not as a dark shape.
    this.whale = new HeroSwimmer(u, kd, whale, {
      name: 'finale-whale',
      forward: '+z',
      style: 'vertical',
      beatHz: 0.2,
      amplitude: 0.05,
      hero: 0.7,
      wander: { home: WHALE_PASS.from.clone(), radius: 1, yMin: -1e4, yMax: 0, floor: null, cruise: 1.2, maxTurn: 0.08, seed: 152 },
    });
    this.whale.mesh.visible = false;
    this.group.add(this.whale.mesh);

    // The sets' fish, placed only where their species is recorded at that depth.
    const species = loadSpecies();
    this.fish = new SchoolSet(fishVisual, (id, depth) => eligibleSpecies(species, depth, 'mariana').some((s) => s.id === id));
    const home = new Vector3();
    FINALE_FISH.forEach((g, i) => {
      finaleToWorld(g.frame, ...g.at, home);
      const k = g.frame === 'castle' ? CASTLE_UNIT : 1;
      const base = home.y - g.at[1] * k;
      const scad = g.species === 'decapterus-macarellus';
      this.fish.add(g.species, -home.y, {
        count: g.count, length: scad ? 0.28 : 0.17, lengthVariation: scad ? 0.15 : 0.08, home: home.clone(), homeRadius: g.radius,
        yMin: base + g.band[0] * k, yMax: base + g.band[1] * k,
        cruiseBL: scad ? 1.3 : 0.8, maxTurn: scad ? 4 : 2.8, neighbourBL: scad ? 4 : 8, separationBL: scad ? 1.3 : 1.5,
        cohesion: scad ? 0.8 : 0.9, fleeRadius: scad ? 2.5 : 2.2,
        floor: (x, z) => finaleFloorY(this.floorAt.set(x, 0, z)), floorClearance: 0.6, seed: 1500 + i,
      });
    });
    this.fish.build(u, kd, this.group);
    this.silt = new Silt(u);
    this.group.add(this.silt.mesh);
  }

  /** Frames the shot for finale progress t, blending from where the dive rig put the camera. */
  direct(t: number, camera: PerspectiveCamera, time: number): void {
    const w = finaleWeights(t).camera;
    if (w <= 0) return;
    sampleKeys(CAMERA_KEYS, t, this.eye);
    sampleKeys(TARGET_KEYS, t, this.target);
    // A slow handheld drift, as an operator swimming the camera.
    this.eye.x += Math.sin(time * 0.31) * 0.07;
    this.eye.y += Math.sin(time * 0.23 + 1.1) * 0.05;
    this.target.x += Math.sin(time * 0.17 + 0.4) * 0.06;
    this.m.lookAt(this.eye, this.target, this.up);
    this.q.setFromRotationMatrix(this.m);
    camera.position.lerp(this.eye, w);
    camera.quaternion.slerp(this.q, w);
  }

  /** The diver's place and heading on the path (world); returns how much the finale owns the diver. */
  diver(t: number, pos: Vector3, dir: Vector3): number {
    sampleKeys(DIVER_KEYS, t, pos);
    // Heading from the path on the same side of the cut.
    const a = t >= CUT_T ? Math.max(CUT_T, t - 0.004) : Math.max(0, t - 0.004);
    const b = t >= CUT_T ? Math.min(1, t + 0.004) : Math.min(CUT_T - 1e-6, t + 0.004);
    sampleKeys(DIVER_KEYS, a, this.prev);
    sampleKeys(DIVER_KEYS, b, dir);
    dir.sub(this.prev);
    if (dir.lengthSq() < 1e-10) dir.set(0, 0, -1);
    dir.normalize();
    return finaleWeights(t).diver;
  }

  update(dt: number, t: number, time: number, camera: PerspectiveCamera, depth: number): void {
    this.group.visible = depth > 125;
    if (!this.group.visible) return;
    this.fish.update(dt, time, camera.position);
    this.silt.update(dt);
    const [t0, t1] = WHALE_PASS.t;
    const on = t > t0 && t < t1;
    // Which way the scroll carries the film (a dead band so a settling scroll never flips it).
    if (!Number.isNaN(this.lastT) && dt > 0) {
      const rate = (t - this.lastT) / dt;
      if (rate < -WHALE_SENSE_RATE) this.whaleSense = -1;
      else if (rate > WHALE_SENSE_RATE) this.whaleSense = 1;
    }
    this.lastT = t;
    this.whale.mesh.visible = on;
    if (!on) {
      this.whaleYaw = NaN;
      return;
    }
    const s = (t - t0) / (t1 - t0);
    this.wPos.lerpVectors(WHALE_PASS.from, WHALE_PASS.to, s);
    this.wDir.subVectors(WHALE_PASS.to, WHALE_PASS.from).normalize().multiplyScalar(this.whaleSense);
    // Scrolling back, the whale turns round (slowly: a 12 m animal) and swims head-first the way it came.
    const goal = Math.atan2(this.wDir.x, this.wDir.z);
    if (Number.isNaN(this.whaleYaw)) this.whaleYaw = goal;
    const d = Math.atan2(Math.sin(goal - this.whaleYaw), Math.cos(goal - this.whaleYaw));
    this.whaleYaw += d * Math.min(1, dt * WHALE_TURN);
    const flat = Math.hypot(this.wDir.x, this.wDir.z);
    this.wDir.set(Math.sin(this.whaleYaw) * flat, this.wDir.y, Math.cos(this.whaleYaw) * flat);
    this.whale.pose(dt, this.wPos, this.wDir);
  }

  /**
   * After the diver has moved: fins close to the floor stir up silt, more the harder they kick,
   * washed back the way the fins push.
   */
  stirSilt(dt: number, fins: Vector3, owned: number): void {
    if (this.haveFins && dt > 0 && owned > 0.5) {
      const floor = finaleFloorY(fins);
      const h = fins.y - floor;
      const speed = this.wash.subVectors(fins, this.lastFins).length() / dt;
      if (h < SILT_REACH && h > -0.5) {
        this.siltDue += dt * (1 - Math.max(0, h) / SILT_REACH) * (2.5 + speed * 6);
        this.wash.normalize();
        while (this.siltDue >= 1) {
          this.siltDue -= 1;
          this.silt.emit(this.floorAt.set(fins.x, floor + 0.15, fins.z), this.wash);
        }
      }
    }
    this.lastFins.copy(fins);
    this.haveFins = true;
  }

  creatureCounts(): { total: number; simulated: number } {
    return addCounts(this.fish.counts(), { total: 1, simulated: this.whale.mesh.visible ? 1 : 0 });
  }

  sightings(): SightingSource[] {
    const whale = this.whale;
    const p = whale.motion.position;
    return [...this.fish.sightings(), { species: 'physeter-macrocephalus', nearest: (from, out, accept) => (whale.mesh.visible && accept(p) ? (out.copy(p), p.distanceTo(from)) : Infinity) }];
  }
}
