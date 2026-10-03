import { Group, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { loadSpecies } from '../../data/species';
import { eligibleSpecies } from '../../ecosystem/spawning/eligibility';
import { AnglerEncounter } from '../../creatures/angler/AnglerEncounter';
import type { CreatureCounts } from '../../ecosystem/schooling/SchoolSet';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { MIDNIGHT_RANGE, MIDNIGHT_SCENES, constellationStrength } from './scenes';

/**
 * The midnight zone. Darkness dominates and glow is sparse (the plan's gate): the first scene
 * turns the lamp off and lets a constellation of plankton flashes build and fade around the
 * lens; in the second an anglerfish's lure is the only light.
 */
export class MidnightChapter {
  readonly group = new Group();
  private readonly angler: AnglerEncounter | null;
  private readonly origin = new Vector3();
  private readonly forward = new Vector3();
  private originSet = false;

  constructor(u: FrameUniforms, kd: readonly [number, number, number]) {
    this.group.name = 'midnight-chapter';
    const species = loadSpecies();
    const allowed = (id: string, depth: number) => eligibleSpecies(species, depth, 'mariana').some((s) => s.id === id);

    const [aFrom, aTo] = MIDNIGHT_SCENES.anglerfish;
    this.angler = allowed('melanocetus-johnsonii', (aFrom + aTo) / 2)
      ? new AnglerEncounter(u, kd, { ahead: 0.9, side: 0.15, size: 0.15, encounter: [aFrom - 10, aTo + 10] })
      : null;
    if (this.angler) this.group.add(this.angler.mesh);
  }

  isActive(depth: number): boolean {
    return depth > MIDNIGHT_RANGE[0] && depth < MIDNIGHT_RANGE[1];
  }

  update(dt: number, time: number, camera: PerspectiveCamera, depth: number, u: FrameUniforms): void {
    this.group.visible = this.isActive(depth);
    const strength = this.group.visible ? constellationStrength(depth) : 0;
    u.constellation.value = strength;
    if (strength > 0) {
      // Ripples start a few metres ahead; the origin is re-anchored if the camera drifts away.
      camera.getWorldDirection(this.forward);
      if (!this.originSet || this.origin.distanceTo(camera.position) > 8) {
        this.origin.copy(camera.position).addScaledVector(this.forward, 3);
        this.originSet = true;
      }
      u.constellationOrigin.value.copy(this.origin);
    } else {
      this.originSet = false;
    }
    if (!this.group.visible) return;
    this.angler?.update(dt, time, camera);
  }

  creatureCounts(): CreatureCounts {
    const n = this.angler ? 1 : 0;
    return { total: n, simulated: this.angler?.mesh.visible ? 1 : 0 };
  }

  sightings(): SightingSource[] {
    return this.angler ? [this.angler.sighting()] : [];
  }
}
