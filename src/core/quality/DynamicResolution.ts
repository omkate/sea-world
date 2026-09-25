import { clamp } from '../math/monotoneCubic';

export interface DynamicResolutionOptions {
  targetMs: number;
  minScale: number;
  maxScale: number;
  /** Seconds of averaged frame time between adjustments. */
  window: number;
  step: number;
}

export type DrsVerdict = 'hold' | 'up' | 'down' | 'starved';

/**
 * Frame-time driven render-scale controller with a dead band so it never oscillates.
 * Reports 'starved' when already at min scale and still far over budget, which lets the
 * watchdog step the quality tier down.
 */
export class DynamicResolution {
  scale: number;
  private acc = 0;
  private frames = 0;
  private elapsed = 0;
  private starvedWindows = 0;

  constructor(private readonly o: DynamicResolutionOptions) {
    this.scale = o.maxScale;
  }

  configure(minScale: number, maxScale: number): void {
    this.o.minScale = minScale;
    this.o.maxScale = maxScale;
    this.scale = clamp(this.scale, minScale, maxScale);
  }

  sample(frameMs: number, dt: number): DrsVerdict {
    this.acc += Math.min(frameMs, 250);
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < this.o.window) return 'hold';

    const avg = this.acc / this.frames;
    this.acc = 0;
    this.frames = 0;
    this.elapsed = 0;

    const { targetMs, step, minScale, maxScale } = this.o;
    if (avg > targetMs * 1.12) {
      if (this.scale <= minScale + 1e-6) {
        this.starvedWindows = avg > targetMs * 1.5 ? this.starvedWindows + 1 : 0;
        return this.starvedWindows >= 3 ? ((this.starvedWindows = 0), 'starved') : 'hold';
      }
      this.scale = clamp(this.scale - step, minScale, maxScale);
      return 'down';
    }
    this.starvedWindows = 0;
    if (avg < targetMs * 0.78 && this.scale < maxScale) {
      this.scale = clamp(this.scale + step * 0.5, minScale, maxScale);
      return 'up';
    }
    return 'hold';
  }
}
