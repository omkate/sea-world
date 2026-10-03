import { Vector3, type PerspectiveCamera } from 'three/webgpu';

/** Something in the scene that can say where its nearest member of a species is. */
export interface SightingSource {
  species: string;
  /**
   * Writes the member nearest `from` that passes `accept` (on screen) into `out` and returns
   * its distance (Infinity if none).
   */
  nearest(from: Vector3, out: Vector3, accept: (p: Vector3) => boolean): number;
}

export interface Sighting {
  species: string;
  /** CSS pixels from the top-left of the viewport. */
  x: number;
  y: number;
  distance: number;
  /** Rough on-screen half length of the animal (CSS px), so the glyph can sit beside it. */
  radius: number;
}

/** Glyphs shown at once; more would turn the frame into a HUD. */
export const MAX_SIGHTINGS = 3;
const INTERVAL = 0.1;
/** Keep glyphs off the frame edges, where they would sit on the HUD or be cut off. */
const EDGE = 0.86;

/**
 * Distance (m) at which a species counts as "near the camera": small fish only when close
 * enough to tell apart (a 7 cm chromis at ~5 m), large animals from further away (an 80 cm
 * skipjack at 20 m is still ~45 px wide at 1080p). Uses the typical adult size.
 */
export function scanRange(sizeTypical: number): number {
  return Math.min(25, Math.max(4, 4 + sizeTypical * 20));
}

/** Half length on screen (px) below which an animal is too small or faint to mark. */
export const MIN_GLYPH_RADIUS = 8;
/** Already-discovered species are marked again only on close encounters (half length, px). */
export const CLOSE_ENCOUNTER_RADIUS = 24;

/**
 * Picks distinct species worth marking: big enough on screen to be seen, undiscovered species
 * first (nearest first), and discovered ones only when they come close. Discovery is not a
 * pointer (plan §8): a species that is always around the camera must not stay marked.
 */
export function selectSightings(candidates: readonly Sighting[], max = MAX_SIGHTINGS, discovered: (species: string) => boolean = () => false): Sighting[] {
  const seen = new Set<string>();
  return [...candidates]
    .filter((s) => s.radius >= (discovered(s.species) ? CLOSE_ENCOUNTER_RADIUS : MIN_GLYPH_RADIUS))
    .sort((a, b) => Number(discovered(a.species)) - Number(discovered(b.species)) || a.distance - b.distance)
    .filter((s) => !seen.has(s.species) && seen.add(s.species))
    .slice(0, max);
}

/**
 * Finds which species are near the camera and on screen, at 10 Hz (never per frame). Pure
 * bookkeeping: no DOM, so it can run inside the render loop.
 */
export class Scanner {
  private clock = INTERVAL;
  private readonly p = new Vector3();
  private readonly forward = new Vector3();
  private readonly toP = new Vector3();
  private readonly ndc = new Vector3();
  private camera: PerspectiveCamera | null = null;
  /** In front of the lens and inside the frame margins. */
  private readonly inView = (p: Vector3): boolean => {
    const camera = this.camera!;
    if (this.toP.subVectors(p, camera.position).dot(this.forward) <= 0) return false;
    this.ndc.copy(p).project(camera);
    return Math.abs(this.ndc.x) <= EDGE && Math.abs(this.ndc.y) <= EDGE;
  };
  private readonly ranges: Map<string, number>;
  private readonly sizes: Map<string, number>;

  constructor(
    private readonly sources: readonly SightingSource[],
    sizeOf: (species: string) => number,
    private readonly discovered: (species: string) => boolean = () => false,
  ) {
    this.sizes = new Map(sources.map((s) => [s.species, sizeOf(s.species)]));
    this.ranges = new Map(sources.map((s) => [s.species, scanRange(sizeOf(s.species))]));
    // A species may be rendered by several chapters; each source is scanned on its own.
  }

  /** Species that the dive can currently show (used to label the codex honestly). */
  get species(): Set<string> {
    return new Set(this.sources.map((s) => s.species));
  }

  /** Returns the current sightings on a scan tick, or null between ticks. */
  update(dt: number, camera: PerspectiveCamera, width: number, height: number): Sighting[] | null {
    this.clock += dt;
    if (this.clock < INTERVAL) return null;
    this.clock = 0;
    camera.getWorldDirection(this.forward);
    this.camera = camera;
    const found: Sighting[] = [];
    // Pixels per metre at 1 m from the lens.
    const focal = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const s of this.sources) {
      const range = this.ranges.get(s.species)!;
      const d = s.nearest(camera.position, this.p, (p) => p.distanceToSquared(camera.position) <= range * range && this.inView(p));
      if (!(d <= range)) continue;
      this.p.project(camera);
      const radius = Math.min(160, ((this.sizes.get(s.species)! / 2) * focal) / Math.max(d, 0.5));
      found.push({ species: s.species, x: (this.p.x * 0.5 + 0.5) * width, y: (-this.p.y * 0.5 + 0.5) * height, distance: d, radius });
    }
    return selectSightings(found, MAX_SIGHTINGS, this.discovered);
  }
}
