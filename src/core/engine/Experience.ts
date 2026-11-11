import { PerspectiveCamera, Scene, Timer, Vector3, type Object3D } from 'three/webgpu';
import type { RendererInfo } from '../renderer/createRenderer';
import { createFrameUniforms } from './uniforms';
import { QUALITY, effectivePixelRatio, stepDown, type QualityTier } from '../quality/tiers';
import { DynamicResolution } from '../quality/DynamicResolution';
import { MARIANA } from '../../data/sites/mariana';
import { createDepthState, updateDepthState, type DepthState } from '../../depth/DepthState';
import { diveCurve, finaleProgress, progressForDepth } from '../../depth/diveCurve';
import { ScrollInput } from '../../depth/ScrollInput';
import { CameraRig } from '../../camera/CameraRig';
import { OceanSky, refractedSunDirection } from '../../ocean/surface/Sky';
import { OceanSurface } from '../../ocean/surface/OceanSurface';
import { waveHeight } from '../../ocean/surface/waves';
import { createUnderwaterPipeline } from '../../ocean/medium/UnderwaterPipeline';
import { inscatter, whiteBalance, WHITE_BALANCE_STRENGTH } from '../../ocean/medium/optics';
import { SuspendedParticles } from '../../particles/suspended/SuspendedParticles';
import { ReefChapter } from '../../environments/reef/ReefChapter';
import { OpenBlueChapter } from '../../environments/openBlue/OpenBlueChapter';
import { WreckChapter } from '../../environments/wreck/WreckChapter';
import { CastleChapter } from '../../environments/castle/CastleChapter';
import { FinaleDirector } from '../../environments/finale/FinaleDirector';
import { finaleWeights } from '../../environments/finale/finalePath';
import { Cinema } from '../../ui/cinema/Cinema';
import { DiveCompanion } from '../../creatures/diver/DiveCompanion';
import { AssetLibrary } from '../../assets/AssetLibrary';
import { Hud } from '../../ui/hud/Hud';
import type { DebugPanel } from '../../ui/debug/DebugPanel';
import { maxExposureEV, type Rgb } from '../../data/zones/physics';
import { smoothstep } from '../math/monotoneCubic';
import { stepCriticalSpring } from '../../depth/spring';
import { loadSpecies } from '../../data/species';
import { Scanner, MAX_SIGHTINGS, type SightingSource } from '../../discovery/scanner/Scanner';
import { DiscoveryStore } from '../../discovery/persistence/DiscoveryStore';
import { DiscoveryLayer } from '../../ui/discovery/DiscoveryLayer';
import { Codex } from '../../ui/codex/Codex';
import { DISCOVERY_UI } from '../../discovery/flags';

const BASE_EXPOSURE = 0.62;
const PARTICLE_ALBEDO = 0.8;
/** Exposure (EV) the camera uses when its lamp is the main light source. */
const LAMP_EV = 2;
/**
 * The lamp comes on as natural light becomes too dim to film by (~450–650 m), like an ROV
 * switching its lights on, so there is no dead black stretch before sunlight fully ends.
 */
const LAMP_ON_FROM = 450;
const LAMP_ON_FULL = 650;
/**
 * The sensor's gain ceiling (EV): a camera can only amplify so far. It also keeps light drawn in
 * camera-adapted units (bioluminescence) above fp16's range once sunlight has gone, where the
 * natural-light exposure would climb past +20 EV and round such light to zero.
 */
const MAX_SENSOR_EV = 13;

declare global {
  interface Window {
    /** Debug-only handle for automated visual checks (?debug). */
    __abyss?: { state: DepthState; toggles: Record<string, { value: number }>; jumpToDepth: (d: number) => void };
  }
}

export interface ExperienceOptions {
  info: RendererInfo;
  tier: QualityTier;
  dom: { spacer: HTMLElement; hud: HTMLElement; debugRoot: HTMLElement; cue: HTMLElement | null };
  startDepth: number | null;
  debug: boolean;
  /** The scuba diver / submersible companion (off only for measurements of the water itself). */
  companion: boolean;
}

export class Experience {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 20000);
  private readonly u = createFrameUniforms();
  private readonly state = createDepthState();
  private readonly timer = new Timer();
  private readonly scroll: ScrollInput;
  private readonly rig: CameraRig;
  private readonly sky = new OceanSky();
  private readonly surface: OceanSurface;
  private readonly particles: SuspendedParticles;
  private reef: ReefChapter | null = null;
  private openBlue: OpenBlueChapter | null = null;
  private wreck: WreckChapter | null = null;
  private castle: CastleChapter | null = null;
  private director: FinaleDirector | null = null;
  private readonly cinema = new Cinema(document.body);
  private readonly finalePos = new Vector3();
  private readonly finaleDir = new Vector3();
  private readonly head = { pos: new Vector3(), up: new Vector3(0, 1, 0) };
  private companion: DiveCompanion | null = null;
  private scanner: Scanner | null = null;
  private discovery: DiscoveryLayer | null = null;
  private readonly library = new AssetLibrary();
  private readonly pipeline: ReturnType<typeof createUnderwaterPipeline>;
  private readonly hud: Hud;
  private readonly drs: DynamicResolution;
  private debug: DebugPanel | null = null;
  private tier: QualityTier;
  private pointer = { x: 0, y: 0 };
  private wasSubmerged = false;
  private submergedFor = 0;
  private lastSubmergedFor = 0;
  private time = 0;
  private readonly scratch: Rgb = [0, 0, 0];
  private readonly lamp = { value: 0, velocity: 0 };
  private lampEnabled = true;

  constructor(private readonly o: ExperienceOptions) {
    const { renderer } = o.info;
    this.tier = o.tier;
    const q = QUALITY[this.tier];

    const env = this.sky.bakeEnvironment(renderer);
    this.scene.add(this.sky.mesh, this.sky.sun, this.sky.fill);
    this.u.sunDir.value.copy(this.sky.sunDir);
    refractedSunDirection(this.sky.sunDir, 1.333, this.u.sunDirWater.value);

    this.surface = new OceanSurface(this.u, q, env);
    this.scene.add(this.surface.top, this.surface.under);

    this.particles = new SuspendedParticles(this.u, QUALITY.ultra.suspendedParticles, this.surface.waves);
    this.particles.setCount(q.suspendedParticles);

    this.pipeline = createUnderwaterPipeline(renderer, this.scene, this.particles.scene, this.camera, this.u, this.surface.waves, MARIANA.kd, q.fsr);
    this.pipeline.toggles.lens.value = q.lensEffects ? 1 : 0;

    this.scroll = new ScrollInput(o.dom.spacer);
    this.rig = new CameraRig(this.camera);
    this.hud = new Hud(o.dom.hud);
    // Depth, temperature and the rest are instruments for development (?debug), not part of the film.
    if (!o.debug) o.dom.hud.style.display = 'none';
    this.drs = new DynamicResolution({ targetMs: 1000 / 60, minScale: q.minRenderScale, maxScale: q.maxRenderScale, window: 0.75, step: 0.08 });

    if (o.startDepth !== null) this.scroll.jumpTo(progressForDepth(o.startDepth));

    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.y = (e.clientY / innerHeight) * 2 - 1;
    });
    addEventListener('keydown', (e) => {
      if (e.key === '`') void this.toggleDebug();
      if (e.key === 'l' || e.key === 'L') this.lampEnabled = !this.lampEnabled;
    });
    this.resize();
    if (o.debug) {
      void this.toggleDebug(true);
      window.__abyss = {
        state: this.state,
        toggles: this.pipeline.toggles,
        jumpToDepth: (d: number) => this.scroll.jumpTo(progressForDepth(d)),
      };
    }
  }

  /** Compile every pipeline up front so the first frames never stall on shader builds. */
  async prepare(): Promise<void> {
    const { renderer } = this.o.info;
    this.reef = await ReefChapter.create(this.u, MARIANA.kd, this.library, (x, z) => waveHeight(this.surface.waves, x, z, this.time));
    this.scene.add(this.reef.group, this.reef.seabed);
    this.openBlue = new OpenBlueChapter(this.u, MARIANA.kd);
    this.scene.add(this.openBlue.group);
    // The finale: the wreck, the castle and the shot list that runs them (below 130 m only).
    [this.wreck, this.castle, this.director] = await Promise.all([
      WreckChapter.create(this.u, MARIANA.kd, this.library),
      CastleChapter.create(this.u, MARIANA.kd, this.library),
      FinaleDirector.create(this.u, MARIANA.kd, this.library),
    ]);
    this.scene.add(this.wreck.group, this.castle.group, this.director.group);
    if (this.o.companion) {
      this.companion = await DiveCompanion.create(this.u, MARIANA.kd, this.library, this.particles.scene, (x, z) => waveHeight(this.surface.waves, x, z, this.time));
      this.scene.add(this.companion.group);
    }
    this.mountDiscovery([...this.reef.sightings(), ...this.openBlue.sightings(), ...this.director.sightings()]);
    await this.warmUp();
  }

  /**
   * Everything the film will ever show is compiled and uploaded now, behind the loading screen:
   * shaders are built per object and textures upload on first draw, so a set that starts hidden
   * (the wreck, the castle, the chest and crown, the king, the trident, the whale) would otherwise
   * stall the frame the moment it first appears, mid-scroll. Hidden and off-screen objects are
   * shown and drawn once, then put back.
   */
  private async warmUp(): Promise<void> {
    const { renderer } = this.o.info;
    const hidden: Object3D[] = [];
    const culled: Object3D[] = [];
    for (const root of [this.scene, this.particles.scene]) {
      root.traverse((o) => {
        if (!o.visible) { hidden.push(o); o.visible = true; }
        if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
      });
    }
    await renderer.compileAsync(this.scene, this.camera);
    await renderer.compileAsync(this.particles.scene, this.camera);
    this.pipeline.pipeline.render();
    for (const o of hidden) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
  }

  /** Scanner, glyphs, cards and codex over the species this build can show. */
  private mountDiscovery(sources: SightingSource[]): void {
    if (!DISCOVERY_UI) return;
    const species = loadSpecies();
    const byId = new Map(species.map((s) => [s.id, s]));
    const store = new DiscoveryStore();
    this.scanner = new Scanner(sources, (id) => byId.get(id)?.sizeTypical ?? 0.2, (id) => store.has(id));
    const codex = new Codex(document.body, species, store, this.scanner.species);
    this.discovery = new DiscoveryLayer(document.body, byId, store, (id) => codex.open(id), MAX_SIGHTINGS);
  }

  start(): void {
    this.o.info.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /** CPU time spent in the last frame's JavaScript (simulation + render submission), ms. */
  cpuMs = 0;

  private frame(timestamp: number): void {
    const cpuStart = performance.now();
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.time += dt;
    const { renderer } = this.o.info;
    const u = this.u;

    const progress = this.scroll.update(dt);
    const depth = diveCurve(progress);
    updateDepthState(this.state, depth, progress, MARIANA);

    const cam = this.camera;
    const surfaceH = waveHeight(this.surface.waves, cam.position.x, cam.position.z, this.time);
    this.rig.update({
      depth,
      time: this.time,
      dt,
      pointerX: this.pointer.x,
      pointerY: this.pointer.y,
      surfaceHeightAtCamera: surfaceH,
      submersion: this.state.submersion,
    });
    // Below 130 m the finale's shot list takes the camera over (no effect above).
    const finale = finaleProgress(progress);
    this.director?.direct(finale, cam, this.time);
    cam.updateMatrixWorld();

    const camDepth = -cam.position.y;
    const submerged = cam.position.y < waveHeight(this.surface.waves, cam.position.x, cam.position.z, this.time);
    this.submergedFor = submerged ? this.submergedFor + dt : 0;
    const surfaced = this.wasSubmerged && !submerged && this.lastSubmergedFor > 0.4;
    u.wetness.value = surfaced ? 1 : Math.max(0, u.wetness.value - dt * 0.2);
    if (submerged) this.lastSubmergedFor = this.submergedFor;
    this.wasSubmerged = submerged;

    u.time.value = this.time;
    u.cameraPos.value.copy(cam.position);
    u.cameraWorld.value.copy(cam.matrixWorld);
    u.projectionInverse.value.copy(cam.projectionMatrixInverse);
    u.cameraDepth.value = camDepth;
    u.turbidity.value = this.state.turbidity;
    u.particleDensity.value = this.state.particleDensity;
    const lampTarget = this.lampEnabled ? smoothstep(LAMP_ON_FROM, LAMP_ON_FULL, depth) : 0;
    stepCriticalSpring(this.lamp, lampTarget, 5, dt);
    const lamp = this.lamp.value < 1e-4 ? 0 : Math.min(1, this.lamp.value);
    // Auto-exposure follows the brightest light actually present: a dimming lamp raises the
    // exposure only as fast as its own light falls, so it never blows out the frame.
    const lampEV = lamp > 0 ? LAMP_EV + Math.log2(1 / lamp) : Infinity;
    const ev = Math.min(this.state.exposureEV, lampEV, MAX_SENSOR_EV);
    u.exposure.value = BASE_EXPOSURE * Math.pow(2, ev);
    u.diveLight.value = lamp;
    u.sensorGain.value = ev / maxExposureEV(MARIANA.kd);
    u.bioluminescence.value = smoothstep(350, 800, depth);
    u.shaftSamples.value = QUALITY[this.tier].shaftSamples;
    u.pixelsPerMetre.value = (renderer.domElement.height * this.drs.scale) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.hud.lampOn = lamp > 0.5;
    // Cameras white-balance for the shallows; below ~70 m there is no red or green left to
    // restore and real footage simply turns deep blue, so the correction fades out.
    const wbStrength = WHITE_BALANCE_STRENGTH * (1 - lamp) * (1 - smoothstep(25, 70, depth));
    const wb = whiteBalance(depth, MARIANA.kd, wbStrength, this.scratch);
    u.whiteBalance.value.set(wb[0], wb[1], wb[2]);

    const below = inscatter(0, -1, Infinity, 0, MARIANA.kd, this.scratch);
    u.belowColor.value.set(below[0], below[1], below[2]);
    const water = inscatter(Math.max(depth, 0), 0, Infinity, u.turbidity.value, MARIANA.kd, this.scratch);
    u.waterColor.value.set(water[0], water[1], water[2]);
    const above = inscatter(Math.max(depth, 0), 1, Infinity, u.turbidity.value, MARIANA.kd, this.scratch);
    u.waterAboveColor.value.set(above[0], above[1], above[2]);
    const [lr, lg, lb] = this.state.light;
    const ambient = 0.32 * PARTICLE_ALBEDO;
    u.ambientWater.value.set(lr * ambient, lg * ambient, lb * ambient);

    this.surface.update(u, cam.position.x, cam.position.z);
    // Each side of the sea surface is only visible from its own side of the water; skipping the
    // hidden one saves a full pass of the wave vertex shader (the waterline keeps both).
    this.surface.top.visible = cam.position.y > -3;
    this.surface.under.visible = cam.position.y < 3;
    this.reef?.update(dt, this.time, cam, depth, QUALITY[this.tier].scenery);
    this.openBlue?.update(dt, this.time, cam, depth);
    this.wreck?.update(depth, finale);
    this.director?.update(dt, finale, this.time, cam, depth);
    const fw = finaleWeights(finale);
    if (this.companion && this.director) {
      const owned = this.director.diver(finale, this.finalePos, this.finaleDir);
      this.companion.setFinale(owned, this.finalePos, this.finaleDir, fw);
      this.companion.update(dt, cam, depth);
      this.director.stirSilt(dt, this.companion.finPosition(this.finalePos), owned);
      // After the diver has moved: once he has the crown, it travels in his hand.
      this.companion.crownMount(this.head.pos, this.head.up);
      this.castle?.update(finale, depth, this.time, this.head);
    } else {
      this.companion?.update(dt, cam, depth);
      this.castle?.update(finale, depth, this.time, null);
    }

    renderer.info.reset();
    this.pipeline.pipeline.render();

    this.hud.update(this.state, dt);
    // Discovery only underwater, at the scanner's 10 Hz; between ticks nothing touches the DOM.
    const sightings = this.scanner?.update(dt, cam, innerWidth, innerHeight);
    if (sightings) this.discovery?.update(depth > 0.5 ? sightings : []);
    if (progress > 0.004) this.o.dom.cue?.classList.add('gone');
    this.cinema.update(dt, fw.letterbox, fw.endCard, fw.fade, progress);
    this.debug?.frame(dt * 1000, this.state);

    this.adaptQuality(this.drs.sample(dt * 1000, dt));
    this.cpuMs = this.cpuMs * 0.9 + (performance.now() - cpuStart) * 0.1;
  }

  /** Frame interval (not CPU time) drives resolution, so GPU-bound frames are caught too. */
  private adaptQuality(verdict: ReturnType<DynamicResolution['sample']>): void {
    if (verdict === 'up' || verdict === 'down') this.pipeline.setInternalScale(this.drs.scale);
    if (verdict === 'starved' && this.tier !== 'low') {
      this.tier = stepDown(this.tier);
      const q = QUALITY[this.tier];
      this.drs.configure(q.minRenderScale, q.maxRenderScale);
      this.particles.setCount(q.suspendedParticles);
      this.pipeline.toggles.lens.value = q.lensEffects ? 1 : 0;
      this.resize();
    }
  }

  private resize(): void {
    const { renderer } = this.o.info;
    const q = QUALITY[this.tier];
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    // The canvas is always native (capped at the tier's output size, 4K on desktop); the
    // internal render scale is applied per pass and upscaled with FSR 1.
    renderer.setPixelRatio(effectivePixelRatio(devicePixelRatio, 1, innerWidth, innerHeight, q.maxPixels));
    this.pipeline.setInternalScale(this.drs.scale);
    renderer.setSize(innerWidth, innerHeight);
  }

  private async toggleDebug(force?: boolean): Promise<void> {
    if (!this.debug) {
      const { DebugPanel } = await import('../../ui/debug/DebugPanel');
      this.debug = await DebugPanel.create(
        {
          renderer: this.o.info.renderer,
          backend: this.o.info.backend,
          getTier: () => this.tier,
          getRenderScale: () => this.drs.scale,
          getParticleCount: () => this.particles.sprite.count,
          getCreatures: () => {
            const reef = this.reef?.creatureCounts() ?? { total: 0, simulated: 0 };
            const blue = this.openBlue?.creatureCounts() ?? { total: 0, simulated: 0 };
            const wreck = this.director?.creatureCounts() ?? { total: 0, simulated: 0 };
            return { total: reef.total + blue.total + wreck.total, simulated: reef.simulated + blue.simulated + wreck.simulated };
          },
          getCpuMs: () => this.cpuMs,
          jumpToDepth: (d) => this.scroll.jumpTo(progressForDepth(d)),
          toggles: this.pipeline.toggles,
        },
        this.o.dom.debugRoot,
      );
      this.debug.toggle(true);
      return;
    }
    this.debug.toggle(force);
  }
}
