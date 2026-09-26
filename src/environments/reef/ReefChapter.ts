import { BufferGeometry, DoubleSide, Euler, FrontSide, type PerspectiveCamera, type Texture, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { attribute, float, mix, mx_noise_vec3, normalize, normalWorld, positionLocal, positionWorld, sin, smoothstep, texture, uv, vec3 } from 'three/tsl';
import type { ShaderNode } from '../../shaders/tsl/types';
import type { FrameUniforms } from '../../core/engine/uniforms';
import { underwaterLit } from '../../shaders/tsl/underwaterLighting';
import { createRng } from '../../core/math/rng';
import { createReefTerrain } from './reefTerrain';
import { createAnemone, createBranchingCoral, createRock, createSeaFan } from './coralGeometry';
import { divePathX, divePathZ, reefFloorDepth, reefFloorY, reefSand, reefSlope } from './ReefSite';
import { School, type SchoolOptions } from '../../ecosystem/schooling/School';
import { CulledInstances } from './CulledInstances';
import { createFishGeometry } from '../../creatures/fish/fishGeometry';
import { createFishMaterial } from '../../creatures/fish/fishMaterial';
import { reefFish } from '../../creatures/fish/reefFish';
import { eligibleSpecies } from '../../ecosystem/spawning/eligibility';
import { loadSpecies } from '../../data/species';
import type { MarineSpecies } from '../../data/schemas';
import type { AssetLibrary } from '../../assets/AssetLibrary';
import { HeroTurtle } from '../../creatures/hero/HeroTurtle';
import { HeroSwimmer } from '../../creatures/hero/HeroSwimmer';
import type { Wanderer } from '../../creatures/hero/Wanderer';
import { Spotter } from '../../ecosystem/spotter/Spotter';

type Rgb3 = readonly [number, number, number];

type CoralMaterial = 'procedural' | 'tissue' | 'photo';

interface CoralType {
  name: string;
  geometries: BufferGeometry[];
  /** Higher-detail variants for colonies larger than `largeScale` (smooth silhouettes). */
  largeGeometries?: BufferGeometry[];
  largeScale?: number;
  palette: readonly Rgb3[];
  tip: Rgb3;
  max: number;
  scale: [number, number];
  /** Ecological suitability 0..1 for depth (m) and slope (rad). */
  suitability: (depth: number, slope: number) => number;
  alignToSlope: number;
  broadsideToCurrent?: boolean;
  /** procedural: generated mesh with baked shade; tissue: scanned skeleton, living colour in
   *  the shader; photo: scanned living colony with its photographic texture. */
  material: CoralMaterial;
  map?: Texture | null;
  /** Height of the geometry (m), used to derive occlusion on scans without baked shading. */
  height?: number;
}

const STAGHORN: CoralType = {
  name: 'staghorn-acropora',
  geometries: [createBranchingCoral(6), createBranchingCoral(7), createBranchingCoral(8)],
  palette: [[0.64, 0.54, 0.38], [0.5, 0.45, 0.6], [0.5, 0.5, 0.3], [0.58, 0.46, 0.34]],
  tip: [0.9, 0.86, 0.78],
  max: 110,
  scale: [0.9, 1.9],
  suitability: (d, s) => (d > 9 && d < 32 && s < 0.6 ? 0.07 : 0),
  alignToSlope: 0.2,
  material: 'procedural',
};

/**
 * Reef rock and rubble: dead-coral boulders and limestone blocks covered in turf and
 * coralline algae. Procedural and cheap; they fill open ground between living colonies.
 */
const ROCK: CoralType = {
  name: 'reef-rock',
  geometries: [createRock(1), createRock(2, 0.45), createRock(3, 0.75), createRock(4, 0.5)],
  palette: [[0.36, 0.33, 0.24], [0.42, 0.36, 0.3], [0.5, 0.36, 0.4], [0.32, 0.34, 0.26]],
  tip: [0.5, 0.45, 0.35],
  max: 600,
  scale: [0.3, 1.1],
  suitability: (d, s) => (d > 8 && d < 95 ? (s > 0.7 ? 0.22 : 0.16) : 0),
  alignToSlope: 0.8,
  material: 'procedural',
};


/** Gorgonian sea fans: no licensed scan of an Indo-Pacific gorgonian yet, so these stay procedural. */
const SEA_FAN: CoralType = {
  name: 'sea-fan',
  geometries: [createSeaFan(11), createSeaFan(12)],
  palette: [[0.62, 0.26, 0.16], [0.7, 0.42, 0.14], [0.5, 0.2, 0.3]],
  tip: [0.72, 0.36, 0.22],
  max: 380,
  scale: [0.6, 1.4],
  suitability: (d, s) => (d > 18 && d < 90 ? (s > 0.6 ? 0.45 : 0.24) : 0),
  alignToSlope: 0,
  broadsideToCurrent: true,
  material: 'procedural',
};

interface ScanSpec {
  id: string;
  palette: readonly Rgb3[];
  tip: Rgb3;
  max: number;
  scale: [number, number];
  suitability: (depth: number, slope: number) => number;
  alignToSlope: number;
}

/**
 * Real scans (see assets/manifest.json), kept light (≤ ~4k triangles each), and where each grows on a Guam fore-reef. Only scans of
 * whole colonies are used: museum fragments (a single branch, a piece of a table) would look
 * wrong scaled up to colony size, so those downloads are not placed.
 */
const SCANS: readonly ScanSpec[] = [
  { id: 'porites-lutea', palette: [[1, 1, 1], [1.05, 0.98, 0.9], [0.92, 1, 0.95]], tip: [1, 1, 1], max: 280, scale: [0.6, 1.3],
    suitability: (d, s) => (d > 9 && d < 55 && s < 0.9 ? 0.42 : 0), alignToSlope: 0.6 },
  // Platygyra daedalea: the available scan's cut boundary and uncaptured underside read as a
  // box from the dive camera's angle, so it is not placed until a better scan is found.
  // okinawa-branching: its flattened seabed skirt reads as a box from the dive camera, so it is
  // not placed.
  { id: 'acropora-humilis', palette: [[0.6, 0.5, 0.4], [0.52, 0.42, 0.58], [0.55, 0.52, 0.32]], tip: [0.86, 0.8, 0.7], max: 160, scale: [0.7, 1.5],
    suitability: (d, s) => (d > 9 && d < 20 && s < 0.6 ? 0.14 : 0), alignToSlope: 0.4 },
  { id: 'pocillopora-grandis', palette: [[0.62, 0.45, 0.42], [0.5, 0.38, 0.28], [0.56, 0.5, 0.36]], tip: [0.8, 0.62, 0.58], max: 200, scale: [0.6, 1.4],
    suitability: (d, s) => (d > 9 && d < 25 && s < 0.7 ? 0.2 : 0), alignToSlope: 0.5 },
  // Fluted giant clams wedge into the reef; the mantle shows blue-green-brown mottling.
  { id: 'tridacna-squamosa', palette: [[0.3, 0.42, 0.5], [0.42, 0.4, 0.26], [0.28, 0.48, 0.4]], tip: [0.72, 0.7, 0.62], max: 40, scale: [0.8, 1.3],
    suitability: (d, s) => (d > 9 && d < 30 && s < 0.7 ? 0.02 : 0), alignToSlope: 0.7 },
  // Stylaster sanguineus is not confirmed at Guam (no regional records; see species catalogue),
  // so its scan is not placed on this reef.
];

/**
 * A scan is placed only if its species, or at least its genus, is recorded at the site in the
 * species manifest (e.g. a Porites lutea colony stands in for Porites, recorded at Guam as
 * P. lobata). Scans without a species claim are generic reef framework.
 */
function scanAllowed(species: string | null, known: readonly MarineSpecies[]): boolean {
  if (!species) return true;
  const genus = species.split(' ')[0]!;
  return known.some((k) => k.sites.includes('mariana') && (k.scientificName === species || k.scientificName.split(' ')[0] === genus));
}

/** Where the camera will be at a given depth, offset ahead (−z) and toward the reef (−x). */
const UP_AXIS = new Vector3(0, 1, 0);

function aheadOfCamera(depth: number, ahead: number, toReef: number): Vector3 {
  const x = divePathX(depth) - toReef;
  const z = divePathZ(depth) - ahead;
  return new Vector3(x, reefFloorY(x, z), z);
}

/**
 * The Guam fore-reef chapter: terrain, ecologically placed coral colonies, an anemone with
 * its anemonefish, and fish populations positioned along the camera's dive path.
 */
export class ReefChapter {
  readonly group = new Group();
  private readonly schools: School[] = [];
  private readonly culled: CulledInstances[] = [];
  private frame = 0;

  /** Loads the reef's scanned assets, then builds the chapter. */
  static async create(u: FrameUniforms, kd: readonly [number, number, number], library: AssetLibrary, surface: (x: number, z: number) => number): Promise<ReefChapter> {
    await library.load([...SCANS.map((s) => s.id), 'green-turtle', 'whitetip-reef-shark', 'manta-ray', 'spinner-dolphin']);
    return new ReefChapter(u, kd, library, surface);
  }

  private readonly turtles: HeroTurtle[] = [];
  /** Every large animal, for mutual spacing. */
  private readonly bigAnimals: Wanderer[] = [];
  private spotter: Spotter | null = null;
  private readonly swimmers: HeroSwimmer[] = [];
  private readonly pods: { members: HeroSwimmer[]; offsets: Vector3[] }[] = [];
  private readonly slot = new Vector3();
  private readonly slotFwd = new Vector3();
  private readonly slotRight = new Vector3();
  private readonly lastLeaderPos = new Vector3();
  private readonly camForward = new Vector3();

  private constructor(u: FrameUniforms, kd: readonly [number, number, number], library: AssetLibrary, private readonly surface: (x: number, z: number) => number) {
    this.group.name = 'reef-chapter';
    this.group.add(createReefTerrain(u, kd));
    const species = loadSpecies();
    const scanTypes: CoralType[] = SCANS.filter((spec) => scanAllowed(library.get(spec.id).entry.species, species)).map((spec) => {
      const asset = library.get(spec.id);
      asset.geometry.computeBoundingBox();
      return {
        ...spec,
        name: spec.id,
        geometries: [asset.geometry],
        material: asset.map ? 'photo' : 'tissue',
        map: asset.map,
        height: asset.geometry.boundingBox!.max.y,
      } satisfies CoralType;
    });
    this.scatterCorals(u, kd, [...scanTypes, STAGHORN, SEA_FAN, ROCK]);

    const allowed = (id: string, depth: number) => eligibleSpecies(species, depth, 'mariana').some((s) => s.id === id);

    // Blue-green chromis hover in clouds over branching coral heads.
    for (const [i, d] of [11, 15, 19, 27, 32].entries()) {
      const home = aheadOfCamera(d, 7 + i, 3 + i);
      this.addThicket(u, kd, home, 5 + i);
      this.addSchool(u, kd, 'chromis-viridis', allowed, d, {
        count: 140, length: 0.075, lengthVariation: 0.15, home, homeRadius: 2.2,
        yMin: home.y + 0.35, yMax: home.y + 2.2, cruiseBL: 1.4, maxTurn: 5, neighbourBL: 4, separationBL: 1.4,
        cohesion: 0.75, fleeRadius: 1.8, floorClearance: 0.3, seed: 100 + i,
      });
    }
    // Convict surgeonfish graze the slope in loose aggregations.
    for (const [i, d] of [14, 24, 31, 37].entries()) {
      const home = aheadOfCamera(d, 9, 1);
      this.addSchool(u, kd, 'acanthurus-triostegus', allowed, d, {
        count: 55, length: 0.17, lengthVariation: 0.15, home, homeRadius: 9,
        yMin: home.y + 0.3, yMax: home.y + 2.5, cruiseBL: 1.0, maxTurn: 3.2, neighbourBL: 5, separationBL: 1.5,
        cohesion: 0.45, fleeRadius: 3, floorClearance: 0.4, seed: 200 + i,
      });
    }
    // Raccoon butterflyfish in pairs.
    for (const [i, d] of [12, 17, 22, 28, 33, 40].entries()) {
      const home = aheadOfCamera(d, 6 + i, (i % 2) * 3);
      this.addSchool(u, kd, 'chaetodon-lunula', allowed, d, {
        count: 2, length: 0.17, lengthVariation: 0.08, home, homeRadius: 4,
        yMin: home.y + 0.4, yMax: home.y + 2.4, cruiseBL: 0.8, maxTurn: 2.8, neighbourBL: 8, separationBL: 1.5,
        cohesion: 0.9, fleeRadius: 2.2, floorClearance: 0.5, seed: 300 + i,
      });
    }
    // Orangespine unicornfish cruise the upper slope in a small group.
    {
      const d = 26;
      const home = aheadOfCamera(d, 10, -2);
      this.addSchool(u, kd, 'naso-lituratus', allowed, d, {
        count: 12, length: 0.36, lengthVariation: 0.15, home, homeRadius: 14,
        yMin: home.y + 1, yMax: home.y + 5, cruiseBL: 0.9, maxTurn: 1.8, neighbourBL: 6, separationBL: 1.8,
        cohesion: 0.6, fleeRadius: 3.5, floorClearance: 1, seed: 400,
      });
    }
    // An anemone with a pair of orange-fin anemonefish that never leave it.
    {
      const d = 13;
      const spot = aheadOfCamera(d, 5.5, 1);
      this.addAnemone(u, kd, spot);
      this.addSchool(u, kd, 'amphiprion-chrysopterus', allowed, d, {
        count: 2, length: 0.12, lengthVariation: 0.1, home: spot.clone(), homeRadius: 0.35,
        yMin: spot.y + 0.2, yMax: spot.y + 0.55, cruiseBL: 0.9, maxTurn: 6, neighbourBL: 6, separationBL: 1.5,
        cohesion: 0.2, fleeRadius: 0.4, floorClearance: 0.18, seed: 500,
      });
    }

    // A green turtle glides along the slope below the camera's path.
    if (allowed('chelonia-mydas', 18)) {
      for (const [d, ahead, side, seed] of [[18, 8, 2, 71], [12, 10, -4, 72]] as const) {
        const t = new HeroTurtle(u, kd, library.get('green-turtle'), aheadOfCamera(d, ahead, side), this.bigAnimals, seed);
        this.turtles.push(t);
        this.group.add(t.mesh);
      }
    }

    // Large animals, each only inside its recorded depth range at Guam.
    const addSwimmer = (speciesId: string, depth: number, make: () => HeroSwimmer) => {
      if (!allowed(speciesId, depth)) return;
      const swimmer = make();
      this.swimmers.push(swimmer);
      this.group.add(swimmer.mesh);
    };
    // Home ranges are spread along the dive path, near and far, reef side and open-water side,
    // so large animals turn up throughout the descent. All share the spacing list, so none ever
    // overlap; animals of a species share one mesh and material setup (no extra downloads).
    const home = (depth: number, ahead: number, side: number) => aheadOfCamera(depth, ahead, side);
    const n = this.bigAnimals;

    // Whitetip reef sharks (2.1 m, their maximum) cruise the lower slope at about lens height.
    const sharks: [number, number, number][] = [[31, 6, 1], [38, 8, 4]];
    sharks.forEach(([d, ahead, side], i) =>
      addSwimmer('triaenodon-obesus', d, () => new HeroSwimmer(u, kd, library.get('whitetip-reef-shark'), {
        forward: '+x', style: 'lateral', beatHz: 0.9, amplitude: 0.06,
        wander: { home: home(d, ahead, side), radius: 7, yMin: 2.5, yMax: 5.5, floor: reefFloorY, cruise: 0.75 + i * 0.08, maxTurn: 0.45, seed: 11 + i * 7, neighbours: n, space: 2 },
      })));
    // An oceanic whitetip (3 m) patrols the blue water off the drop-off. The species is known
    // for approaching divers, so it is the one that swims up to inspect the camera. Rendered
    // with the reef-shark scan scaled up (same carcharhinid body plan; noted in the manifest).
    addSwimmer('carcharhinus-longimanus', 35, () => new HeroSwimmer(u, kd, library.get('whitetip-reef-shark'), {
      name: 'oceanic-whitetip', forward: '+x', style: 'lateral', beatHz: 0.6, amplitude: 0.05, scale: 3 / 2.1,
      wander: { home: home(35, 10, -9), radius: 12, yMin: -46, yMax: -26, floor: null, cruise: 0.9, maxTurn: 0.3, maxPitch: 0.2, seed: 29, neighbours: n, space: 3 },
      investigate: { range: 30, interval: [20, 34], closest: 1.6, speedScale: 1.7 },
    }));

    // Reef mantas glide over the upper and mid slope.
    const mantas: [number, number, number][] = [[20, 9, 0], [27, 15, -9]];
    mantas.forEach(([d, ahead, side], i) =>
      addSwimmer('mobula-alfredi', d, () => new HeroSwimmer(u, kd, library.get('manta-ray'), {
        forward: '+z', style: 'wing', beatHz: 0.2 + i * 0.03, amplitude: 0.16,
        wander: { home: home(d, ahead, side), radius: 10, yMin: 2.5, yMax: 7, floor: reefFloorY, cruise: 0.65 + i * 0.1, maxTurn: 0.25, maxPitch: 0.2, seed: 41 + i * 5, neighbours: n, space: 3 },
      })));

    // Spinner dolphin pods high in the water: one over the reef flat, one further out.
    // Pods near and far, cruising a few metres down and leaping out now and then.
    // The near pod ranges ~20 m in front of where the dive starts, so its leaps are seen from
    // the surface and the shallows; the second pod is further out.
    this.addPod(u, kd, library, allowed, home(0, 12, 0), 4, 13, -6.5, -3.5);
    this.addPod(u, kd, library, allowed, home(4, 40, -12), 3, 61, -7, -3.5);

    // Keep every species near the camera on screen; for pods, the leader brings the pod along.
    const bySpecies = (id: string) => this.swimmers.filter((h) => h.mesh.name === id).map((h) => h.motion);
    this.spotter = new Spotter([
      { species: 'whitetip-reef-shark', members: bySpecies('whitetip-reef-shark') },
      { species: 'oceanic-whitetip', members: bySpecies('oceanic-whitetip') },
      { species: 'manta-ray', members: bySpecies('manta-ray') },
      { species: 'green-turtle', members: this.turtles.map((t) => t.motion) },
      { species: 'spinner-dolphin', members: this.pods.map((p) => p.members[0]!.motion), reach: [12, 20] },
    ]);
  }

  /** World position of a formation offset (x right, y up, z forward) relative to the leader. */
  private formationSlot(leader: HeroSwimmer, offset: Vector3): Vector3 {
    // Heading-only frame, so a leaping or spinning leader never flings the formation around.
    this.slotFwd.copy(leader.motion.direction).setY(0).normalize();
    this.slotRight.crossVectors(UP_AXIS, this.slotFwd);
    const base = leader.airborne ? this.lastLeaderPos : leader.motion.position;
    if (!leader.airborne) this.lastLeaderPos.copy(leader.motion.position);
    return this.slot
      .copy(base)
      .addScaledVector(this.slotRight, offset.x)
      .addScaledVector(UP_AXIS, offset.y)
      .addScaledVector(this.slotFwd, offset.z);
  }

  /**
   * A dolphin pod: the leader wanders; the others hold a staggered echelon beside and behind
   * it, as pods travel. Members start in formation, so the pod never begins stacked.
   */
  private addPod(
    u: FrameUniforms,
    kd: readonly [number, number, number],
    library: AssetLibrary,
    allowed: (id: string, depth: number) => boolean,
    centre: Vector3,
    count: number,
    seed: number,
    yMin: number,
    yMax: number,
  ): void {
    if (!allowed('stenella-longirostris', -yMax)) return;
    const layout = [new Vector3(0, 0, 0), new Vector3(-1.8, -0.5, -2.4), new Vector3(2, 0.3, -3.6), new Vector3(-0.8, -1.1, -5.6)];
    const offsets = layout.slice(0, count);
    const members = offsets.map((_, i) => {
      const d = new HeroSwimmer(u, kd, library.get('spinner-dolphin'), {
        forward: '+z', style: 'vertical', beatHz: 1.5, amplitude: 0.05, stretchZ: 1.12,
        // Spinner dolphins reach ~2.4 m; individuals vary.
        size: 1.12 + ((seed * 7 + i * 13) % 5) * 0.03,
        surface: this.surface,
        leap: { interval: [6, 14], launchSpeed: 7.5, spinChance: 0.5 },
        wander: {
          home: centre.clone().setY(0), radius: 12, yMin, yMax, floor: null, cruise: 2.6, maxTurn: i === 0 ? 0.55 : 0.9,
          maxPitch: 0.45, seed: seed + i, neighbours: this.bigAnimals, space: 0.9,
        },
      });
      this.group.add(d.mesh);
      return d;
    });
    const [leader, ...rest] = members;
    leader!.update(0.016, new Vector3(0, 1e6, 0), new Vector3(0, 0, -1));
    rest.forEach((m, k) => m.motion.place(this.formationSlot(leader!, offsets[k + 1]!).clone(), leader!.motion.direction));
    this.pods.push({ members, offsets });
  }

  /** The chapter is live from the surface to the base of the wall. */
  isActive(depth: number): boolean {
    return depth < 130;
  }

  update(dt: number, time: number, camera: PerspectiveCamera, depth: number, sceneryRange: number): void {
    this.group.visible = this.isActive(depth);
    if (!this.group.visible) return;
    // Beyond this range the medium has absorbed nearly everything; nothing further is drawn.
    for (const c of this.culled) c.update(camera, sceneryRange);
    this.spotter?.update(dt, camera);
    for (const t of this.turtles) t.update(dt, time);
    camera.getWorldDirection(this.camForward);
    for (const h of this.swimmers) h.update(dt, camera.position, this.camForward);
    for (const pod of this.pods) {
      const [leader, ...rest] = pod.members;
      leader!.update(dt, camera.position, this.camForward);
      rest.forEach((m, k) => m.update(dt, camera.position, this.camForward, this.formationSlot(leader!, pod.offsets[k + 1]!)));
    }
    // Fish beyond ~40 m are lost in the blue: hide them and skip their simulation. Nearby
    // schools step at 30 Hz, half of them on alternate frames, so the CPU cost stays flat.
    this.frame++;
    this.schools.forEach((s, i) => {
      const far = s.centre.distanceTo(camera.position) > 40;
      s.mesh.visible = !far;
      if (!far && (this.frame + i) % 2 === 0) s.update(Math.min(dt * 2, 1 / 15), time, camera.position);
    });
  }

  private addSchool(
    u: FrameUniforms,
    kd: readonly [number, number, number],
    speciesId: string,
    allowed: (id: string, depth: number) => boolean,
    depth: number,
    opts: Omit<SchoolOptions, 'floor'>,
  ): void {
    // Only verified or uncertain species whose recorded depth range includes this spot.
    if (!allowed(speciesId, depth)) return;
    const visual = reefFish(speciesId);
    // Mesh density follows body size: a 7 cm chromis never fills more than a few pixels' worth.
    const geometry = opts.length < 0.1 ? createFishGeometry(visual.morph, 22, 12) : opts.length < 0.2 ? createFishGeometry(visual.morph, 30, 16) : createFishGeometry(visual.morph);
    const swim = new InstancedBufferAttribute(new Float32Array(opts.count * 4), 4);
    const material = createFishMaterial(u, kd, visual.morph, visual.pattern, swim);
    const school = new School(geometry, material, swim, { ...opts, floor: reefFloorY });
    school.mesh.name = speciesId;
    this.schools.push(school);
    this.group.add(school.mesh);
  }

  private readonly coralMaterials = new Map<string, MeshBasicNodeMaterial>();

  /** One material per coral type; per-colony colour comes from the instanced `aCoral` attribute. */
  private coralMaterial(u: FrameUniforms, kd: readonly [number, number, number], type: Pick<CoralType, 'name' | 'tip' | 'material' | 'map' | 'height'>, sway = 0): MeshBasicNodeMaterial {
    const cached = this.coralMaterials.get(type.name);
    if (cached) return cached;
    const inst: ShaderNode = attribute('aCoral', 'vec4');
    const tip = type.tip;
    // Living tissue: polyp pits and lobes as normal relief, mottled pigment, darker cavities.
    const wp: ShaderNode = positionWorld;
    const lobes: ShaderNode = mx_noise_vec3(wp.mul(7));
    const polyps: ShaderNode = mx_noise_vec3(wp.mul(34));
    const reliefScale = type.material === 'photo' ? 0.35 : 1;
    const normal: ShaderNode = normalize((normalWorld as ShaderNode).add(lobes.mul(0.2 * reliefScale)).add(polyps.mul(0.3 * reliefScale)));
    const mottle: ShaderNode = lobes.y.mul(0.5).add(0.5);
    const pits: ShaderNode = polyps.x.mul(0.5).add(0.5);
    let albedo: ShaderNode;
    if (type.material === 'photo') {
      // The scan's own photograph, lightly varied per colony.
      // Underwater photogrammetry bakes the water's absorption into the texture (dark, blue-
      // green); lift it back toward the colony's surface albedo before lighting it again.
      albedo = (texture(type.map!, uv()) as ShaderNode).rgb.mul(1.7).mul(inst.xyz).mul(float(0.9).add(mottle.mul(0.2)));
    } else {
      let occlusion: ShaderNode;
      let tipness: ShaderNode;
      if (type.material === 'procedural') {
        const shade: ShaderNode = attribute('aShade', 'vec2');
        occlusion = shade.x;
        tipness = shade.y;
      } else {
        // Scanned skeletons carry no shading: derive it from height within the colony.
        const h = (positionLocal as ShaderNode).y.div(type.height ?? 1);
        occlusion = smoothstep(0, 0.7, h).mul(0.7).add(0.3);
        tipness = smoothstep(0.65, 1, h);
      }
      albedo = mix(inst.xyz, vec3(tip[0], tip[1], tip[2]), tipness.clamp(0, 1));
      albedo = albedo.mul(float(0.7).add(mottle.mul(0.45))).mul(float(0.78).add(pits.mul(0.3))).mul(float(0.3).add(occlusion.mul(0.7)));
    }
    const m = new MeshBasicNodeMaterial({ side: type.material === 'procedural' ? FrontSide : DoubleSide });
    if (sway > 0) {
      const p: ShaderNode = positionLocal;
      const phase: ShaderNode = (u.time as ShaderNode).mul(1.3).add(p.x.mul(9)).add(p.z.mul(7));
      const along: ShaderNode = (attribute('aShade', 'vec2') as ShaderNode).y;
      const w: ShaderNode = along.mul(along).mul(sway);
      const sx: ShaderNode = sin(phase).mul(w);
      const sz: ShaderNode = sin(phase.mul(0.8).add(1.3)).mul(w);
      const offset: ShaderNode = vec3(sx, 0, sz);
      m.positionNode = p.add(offset);
    }
    m.colorNode = underwaterLit(u, kd, {
      albedo,
      normal,
      roughness: float(0.7),
      specular: float(0.12),
      rim: float(0.2),
      caustics: true,
    });
    this.coralMaterials.set(type.name, m);
    return m;
  }

  /** Instanced mesh sharing the variant's buffers, with its own per-instance colour attribute. */
  private instanced(source: BufferGeometry, material: MeshBasicNodeMaterial, count: number): { mesh: InstancedMesh; colors: InstancedBufferAttribute } {
    const g = new BufferGeometry();
    for (const [name, attr] of Object.entries(source.attributes)) g.setAttribute(name, attr);
    g.setIndex(source.index);
    g.boundingSphere = source.boundingSphere;
    const colors = new InstancedBufferAttribute(new Float32Array(count * 4), 4);
    g.setAttribute('aCoral', colors);
    return { mesh: new InstancedMesh(g, material, count), colors };
  }

  private placeInstances(u: FrameUniforms, kd: readonly [number, number, number], type: CoralType, placements: { p: Vector3; scale: number; yaw: number; tilt: Vector3 }[], seed = 0): void {
    const rng = createRng(type.name.length * 97 + seed);
    const variants = [...type.geometries, ...(type.largeGeometries ?? [])];
    const small = type.geometries.length;
    const perGeometry = variants.map(() => [] as typeof placements);
    for (const pl of placements) {
      const large = type.largeGeometries && pl.scale > (type.largeScale ?? Infinity);
      const pool = large ? type.largeGeometries!.length : small;
      const offset = large ? small : 0;
      perGeometry[offset + Math.floor(rng() * pool)]!.push(pl);
    }
    const material = this.coralMaterial(u, kd, type);
    const q = new Quaternion();
    const e = new Euler();
    const m = new Matrix4();
    const up = new Vector3(0, 1, 0);
    perGeometry.forEach((list, gi) => {
      if (list.length === 0) return;
      const { mesh, colors } = this.instanced(variants[gi]!, material, list.length);
      list.forEach((pl, i) => {
        const c = type.palette[Math.floor(rng() * type.palette.length)]!;
        const v = 0.88 + rng() * 0.24;
        colors.setXYZW(i, c[0] * v, c[1] * v, c[2] * v, rng());
        q.setFromUnitVectors(up, up.clone().lerp(pl.tilt, type.alignToSlope).normalize());
        e.set(0, pl.yaw, 0);
        q.multiply(new Quaternion().setFromEuler(e));
        m.compose(pl.p, q, new Vector3(pl.scale, pl.scale, pl.scale));
        mesh.setMatrixAt(i, m);
      });
      mesh.name = type.name;
      this.culled.push(new CulledInstances(mesh, colors, variants[gi]!.boundingSphere?.radius ?? 1));
      this.group.add(mesh);
    });
  }

  private scatterCorals(u: FrameUniforms, kd: readonly [number, number, number], types: readonly CoralType[]): void {
    const rng = createRng(2024);
    const buckets = types.map(() => [] as { p: Vector3; scale: number; yaw: number; tilt: Vector3 }[]);
    const step = 1.7;
    // The corridor the camera passes through on its way down the reef.
    for (let z = -95; z <= 35; z += step) {
      for (let x = -95; x <= 105; x += step) {
        const px = x + (rng() - 0.5) * step;
        const pz = z + (rng() - 0.5) * step;
        const depth = reefFloorDepth(px, pz);
        if (depth < 8 || depth > 95) continue;
        // Concentrate colonies where the camera actually looks: within ~35 m of where the dive
        // path passes over this part of the reef.
        const pathDepth = Math.max(0, depth - 6);
        if (Math.hypot(px - divePathX(pathDepth), pz - divePathZ(pathDepth)) > 38) continue;
        if (reefSand(px, pz) > 0.35) continue;
        const slope = reefSlope(px, pz);
        // Colonies cluster: a low-frequency density field gives patches and gaps.
        const density = 0.55 + 0.45 * Math.sin(px * 0.21 + Math.sin(pz * 0.17) * 2) * Math.cos(pz * 0.19);
        const roll = rng();
        let acc = 0;
        for (let t = 0; t < types.length; t++) {
          const type = types[t]!;
          acc += type.suitability(depth, slope) * density;
          if (roll < acc) {
            const e = 0.6;
            const n = new Vector3(reefFloorY(px - e, pz) - reefFloorY(px + e, pz), 2 * e, reefFloorY(px, pz - e) - reefFloorY(px, pz + e)).normalize();
            const [s0, s1] = type.scale;
            const scale = s0 + (s1 - s0) * rng() ** 1.8;
            const yaw = type.broadsideToCurrent ? Math.PI / 2 + (rng() - 0.5) * 0.5 : rng() * Math.PI * 2;
            buckets[t]!.push({ p: new Vector3(px, reefFloorY(px, pz) - 0.05, pz), scale, yaw, tilt: n });
            break;
          }
        }
      }
    }
    // Sample uniformly from all suitable spots so the per-type cap never clusters colonies
    // at one end of the reef.
    types.forEach((type, i) => {
      const list = buckets[i]!;
      for (let k = list.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [list[k], list[j]] = [list[j]!, list[k]!];
      }
      this.placeInstances(u, kd, type, list.slice(0, type.max));
    });
  }

  /** A dense staghorn thicket: the chromis' refuge. */
  private addThicket(u: FrameUniforms, kd: readonly [number, number, number], centre: Vector3, seed: number): void {
    const rng = createRng(seed * 31);
    const type = STAGHORN;
    const list: { p: Vector3; scale: number; yaw: number; tilt: Vector3 }[] = [];
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * 1.4;
      const x = centre.x + Math.cos(a) * r;
      const z = centre.z + Math.sin(a) * r;
      list.push({ p: new Vector3(x, reefFloorY(x, z) - 0.05, z), scale: 1.1 + rng() * 0.8, yaw: rng() * Math.PI * 2, tilt: new Vector3(0, 1, 0) });
    }
    this.placeInstances(u, kd, type, list, seed);
  }

  private addAnemone(u: FrameUniforms, kd: readonly [number, number, number], spot: Vector3): void {
    const { mesh, colors } = this.instanced(createAnemone(3), this.coralMaterial(u, kd, { name: 'radianthus-magnifica', tip: [0.72, 0.62, 0.36], material: 'procedural' }, 0.018), 1);
    colors.setXYZW(0, 0.62, 0.52, 0.3, 0);
    mesh.setMatrixAt(0, new Matrix4().compose(spot.clone().setY(spot.y - 0.02), new Quaternion(), new Vector3(1, 1, 1)));
    mesh.name = 'radianthus-magnifica';
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }
}
