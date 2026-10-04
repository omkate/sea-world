import { Group, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { AssetLibrary } from '../../assets/AssetLibrary';
import { loadSpecies } from '../../data/species';
import { eligibleSpecies } from '../../ecosystem/spawning/eligibility';
import { HeroEncounter, type HeroEncounterOptions } from '../../creatures/hero/HeroEncounter';
import type { CreatureCounts } from '../../ecosystem/schooling/SchoolSet';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { MIDNIGHT_RANGE, MIDNIGHT_SCENES, constellationStrength } from './scenes';

type Staging = Omit<HeroEncounterOptions, 'encounter'> & { asset: string; scene: keyof typeof MIDNIGHT_SCENES };

/**
 * One hero per scene. Distances are set so the animal fills a good share of the frame at its real
 * size (55° lens): the whales are seen whole from several metres, the fish from about a metre.
 * Successive scenes cross on opposite diagonals.
 */
export const MIDNIGHT_HEROES: readonly Staging[] = [
  {
    // Photogrammetry of a real yellowfin; tuna swim with a stiff body and a fast-beating tail.
    asset: 'yellowfin-tuna', scene: 'yellowfin', species: 'thunnus-albacares', forward: '-x', style: 'thunniform',
    ahead: 2.2, path: 1, beatHz: 2.2, amplitude: 0.06, specular: 0.9, roughness: 0.25, light: 0.6,
  },
  {
    asset: 'cuviers-beaked-whale', scene: 'beakedWhale', species: 'ziphius-cavirostris', forward: '-z', style: 'fluke',
    ahead: 7, path: -1, beatHz: 0.45, amplitude: 0.05, roughness: 0.4, specular: 0.5, light: 0.8,
  },
  {
    asset: 'sperm-whale', scene: 'spermWhale', species: 'physeter-macrocephalus', forward: '+z', style: 'fluke',
    ahead: 15, path: 1, beatHz: 0.22, amplitude: 0.05, roughness: 0.45, specular: 0.4, light: 0.9,
  },
  {
    // Photogrammetry of a real grenadier; rattails scull slowly with a wave down the long tail.
    asset: 'grenadier', scene: 'grenadier', species: 'coryphaenoides-yaquinae', forward: '-x', style: 'eel',
    ahead: 0.9, path: -1, beatHz: 0.7, amplitude: 0.04, specular: 0.7, roughness: 0.3, light: 0.6,
  },
];

/**
 * The midnight zone. One animal per depth band, and in every band it crosses the view for the
 * whole band (a fast scroll cannot skip it): a yellowfin tuna in front of the bioluminescence
 * constellation; Cuvier's beaked whale; a hunting sperm whale; an abyssal grenadier.
 */
export class MidnightChapter {
  readonly group = new Group();
  private readonly heroes: HeroEncounter[] = [];
  private readonly origin = new Vector3();
  private readonly forward = new Vector3();
  private originSet = false;

  static async create(u: FrameUniforms, kd: readonly [number, number, number], library: AssetLibrary): Promise<MidnightChapter> {
    await library.load(MIDNIGHT_HEROES.map((h) => h.asset));
    return new MidnightChapter(u, kd, library);
  }

  private constructor(u: FrameUniforms, kd: readonly [number, number, number], library: AssetLibrary) {
    this.group.name = 'midnight-chapter';
    const species = loadSpecies();
    for (const { asset, scene, ...o } of MIDNIGHT_HEROES) {
      const [a, b] = MIDNIGHT_SCENES[scene];
      // Only species recorded at the site across the scene's depths.
      if (!eligibleSpecies(species, (a + b) / 2, 'mariana').some((s) => s.id === o.species)) continue;
      const hero = new HeroEncounter(u, kd, library.get(asset), { ...o, encounter: [a, b] });
      this.heroes.push(hero);
      this.group.add(hero.mesh);
    }
  }

  isActive(depth: number): boolean {
    return depth > MIDNIGHT_RANGE[0] && depth < MIDNIGHT_RANGE[1];
  }

  update(dt: number, _time: number, camera: PerspectiveCamera, depth: number, u: FrameUniforms): void {
    this.group.visible = this.isActive(depth);
    const strength = this.group.visible ? constellationStrength(depth) : 0;
    u.constellation.value = strength;
    camera.getWorldDirection(this.forward);
    if (strength > 0) {
      // Ripples start a few metres ahead; the origin is re-anchored if the camera drifts away.
      if (!this.originSet || this.origin.distanceTo(camera.position) > 8) {
        this.origin.copy(camera.position).addScaledVector(this.forward, 3);
        this.originSet = true;
      }
      u.constellationOrigin.value.copy(this.origin);
    } else {
      this.originSet = false;
    }
    if (!this.group.visible) return;
    for (const h of this.heroes) h.update(dt, camera);
  }

  creatureCounts(): CreatureCounts {
    const simulated = this.group.visible ? this.heroes.filter((h) => h.mesh.visible).length : 0;
    return { total: this.heroes.length, simulated };
  }

  sightings(): SightingSource[] {
    return this.heroes.map((h) => h.sighting());
  }
}
