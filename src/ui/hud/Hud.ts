import type { DepthState } from '../../depth/DepthState';

export interface HudReadout {
  depth: string;
  temperature: string;
  pressure: string;
  light: string;
  zone: string;
}

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatHud(s: DepthState): HudReadout {
  const above = s.depth < 0;
  return {
    depth: above ? `+${nf1.format(-s.depth)} m` : `${s.depth < 10 ? nf1.format(s.depth) : nf0.format(s.depth)} m`,
    temperature: `${nf1.format(s.temperatureC)}°C`,
    pressure: `${s.pressureAtm < 100 ? nf1.format(s.pressureAtm) : nf0.format(s.pressureAtm)} atm`,
    light: s.lightLabel,
    zone: s.zoneName,
  };
}

const FIELDS: readonly (keyof HudReadout)[] = ['depth', 'temperature', 'pressure', 'light', 'zone'];

/** Minimal persistent HUD. Updated at ≤10 Hz and only touches text that changed. */
export class Hud {
  private readonly cells = new Map<keyof HudReadout, HTMLElement>();
  private readonly last: Partial<HudReadout> = {};
  private accumulator = 0;

  constructor(root: HTMLElement) {
    for (const f of FIELDS) {
      const el = root.querySelector<HTMLElement>(`[data-hud="${f}"]`);
      if (el) this.cells.set(f, el);
    }
    root.hidden = false;
  }

  update(state: DepthState, dt: number, force = false): void {
    this.accumulator += dt;
    if (!force && this.accumulator < 0.1) return;
    this.accumulator = 0;
    const r = formatHud(state);
    for (const f of FIELDS) {
      if (this.last[f] === r[f]) continue;
      this.last[f] = r[f];
      const el = this.cells.get(f);
      if (el) el.textContent = r[f];
    }
  }
}
