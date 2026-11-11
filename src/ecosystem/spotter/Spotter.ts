import { Frustum, Matrix4, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { Wanderer } from '../../creatures/hero/Wanderer';

export interface SpotterGroup {
  species: string;
  members: Wanderer[];
  /** How far ahead (m) to send a recruited animal; fast swimmers go further to cross the view. */
  reach?: [number, number];
}

/** Home ranges further than this from the camera don't belong to the current part of the dive. */
const RELEVANT = 38;
/** An animal counts as on screen when inside the view and nearer than this (the medium hides the rest). */
const VISIBLE = 30;
const CHECK_EVERY = 0.5;

/**
 * Keeps each species near the camera on screen without scripting it: when no member of a
 * nearby species is visible, the closest one is given a natural wander destination inside the
 * view. Only that one animal is recruited at a time, and ordinary steering (turn limits,
 * spacing from every other animal) still applies, so arrivals look like chance encounters.
 */
export class Spotter {
  private readonly frustum = new Frustum();
  private readonly m = new Matrix4();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly point = new Vector3();
  private clock = 0;
  private seed = 1;

  constructor(private readonly groups: SpotterGroup[]) {}

  update(dt: number, camera: PerspectiveCamera): void {
    this.clock += dt;
    if (this.clock < CHECK_EVERY) return;
    this.clock = 0;
    this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m, camera.coordinateSystem);
    camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, camera.up).normalize();

    for (const g of this.groups) {
      const nearby = g.members.filter((w) => w.o.home.distanceTo(camera.position) < RELEVANT || w.position.distanceTo(camera.position) < RELEVANT);
      if (nearby.length === 0) continue;
      if (nearby.some((w) => this.isVisible(w, camera))) continue;
      const closest = nearby.reduce((a, b) => (a.position.distanceTo(camera.position) <= b.position.distanceTo(camera.position) ? a : b));
      closest.suggest(this.viewPoint(camera, g.reach ?? [9, 15]));
    }
  }

  isVisible(w: Wanderer, camera: PerspectiveCamera): boolean {
    return w.position.distanceTo(camera.position) < VISIBLE && this.frustum.containsPoint(w.position);
  }

  /** A point comfortably inside the frame, `reach` metres ahead, off to one side. */
  private viewPoint(camera: PerspectiveCamera, reach: [number, number]): Vector3 {
    const r1 = this.rand();
    const r2 = this.rand();
    return this.point
      .copy(camera.position)
      .addScaledVector(this.forward, reach[0] + r1 * (reach[1] - reach[0]))
      .addScaledVector(this.right, (r2 - 0.5) * 8);
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
