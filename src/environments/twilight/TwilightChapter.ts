import { Group, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { loadSpecies } from '../../data/species';
import { eligibleSpecies } from '../../ecosystem/spawning/eligibility';
import { SchoolSet, type CreatureCounts } from '../../ecosystem/schooling/SchoolSet';
import { TWILIGHT_FISH } from '../../creatures/fish/twilightFish';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { TWILIGHT_DENSITY } from './density';

/** Depths (m) over which the chapter is live: from the open blue's lower edge to sunlight's end. */
export const TWILIGHT_RANGE: readonly [number, number] = [240, 1050];

/** Size of the camera-relative box the fauna lives in (m): wide, shallow, deep along the view. */
const BOX = new Vector3(10, 4, 8);
/** Box centre ahead of the lens (m) and below it, matching the camera's slight downward look. */
const AHEAD = 2.5;
const BELOW = 0.6;

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

  constructor(u: FrameUniforms, kd: readonly [number, number, number]) {
    this.group.name = 'twilight-chapter';
    const species = loadSpecies();
    this.allowed = (id, depth) => eligibleSpecies(species, depth, 'mariana').some((s) => s.id === id);
    // Presence is checked every frame against the density curve and depth range, not at placement.
    this.fish = new SchoolSet(twilightFish, () => true);

    const counts: Record<string, number> = { diaphus: 160, 'argyropelecus-hemigymnus': 70, cyclothone: 120 };
    let seed = 2000;
    for (const id of Object.keys(TWILIGHT_DENSITY)) {
      const home = new Vector3(0, -500, 0);
      this.homes.set(id, home);
      const length = id === 'argyropelecus-hemigymnus' ? 0.035 : 0.05;
      this.fish.add(id, 500, {
        count: counts[id]!, length, lengthVariation: 0.15, home, homeRadius: 4, yMin: -Infinity, yMax: Infinity,
        cruiseBL: 1.2, maxTurn: 4, neighbourBL: 5, separationBL: 2, cohesion: 0.35, fleeRadius: 1.2,
        floor: () => null, floorClearance: 0, seed: seed++, wrap: BOX,
      });
    }
    this.fish.build(u, kd, this.group);
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
  }

  creatureCounts(): CreatureCounts {
    const c = this.fish.counts();
    return { total: c.total, simulated: this.group.visible ? c.simulated : 0 };
  }

  sightings(): SightingSource[] {
    return this.fish.sightings();
  }
}
