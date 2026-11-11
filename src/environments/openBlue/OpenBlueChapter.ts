import { Group, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { loadSpecies } from '../../data/species';
import { eligibleSpecies } from '../../ecosystem/spawning/eligibility';
import { SchoolSet, type CreatureCounts } from '../../ecosystem/schooling/SchoolSet';
import { PELAGIC_FISH } from '../../creatures/fish/pelagicFish';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { inOpenWater, openWaterSchool } from '../openWater';

/**
 * Depths (m) over which the chapter is live: from the lower reef wall to just past 130 m, so the
 * last school drifts out of frame rather than vanishing at the finale hand-over.
 */
export const OPEN_BLUE_RANGE: readonly [number, number] = [90, 140];

const pelagicFish = (id: string) => {
  const v = PELAGIC_FISH.find((f) => f.speciesId === id);
  if (!v) throw new Error(`No visual for ${id}`);
  return v;
};

/**
 * The open blue beside the lower wall (90–130 m): no geometry, only light, depth and animals.
 * Everything that lived below 130 m (deeper schools, the bait ball and tuna strike, oceanic
 * whitetips, the sperm whale pass) was cut with the deep ocean; the whale returns in the wreck
 * finale. Every placement passes the species' recorded depth range.
 */
export class OpenBlueChapter {
  readonly group = new Group();
  private readonly fish: SchoolSet;

  constructor(u: FrameUniforms, kd: readonly [number, number, number]) {
    this.group.name = 'open-blue-chapter';
    const species = loadSpecies();
    const allowed = (id: string, depth: number) => eligibleSpecies(species, depth, 'mariana').some((s) => s.id === id);
    this.fish = new SchoolSet(pelagicFish, allowed);

    // Skipjack: a fast, tight, polarised school 22 m out (in frame for ~13 m of descent).
    this.fish.add('katsuwonus-pelamis', 124, openWaterSchool(inOpenWater(124, 22, 6, -1), 3, {
      count: 30, length: 0.75, lengthVariation: 0.12, homeRadius: 12, cruiseBL: 1.5, maxTurn: 1.6,
      neighbourBL: 3, separationBL: 1.2, cohesion: 0.9, fleeRadius: 3, seed: 1200,
    }));
    this.fish.build(u, kd, this.group);
  }

  isActive(depth: number): boolean {
    return depth > OPEN_BLUE_RANGE[0] && depth < OPEN_BLUE_RANGE[1];
  }

  update(dt: number, time: number, camera: PerspectiveCamera, depth: number): void {
    this.group.visible = this.isActive(depth);
    if (!this.group.visible) return;
    this.fish.update(dt, time, camera.position);
  }

  /** Animals placed in the chapter, and those simulated right now (none while it is inactive). */
  creatureCounts(): CreatureCounts {
    const c = this.fish.counts();
    return { total: c.total, simulated: this.group.visible ? c.simulated : 0 };
  }

  /** One sighting source per species this chapter renders, for the discovery scanner. */
  sightings(): SightingSource[] {
    return this.fish.sightings();
  }
}
