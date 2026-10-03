import { Group, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { AssetLibrary } from '../../assets/AssetLibrary';
import { loadSpecies } from '../../data/species';
import { eligibleSpecies } from '../../ecosystem/spawning/eligibility';
import { SchoolSet, addCounts, type CreatureCounts } from '../../ecosystem/schooling/SchoolSet';
import { PredatorBeat } from '../../ecosystem/predation/PredatorBeat';
import { Spotter } from '../../ecosystem/spotter/Spotter';
import { PELAGIC_FISH } from '../../creatures/fish/pelagicFish';
import { HeroSwimmer } from '../../creatures/hero/HeroSwimmer';
import type { Wanderer } from '../../creatures/hero/Wanderer';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { inOpenWater, openWaterSchool } from '../openWater';

/**
 * Depths (m) over which the chapter is live: from the lower reef wall to the twilight edge.
 * Below ~260 m skipjack are out of range and yellowfin are rare; that water is the twilight's.
 */
export const OPEN_BLUE_RANGE: readonly [number, number] = [90, 265];

const pelagicFish = (id: string) => {
  const v = PELAGIC_FISH.find((f) => f.speciesId === id);
  if (!v) throw new Error(`No visual for ${id}`);
  return v;
};

/**
 * The open blue (plan §2, 120–200 m, carried on to the twilight edge): no geometry, only light,
 * depth and animals. Skipjack, yellowfin and mackerel-scad schools, a bait school with a rare
 * tuna strike, and oceanic whitetips. Every placement passes the species' recorded depth range.
 */
export class OpenBlueChapter {
  readonly group = new Group();
  private readonly fish: SchoolSet;
  private readonly beat = new PredatorBeat();
  private readonly swimmers: HeroSwimmer[] = [];
  private readonly bigAnimals: Wanderer[] = [];
  private spotter: Spotter | null = null;
  private readonly camForward = new Vector3();
  private readonly baitCentre = new Vector3();
  private readonly tunaCentre = new Vector3();
  private readonly threat = [this.tunaCentre];
  /** Where the bait school lives and which yellowfin group strikes it (-1 if not placed). */
  private bait: { home: Vector3; group: number; tunaGroup: number } | null = null;

  constructor(u: FrameUniforms, kd: readonly [number, number, number], library: AssetLibrary) {
    this.group.name = 'open-blue-chapter';
    const species = loadSpecies();
    const allowed = (id: string, depth: number) => eligibleSpecies(species, depth, 'mariana').some((s) => s.id === id);
    this.fish = new SchoolSet(pelagicFish, allowed);

    // The lens sees about ±16° vertically, so a group A metres ahead is in frame while the camera
    // is within ~0.29·A metres of its depth. Large fish sit 22–24 m ahead (in frame for ~13 m of
    // descent), close scad groups fill the gaps between them: from 118 m to 258 m the frame is
    // never empty for long.

    // Skipjack: fast, tight, polarised schools (recorded to 260 m).
    for (const [i, [d, ahead, side]] of ([[124, 22, 6], [148, 22, -7], [172, 22, 8], [210, 22, -5], [234, 22, 6], [252, 22, -4]] as const).entries()) {
      this.fish.add('katsuwonus-pelamis', d, openWaterSchool(inOpenWater(d, ahead, side, -1), 3, {
        count: 30, length: 0.75, lengthVariation: 0.12, homeRadius: 12, cruiseBL: 1.5, maxTurn: 1.6,
        neighbourBL: 3, separationBL: 1.2, cohesion: 0.9, fleeRadius: 3, seed: 1200 + i,
      }));
    }

    // Mackerel scad (usually 40–200 m) cruise close to the camera, small enough to need it.
    for (const [i, [d, ahead, side]] of ([[131, 7, -2], [139, 7, 3], [164, 8, -3], [184, 7, 2], [200, 7, -2]] as const).entries()) {
      this.fish.add('decapterus-macarellus', d, openWaterSchool(inOpenWater(d, ahead, side, -1), 2, {
        count: 90, length: 0.28, lengthVariation: 0.15, homeRadius: 4, cruiseBL: 1.4, maxTurn: 4,
        neighbourBL: 4, separationBL: 1.3, cohesion: 0.8, fleeRadius: 2.5, seed: 1310 + i,
      }));
    }

    // The bait school, and the yellowfin group that hunts it.
    const baitDepth = 160;
    const baitHome = inOpenWater(baitDepth, 7, 2, -1);
    const baitGroup = this.fish.add('decapterus-macarellus', baitDepth, openWaterSchool(baitHome, 3, {
      count: 260, length: 0.28, lengthVariation: 0.15, homeRadius: 5, cruiseBL: 1.4, maxTurn: 4,
      neighbourBL: 4, separationBL: 1.3, cohesion: 0.8, fleeRadius: 2.5, seed: 1300,
    }));
    const tunaGroup = this.fish.add('thunnus-albacares', 154, openWaterSchool(inOpenWater(154, 16, 12), 5, {
      count: 10, length: 1.5, lengthVariation: 0.12, homeRadius: 16, cruiseBL: 0.9, maxTurn: 1,
      neighbourBL: 4, separationBL: 1.5, cohesion: 0.6, fleeRadius: 4, seed: 1400,
    }));
    // Further yellowfin groups, thinning out where they become rare (usually above 250 m).
    for (const [i, [d, ahead, side, count]] of ([[136, 22, 9, 6], [190, 24, -9, 8], [222, 24, 9, 8], [244, 24, -6, 6]] as const).entries()) {
      this.fish.add('thunnus-albacares', d, openWaterSchool(inOpenWater(d, ahead, side, -1), 5, {
        count, length: 1.4, lengthVariation: 0.12, homeRadius: 16, cruiseBL: 0.9, maxTurn: 1,
        neighbourBL: 4, separationBL: 1.5, cohesion: 0.6, fleeRadius: 4, seed: 1401 + i,
      }));
    }
    if (baitGroup >= 0 && tunaGroup >= 0) this.bait = { home: baitHome, group: baitGroup, tunaGroup };
    this.fish.build(u, kd, this.group);

    // Oceanic whitetips patrol the blue, and now and then come up to inspect the camera. Rendered
    // with the reef-shark scan scaled up (same carcharhinid body plan; noted in the manifest).
    for (const [i, d] of [170, 225].entries()) {
      if (!allowed('carcharhinus-longimanus', d)) continue;
      const home = inOpenWater(d, 14, i === 0 ? 10 : -10);
      const shark = new HeroSwimmer(u, kd, library.get('whitetip-reef-shark'), {
        name: 'oceanic-whitetip', forward: '+x', style: 'lateral', beatHz: 0.6, amplitude: 0.05, scale: 3 / 2.1,
        wander: { home, radius: 16, yMin: home.y - 10, yMax: home.y + 10, floor: null, cruise: 0.9, maxTurn: 0.3, maxPitch: 0.2, seed: 131 + i, neighbours: this.bigAnimals, space: 3 },
        investigate: { range: 30, interval: [24, 40], closest: 1.8, speedScale: 1.6 },
      });
      this.swimmers.push(shark);
      this.bigAnimals.push(shark.motion);
      this.group.add(shark.mesh);
    }
    if (this.swimmers.length > 0) this.spotter = new Spotter([{ species: 'oceanic-whitetip', members: this.bigAnimals }]);
  }

  isActive(depth: number): boolean {
    return depth > OPEN_BLUE_RANGE[0] && depth < OPEN_BLUE_RANGE[1];
  }

  update(dt: number, time: number, camera: PerspectiveCamera, depth: number): void {
    this.group.visible = this.isActive(depth);
    if (!this.group.visible) return;
    this.updateBeat(dt, camera.position);
    this.spotter?.update(dt, camera);
    camera.getWorldDirection(this.camForward);
    for (const h of this.swimmers) h.update(dt, camera.position, this.camForward);
    this.fish.update(dt, time, camera.position);
  }

  /** The predator beat: tuna strike the scad, which pack into a bait ball and flee. */
  private updateBeat(dt: number, camera: Vector3): void {
    if (!this.bait) return;
    const scad = this.fish.school('decapterus-macarellus');
    const tuna = this.fish.school('thunnus-albacares');
    if (!scad || !tuna) return;
    const phase = this.beat.update(dt, this.bait.home.distanceTo(camera) < 35);
    scad.groupCentre(this.bait.group, this.baitCentre);
    tuna.groupCentre(this.bait.tunaGroup, this.tunaCentre);
    tuna.setChase(phase === 'strike' ? { group: this.bait.tunaGroup, target: this.baitCentre, boost: 2.6 } : null);
    scad.setThreats(phase === 'idle' ? [] : this.threat, 9);
    scad.setAlarm(this.bait.group, this.beat.alarm);
  }

  /** Animals placed in the chapter, and those simulated right now (none while it is inactive). */
  creatureCounts(): CreatureCounts {
    const c = addCounts(this.fish.counts(), { total: this.swimmers.length, simulated: this.swimmers.length });
    return { total: c.total, simulated: this.group.visible ? c.simulated : 0 };
  }

  /** One sighting source per species this chapter renders, for the discovery scanner. */
  sightings(): SightingSource[] {
    const sources = this.fish.sightings();
    const sharks = this.swimmers;
    if (sharks.length > 0) {
      sources.push({
        species: 'carcharhinus-longimanus',
        nearest(from, out, accept) {
          let best = Infinity;
          for (const s of sharks) {
            const d = s.motion.position.distanceTo(from);
            if (d < best && accept(s.motion.position)) {
              best = d;
              out.copy(s.motion.position);
            }
          }
          return best;
        },
      });
    }
    return sources;
  }
}
