import { describe, expect, it } from 'vitest';
import { PredatorBeat } from '../../src/ecosystem/predation/PredatorBeat';

const OPTS = { firstDelay: 6, strike: 9, scatter: 6, cooldown: [60, 120] as [number, number] };

/** Steps the beat for `seconds` at 10 Hz and returns the phases seen. */
function run(beat: PredatorBeat, seconds: number, near = true): Set<string> {
  const seen = new Set<string>();
  for (let t = 0; t < seconds; t += 0.1) seen.add(beat.update(0.1, near));
  return seen;
}

describe('predator beat', () => {
  it('never strikes while the camera is away', () => {
    const beat = new PredatorBeat(OPTS, () => 0);
    expect(run(beat, 600, false)).toEqual(new Set(['idle']));
  });

  it('strikes soon after the camera arrives, then scatters, then rests', () => {
    const beat = new PredatorBeat(OPTS, () => 0);
    run(beat, 5.8);
    expect(beat.phase).toBe('idle');
    run(beat, 0.5);
    expect(beat.phase).toBe('strike');
    run(beat, 9);
    expect(beat.phase).toBe('scatter');
    run(beat, 6);
    expect(beat.phase).toBe('idle');
  });

  it('keeps strikes rare: no second strike inside the cooldown', () => {
    const beat = new PredatorBeat(OPTS, () => 0.5);
    run(beat, 6 + 9 + 6 + 0.5);
    expect(beat.phase).toBe('idle');
    expect(run(beat, 89)).toEqual(new Set(['idle']));
    run(beat, 2);
    expect(beat.phase).toBe('strike');
  });

  it('raises the alarm during a strike and lets it fall afterwards', () => {
    const beat = new PredatorBeat(OPTS, () => 0);
    run(beat, 6.2 + 5);
    expect(beat.alarm).toBeGreaterThan(0.9);
    run(beat, 4 + 6 + 10);
    expect(beat.alarm).toBeLessThan(0.05);
  });
});
