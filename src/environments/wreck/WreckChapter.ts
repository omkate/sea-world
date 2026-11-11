import { Group, Mesh } from 'three/webgpu';
import type { FrameUniforms } from '../../core/engine/uniforms';
import type { AssetLibrary, ScanAsset } from '../../assets/AssetLibrary';
import { WRECK_SITE } from '../reef/ReefSite';
import { WRECK_BASE_Y } from '../finale/finalePath';
import { ruinMaterial } from '../finale/ruinMaterial';

/**
 * The scan is one side of an iron hull (frames and stringers, with the stubs of the floor frames
 * reaching in to the keel line at model x ≈ −1.2 m once scaled to 28 m). Mirrored about that line
 * it becomes the whole hull; the second side leans out and sits a little lower and further aft,
 * so the two never read as copies.
 */
const KEEL_X = -1.21;
const SIDE_LEAN = 0.1;
/** Finale sets are drawn only once the camera is this deep (m); above 130 m they are out of frame. */
export const FINALE_VISIBLE_FROM = 125;
/** Finale progress after which the wreck is out of sight (the camera has crossed to the castle). */
const WRECK_UNTIL = 0.5;

/**
 * The first set of the finale: a rusted iron hull lying on the terrace at ~150 m, which the diver
 * swims through from the open stern to the bow (finalePath.ts).
 */
export class WreckChapter {
  readonly group = new Group();

  static async create(u: FrameUniforms, kd: readonly [number, number, number], library: AssetLibrary): Promise<WreckChapter> {
    await library.load(['wreck']);
    return new WreckChapter(u, kd, library.get('wreck'));
  }

  private constructor(u: FrameUniforms, kd: readonly [number, number, number], hull: ScanAsset) {
    this.group.name = 'wreck-chapter';
    this.group.visible = false;
    const site = new Group();
    site.name = 'wreck';
    site.position.set(WRECK_SITE.x, WRECK_BASE_Y, WRECK_SITE.z);
    site.rotation.y = WRECK_SITE.yaw;
    // Dry rust photographed on a beach, lifted for the dim light; fine flaking scale.
    const material = ruinMaterial(u, kd, hull.map, { lift: 1.35, bare: [0.32, 0.2, 0.12], relief: 5.5, silt: 0.75 });
    const standing = new Mesh(hull.geometry, material);
    standing.position.x = -KEEL_X;
    const fallen = new Mesh(hull.geometry, material);
    fallen.scale.x = -1;
    fallen.position.set(KEEL_X, -0.3, 0.5);
    const lean = new Group();
    lean.rotation.z = SIDE_LEAN;
    lean.add(fallen);
    site.add(standing, lean);
    this.group.add(site);
  }

  /** Drawn only through its part of the film (the swim across leaves it behind in the blue). */
  update(depth: number, t: number): void {
    this.group.visible = depth > FINALE_VISIBLE_FROM && t < WRECK_UNTIL;
  }
}
