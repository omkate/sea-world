import { InstancedBufferAttribute, type Group, type Vector3 } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { createFishGeometry } from '../../creatures/fish/fishGeometry';
import { createFishMaterial } from '../../creatures/fish/fishMaterial';
import type { FishSpeciesVisual } from '../../creatures/fish/reefFish';
import type { SightingSource } from '../../discovery/scanner/Scanner';
import { School, createSchoolMatrices, type SchoolOptions } from './School';

export interface CreatureCounts {
  total: number;
  simulated: number;
}

/** Adds creature counts, e.g. a chapter's fish and its large animals. */
export const addCounts = (a: CreatureCounts, b: CreatureCounts): CreatureCounts => ({ total: a.total + b.total, simulated: a.simulated + b.simulated });

/**
 * Every fish school of a chapter. Groups are gathered per species, then each species becomes
 * one instanced school (one draw call) holding all its groups. Groups beyond a size-scaled
 * range are collapsed and not simulated; nearby schools step at 30 Hz on alternate frames.
 */
export class SchoolSet {
  private readonly groups = new Map<string, SchoolOptions[]>();
  private readonly built = new Map<string, School>();
  private readonly schools: School[] = [];
  /** Per-school distance (m) beyond which a group is hidden and not simulated. */
  private readonly range: number[] = [];
  private frame = 0;

  constructor(
    private readonly visual: (speciesId: string) => FishSpeciesVisual,
    private readonly allowed: (speciesId: string, depth: number) => boolean,
  ) {}

  /**
   * Adds a group of `speciesId` at `depth` (only if the species is recorded there). Returns
   * the group's index within its species' school, or -1 when it was not placed.
   */
  add(speciesId: string, depth: number, opts: SchoolOptions): number {
    if (this.built.size > 0) throw new Error('SchoolSet.add after build');
    if (!this.allowed(speciesId, depth)) return -1;
    const list = this.groups.get(speciesId) ?? [];
    list.push(opts);
    this.groups.set(speciesId, list);
    return list.length - 1;
  }

  build(u: FrameUniforms, kd: readonly [number, number, number], parent: Group): void {
    for (const [speciesId, groups] of this.groups) {
      const visual = this.visual(speciesId);
      const length = Math.max(...groups.map((g) => g.length));
      const count = groups.reduce((sum, g) => sum + g.count, 0);
      // Mesh density follows body size: a 7 cm chromis never fills more than a few pixels' worth,
      // and only fish of a metre or more (tuna) get the full ring count.
      const [rings, segments] = length < 0.1 ? [22, 12] : length < 0.4 ? [30, 16] : length < 1 ? [36, 18] : [44, 22];
      const geometry = createFishGeometry(visual.morph, rings, segments);
      const swim = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
      const matrices = createSchoolMatrices(count);
      const material = createFishMaterial(u, kd, visual.morph, visual.pattern, swim, matrices.interleaved);
      const school = new School(geometry, material, swim, groups, matrices);
      school.mesh.name = speciesId;
      this.schools.push(school);
      this.built.set(speciesId, school);
      // Roughly where a fish of this length falls under ~6 px at 1080p, plus the home range; small
      // fish still show as a cloud over their coral head out to ~14 m.
      this.range.push(Math.min(40, Math.max(14, length * 150 + Math.max(...groups.map((g) => g.homeRadius)))));
      parent.add(school.mesh);
    }
    this.groups.clear();
  }

  school(speciesId: string): School | undefined {
    return this.built.get(speciesId);
  }

  update(dt: number, time: number, camera: Vector3): void {
    this.frame++;
    this.schools.forEach((s, i) => {
      s.mesh.visible = s.cull(camera, this.range[i]!);
      if (s.mesh.visible && (this.frame + i) % 2 === 0) s.update(Math.min(dt * 2, 1 / 15), time, camera);
    });
  }

  /** Fish placed, and fish simulated right now (for the debug panel). */
  counts(): CreatureCounts {
    return this.schools.reduce((c, s) => ({ total: c.total + s.total, simulated: c.simulated + (s.mesh.visible ? s.simulated : 0) }), { total: 0, simulated: 0 });
  }

  sightings(): SightingSource[] {
    return this.schools.map((school) => ({ species: school.mesh.name, nearest: (from, out, accept) => school.nearest(from, out, accept) }));
  }
}
