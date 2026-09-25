import { PerspectiveCamera, Scene, Timer } from 'three/webgpu';
import type { RendererInfo } from '../renderer/createRenderer';
import { createFrameUniforms } from './uniforms';
import { QUALITY, effectivePixelRatio, stepDown, type QualityTier } from '../quality/tiers';
import { DynamicResolution } from '../quality/DynamicResolution';
import { MARIANA } from '../../data/sites/mariana';
import { createDepthState, updateDepthState, type DepthState } from '../../depth/DepthState';
import { diveCurve, progressForDepth } from '../../depth/diveCurve';
import { ScrollInput } from '../../depth/ScrollInput';
import { CameraRig } from '../../camera/CameraRig';
import { OceanSky, refractedSunDirection } from '../../ocean/surface/Sky';
import { OceanSurface } from '../../ocean/surface/OceanSurface';
import { waveHeight } from '../../ocean/surface/waves';
import { createUnderwaterPipeline } from '../../ocean/medium/UnderwaterPipeline';
import { inscatter } from '../../ocean/medium/optics';
import { SuspendedParticles } from '../../particles/suspended/SuspendedParticles';
import { Hud } from '../../ui/hud/Hud';
import type { DebugPanel } from '../../ui/debug/DebugPanel';
import { maxExposureEV, type Rgb } from '../../data/zones/physics';
import { smoothstep } from '../math/monotoneCubic';
import { stepCriticalSpring } from '../../depth/spring';

const BASE_EXPOSURE = 0.62;
const PARTICLE_ALBEDO = 0.8;
/** Exposure (EV) the camera uses when its lamp is the main light source. */
const LAMP_EV = 2;
/** The lamp comes on where sunlight fades out, like an ROV switching its lights on. */
const LAMP_ON_FROM = 750;
const LAMP_ON_FULL = 1000;

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

    this.pipeline = createUnderwaterPipeline(renderer, this.scene, this.particles.scene, this.camera, this.u, this.surface.waves, MARIANA.kd);
    this.pipeline.toggles.lens.value = q.lensEffects ? 1 : 0;

    this.scroll = new ScrollInput(o.dom.spacer);
    this.rig = new CameraRig(this.camera);
    this.hud = new Hud(o.dom.hud);
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

  start(): void {
    this.o.info.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private frame(timestamp: number): void {
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
    const ev = Math.min(this.state.exposureEV, lampEV);
    u.exposure.value = BASE_EXPOSURE * Math.pow(2, ev);
    u.diveLight.value = lamp;
    u.sensorGain.value = ev / maxExposureEV(MARIANA.kd);
    u.bioluminescence.value = smoothstep(350, 800, depth);
    u.shaftSamples.value = QUALITY[this.tier].shaftSamples;
    u.pixelsPerMetre.value = renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.hud.lampOn = lamp > 0.5;

    const below = inscatter(0, -1, Infinity, 0, MARIANA.kd, this.scratch);
    u.belowColor.value.set(below[0], below[1], below[2]);
    const [lr, lg, lb] = this.state.light;
    const ambient = 0.32 * PARTICLE_ALBEDO;
    u.ambientWater.value.set(lr * ambient, lg * ambient, lb * ambient);

    this.surface.update(u, cam.position.x, cam.position.z);

    renderer.info.reset();
    this.pipeline.pipeline.render();

    this.hud.update(this.state, dt);
    if (progress > 0.004) this.o.dom.cue?.classList.add('gone');
    this.debug?.frame(dt * 1000, this.state);

    this.adaptQuality(this.drs.sample(dt * 1000, dt));
  }

  /** Frame interval (not CPU time) drives resolution, so GPU-bound frames are caught too. */
  private adaptQuality(verdict: ReturnType<DynamicResolution['sample']>): void {
    if (verdict === 'up' || verdict === 'down') this.resize();
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
    renderer.setPixelRatio(effectivePixelRatio(devicePixelRatio, this.drs.scale, innerWidth, innerHeight, q.maxPixels));
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
          jumpToDepth: (d) => this.scroll.jumpTo(progressForDepth(d)),
          toggles: this.pipeline.toggles,
          setSurfaceVisible: (v) => {
            this.surface.top.visible = v;
            this.surface.under.visible = v;
          },
        },
        this.o.dom.debugRoot,
      );
      this.debug.toggle(true);
      return;
    }
    this.debug.toggle(force);
  }
}
