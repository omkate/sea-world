export type BeatPhase = 'idle' | 'strike' | 'scatter';

export interface PredatorBeatOptions {
  /** Seconds after the camera arrives before the first strike. */
  firstDelay: number;
  /** Strike and scatter durations (s). */
  strike: number;
  scatter: number;
  /** Cooldown between strikes (s), random in [min, max]: strikes stay rare. */
  cooldown: [number, number];
}

export const DEFAULT_BEAT: PredatorBeatOptions = { firstDelay: 6, strike: 9, scatter: 6, cooldown: [60, 120] };

/**
 * A documentary predator beat (plan §6.4): predators strike a bait school only while the camera
 * is there to see it, once soon after arrival and then rarely. Pure timing; the chapter turns
 * the phase into steering (chase, flight, a packed bait ball).
 */
export class PredatorBeat {
  phase: BeatPhase = 'idle';
  /** Seconds left in the current phase or cooldown. */
  private timer: number;
  private seen = false;

  constructor(
    private readonly o: PredatorBeatOptions = DEFAULT_BEAT,
    private readonly rng: () => number = Math.random,
  ) {
    this.timer = o.firstDelay;
  }

  /** 0 calm … 1 under attack, eased so the bait ball forms and loosens smoothly. */
  alarm = 0;

  update(dt: number, cameraNear: boolean): BeatPhase {
    const target = this.phase === 'strike' ? 1 : this.phase === 'scatter' ? 0.6 : 0;
    this.alarm += (target - this.alarm) * Math.min(1, dt * 1.5);
    if (this.phase === 'idle' && !cameraNear) {
      // Nobody is watching: hold the cooldown, and give the next arrival the short first delay.
      if (!this.seen) this.timer = this.o.firstDelay;
      return this.phase;
    }
    this.timer -= dt;
    if (this.timer > 0) return this.phase;
    if (this.phase === 'idle') {
      this.phase = 'strike';
      this.timer = this.o.strike;
      this.seen = true;
    } else if (this.phase === 'strike') {
      this.phase = 'scatter';
      this.timer = this.o.scatter;
    } else {
      this.phase = 'idle';
      const [lo, hi] = this.o.cooldown;
      this.timer = lo + (hi - lo) * this.rng();
    }
    return this.phase;
  }
}
