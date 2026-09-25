import type { WebGPURenderer } from 'three/webgpu';
import type { DepthState } from '../../depth/DepthState';

export interface DebugHooks {
  renderer: WebGPURenderer;
  backend: string;
  getTier: () => string;
  getRenderScale: () => number;
  getParticleCount: () => number;
  jumpToDepth: (depth: number) => void;
  toggles: Record<string, { value: number }>;
  setSurfaceVisible: (visible: boolean) => void;
}

/** Hidden developer overlay (?debug or the ` key). Loaded lazily so it costs nothing otherwise. */
export class DebugPanel {
  private readonly stats: HTMLElement;
  private frames = 0;
  private elapsed = 0;
  private frameMs = 0;
  private fps = 0;
  private visible = false;
  private gui: import('lil-gui').GUI | null = null;

  constructor(
    private readonly hooks: DebugHooks,
    root: HTMLElement,
  ) {
    this.stats = document.createElement('pre');
    this.stats.className = 'debug-stats';
    root.appendChild(this.stats);
  }

  static async create(hooks: DebugHooks, root: HTMLElement): Promise<DebugPanel> {
    const panel = new DebugPanel(hooks, root);
    const { GUI } = await import('lil-gui');
    const gui = new GUI({ title: 'ABYSS · dev' });
    const params = { depth: 0, surface: true };
    gui.add(params, 'depth', -3.5, 10935, 1).name('jump to depth (m)').onFinishChange((d: number) => hooks.jumpToDepth(d));
    const fx = gui.addFolder('Systems');
    const view = hooks.toggles['view'];
    if (view) {
      const views = { final: 0, 'scene × transmittance': 1, 'in-scatter': 2, 'view distance (km)': 3 };
      fx.add({ view: 0 }, 'view', views).name('medium view').onChange((v: number) => (view.value = v));
    }
    for (const [name, u] of Object.entries(hooks.toggles)) {
      if (name === 'view') continue;
      const p = { [name]: u.value > 0.5 };
      fx.add(p, name).onChange((on: boolean) => (u.value = on ? 1 : 0));
    }
    fx.add(params, 'surface').name('ocean surface').onChange((on: boolean) => hooks.setSurfaceVisible(on));
    panel.gui = gui;
    return panel;
  }

  toggle(force?: boolean): void {
    this.visible = force ?? !this.visible;
    this.stats.hidden = !this.visible;
    this.gui?.show(this.visible);
  }

  frame(dtMs: number, state: DepthState): void {
    if (!this.visible) return;
    this.frames++;
    this.elapsed += dtMs;
    this.frameMs = this.frameMs * 0.9 + dtMs * 0.1;
    if (this.elapsed < 500) return;
    this.fps = (this.frames * 1000) / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    const { renderer } = this.hooks;
    const info = renderer.info;
    const canvas = renderer.domElement;
    this.stats.textContent = [
      `FPS          ${this.fps.toFixed(0)}`,
      `frame        ${this.frameMs.toFixed(2)} ms`,
      `draw calls   ${info.render.drawCalls}`,
      `triangles    ${info.render.triangles.toLocaleString()}`,
      `textures     ${info.memory.textures}`,
      `geometries   ${info.memory.geometries}`,
      `backend      ${this.hooks.backend}`,
      `tier         ${this.hooks.getTier()}`,
      `render res   ${canvas.width}×${canvas.height} (scale ${this.hooks.getRenderScale().toFixed(2)})`,
      `particles    ${this.hooks.getParticleCount().toLocaleString()}`,
      `creatures    0 (none implemented yet)`,
      `depth        ${state.depth.toFixed(2)} m`,
      `zone         ${state.zoneName}`,
      `light        ${state.lightFraction.toExponential(2)}  ${state.lightLabel}`,
      `exposure     +${state.exposureEV.toFixed(2)} EV`,
    ].join('\n');
  }
}
