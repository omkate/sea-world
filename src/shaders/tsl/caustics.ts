import { abs, cos, float, length, pow, sin, vec2 } from 'three/tsl';
import type { ShaderNode } from './types';

/**
 * Animated caustic network: the bright web that surface waves focus onto anything below.
 * Iterated-trig interference pattern (cheap, tileable-looking, no texture). Returns ~0..1
 * with a mean of CAUSTIC_MEAN (measured over 40k samples), so callers can add (c − mean)
 * to keep energy constant. The pattern tiles every 1 unit of `p`: pass world metres divided
 * by CAUSTIC_TILE, which holds ~4–5 cells, so repetition is hidden by motion and depth blur.
 */
export const CAUSTIC_TILE = 6.5;
/** Mean of sqrt(caustic(p, t, 2)): the cheaper, softened variant used for light shafts. */
export const CAUSTIC_SHAFT_MEAN = 0.061;
export const CAUSTIC_MEAN = 0.056;

export function caustic(p: ShaderNode, t: ShaderNode, iterations = 3): ShaderNode {
  const base: ShaderNode = p.mul(6.2831).mod(6.2831).sub(250);
  let i: ShaderNode = base;
  let c: ShaderNode = float(1);
  const intensity = 0.005;
  for (let n = 0; n < iterations; n++) {
    const tn: ShaderNode = t.mul(1 - 3.5 / (n + 1));
    i = base.add(vec2(cos(tn.sub(i.x)).add(sin(tn.add(i.y))), sin(tn.sub(i.y)).add(cos(tn.add(i.x)))));
    c = c.add(
      float(1).div(length(vec2(base.x.div(sin(i.x.add(tn)).div(intensity)), base.y.div(cos(i.y.add(tn)).div(intensity))))),
    );
  }
  c = c.div(iterations);
  c = float(1.17).sub(pow(c, 1.4));
  return pow(abs(c), 8).clamp(0, 1);
}
