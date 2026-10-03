import { Group, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { loadSpecies } from '../../data/species';
import { eligibleSpecies } from '../../ecosystem/spawning/eligibility';
import { SchoolSet, type CreatureCounts } from '../../ecosystem/schooling/SchoolSet';
import { TWILIGHT_FISH } from '../../creatures/fish/twilightFish';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { SQUID_DENSITY, TWILIGHT_DENSITY, TWILIGHT_SCENES } from './density';
import { AtollaEncounter } from '../../creatures/jelly/AtollaEncounter';
import { VampireEncounter } from '../../creatures/squid/VampireEncounter';
import { SquidPatrol } from '../../creatures/squid/SquidPatrol';
import { GiantSquid } from '../../creatures/squid/GiantSquid';
import { inOpenWater } from '../openWater';

/** Depths (m) over which the chapter is live: from the open blue's lower edge to sunlight's end. */
export const TWILIGHT_RANGE: readonly [number, number] = [240, 1050];

/**
 * Size of the camera-relative box the fauna lives in (m). These animals are 3–15 cm long, so
 * like documentary macro work the scenes play out within 0.5–4 m of the lens.
 */
const BOX = new Vector3(6, 3, 4);
/** Box centre ahead of the lens (m) and below it, matching the camera's slight downward look. */
const AHEAD = 1.8;
const BELOW = 0.3;

const twilightFish = (id: string) => {
  const v = TWILIGHT_FISH.find((f) => f.speciesId === id);
  if (!v) throw new Error(`No visual for ${id}`);
  return v;
};

/**
 * The twilight zone (plan §2, 200–1,000 m): no geometry, only the fading light, marine snow and
 * small animals with light organs ("density and light curves", plan §7). These fish are 3–5 cm
 * long and read only within a few metres, so like the suspended particles they live in a box
 * that travels with the camera; how many are present follows each species' density by depth,
 * and nothing appears outside its recorded depth range.
 */
export class TwilightChapter {
  readonly group = new Group();
  private readonly fish: SchoolSet;
  private readonly homes = new Map<string, Vector3>();
  private readonly allowed: (id: string, depth: number) => boolean;
  private readonly forward = new Vector3();
  private readonly squid: SquidPatrol | null;
  private readonly giant: GiantSquid | null;
  private readonly atolla: AtollaEncounter | null;
  private readonly vampire: VampireEncounter | null;

  constructor(u: FrameUniforms, kd: readonly [number, number, number]) {
    this.group.name = 'twilight-chapter';
    const species = loadSpecies();
    this.allowed = (id, depth) => eligibleSpecies(species, depth, 'mariana').some((s) => s.id === id);
    // Presence is checked every frame against the density curve and depth range, not at placement.
    this.fish = new SchoolSet(twilightFish, () => true);

    // Enough lanternfish for the deep scattering layer to read as a wall in its scene.
    const counts: Record<string, number> = { diaphus: 600, 'argyropelecus-hemigymnus': 140, cyclothone: 160 };
    let seed = 2000;
    for (const id of Object.keys(TWILIGHT_DENSITY)) {
      const home = new Vector3(0, -500, 0);
      this.homes.set(id, home);
      const length = id === 'argyropelecus-hemigymnus' ? 0.035 : 0.05;
      this.fish.add(id, 500, {
        count: counts[id]!, length, lengthVariation: 0.15, home, homeRadius: 4, yMin: -Infinity, yMax: Infinity,
        cruiseBL: 1.2, maxTurn: 4, neighbourBL: 5, separationBL: 2, cohesion: 0.35, fleeRadius: 1.2,
        floor: () => null, floorClearance: 0, seed: seed++, wrap: BOX,
        // Hatchetfish tilt as they hang, so their mirror flanks catch the light overhead.
        roll: id === 'argyropelecus-hemigymnus' ? 0.5 : 0.1,
      });
    }
    this.fish.build(u, kd, this.group);

    // Cock-eyed squid: a few at most, hanging a little further out than the small fish.
    this.squid = species.some((s) => s.id === 'histioteuthis')
      ? new SquidPatrol(u, kd, { count: 5, size: 0.2, sizeVariation: 0.15, box: new Vector3(5, 2.5, 4), ahead: 2.2, below: 0.3, fleeRadius: 1.1, seed: 2100 })
      : null;
    if (this.squid) this.group.add(this.squid.mesh);

    // The big-animal moment of the twilight: a giant squid (~8 m with its tentacles) crossing
    // the edge of the lamp around 800 m. Recorded at 200–1,000 m.
    this.giant = this.allowed('architeuthis-dux', 800)
      ? new GiantSquid(u, kd, { home: inOpenWater(800, 5, 0), radius: 4, length: 8, cruise: 0.5, turn: 0.15, encounter: TWILIGHT_SCENES.giantSquid })
      : null;
    if (this.giant) this.group.add(this.giant.mesh);

    // The Atolla scene: alarm jellies flaring blue pinwheels around the lens.
    const [atollaFrom, atollaTo] = TWILIGHT_SCENES.atolla;
    this.atolla = this.allowed('atolla-wyvillei', (atollaFrom + atollaTo) / 2)
      ? new AtollaEncounter(u, kd, { home: inOpenWater((atollaFrom + atollaTo) / 2, 1.8, 0), count: 4, size: 0.14, sizeVariation: 0.2, encounter: [atollaFrom - 10, atollaTo + 10], seed: 2200 })
      : null;
    if (this.atolla) this.group.add(this.atolla.mesh);

    // The vampire squid scene: cloaked, glowing arm tips, the pineapple display when approached.
    const [vampFrom, vampTo] = TWILIGHT_SCENES.vampireSquid;
    this.vampire = this.allowed('vampyroteuthis-infernalis', (vampFrom + vampTo) / 2)
      ? new VampireEncounter(u, kd, { home: inOpenWater((vampFrom + vampTo) / 2, 1.6, 0), count: 2, size: 0.28, encounter: [vampFrom - 10, vampTo + 10], seed: 2300 })
      : null;
    if (this.vampire) this.group.add(this.vampire.mesh);
  }

  isActive(depth: number): boolean {
    return depth > TWILIGHT_RANGE[0] && depth < TWILIGHT_RANGE[1];
  }

  /** Fraction of a species' fauna present at `depth` (0 outside its recorded range). */
  density(id: string, depth: number): number {
    return this.allowed(id, depth) ? TWILIGHT_DENSITY[id]!(depth) : 0;
  }

  update(dt: number, time: number, camera: PerspectiveCamera, depth: number): void {
    this.group.visible = this.isActive(depth);
    if (!this.group.visible) return;
    camera.getWorldDirection(this.forward);
    for (const [id, home] of this.homes) {
      home.copy(camera.position).addScaledVector(this.forward, AHEAD);
      home.y -= BELOW;
      this.fish.school(id)?.setDensity(0, this.density(id, depth));
    }
    this.fish.update(dt, time, camera.position);
    if (this.squid) {
      this.squid.setDensity(this.allowed('histioteuthis', depth) ? SQUID_DENSITY(depth) : 0);
      this.squid.update(dt, time, camera);
    }
    this.giant?.update(dt, time, camera);
    this.atolla?.update(dt, time, camera);
    this.vampire?.update(dt, time, camera);
  }

  creatureCounts(): CreatureCounts {
    const c = this.fish.counts();
    const squid = this.squid ? { total: this.squid.total, simulated: this.squid.simulated } : { total: 0, simulated: 0 };
    const giant = this.giant ? { total: 1, simulated: this.giant.mesh.visible ? 1 : 0 } : { total: 0, simulated: 0 };
    const atolla = this.atolla ? { total: this.atolla.mesh.count, simulated: this.atolla.simulated } : { total: 0, simulated: 0 };
    const vampire = this.vampire ? { total: this.vampire.mesh.count, simulated: this.vampire.simulated } : { total: 0, simulated: 0 };
    const total = c.total + squid.total + giant.total + atolla.total + vampire.total;
    return { total, simulated: this.group.visible ? c.simulated + squid.simulated + giant.simulated + atolla.simulated + vampire.simulated : 0 };
  }

  sightings(): SightingSource[] {
    return [
      ...this.fish.sightings(),
      ...(this.squid ? [this.squid.sighting()] : []),
      ...(this.giant ? [this.giant.sighting()] : []),
      ...(this.atolla ? [this.atolla.sighting()] : []),
      ...(this.vampire ? [this.vampire.sighting()] : []),
    ];
  }
}
