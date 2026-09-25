export interface Spring {
  value: number;
  velocity: number;
}

/** Critically damped spring step (exact solution for constant target over dt). */
export function stepCriticalSpring(s: Spring, target: number, omega: number, dt: number): void {
  const x = s.value - target;
  const exp = Math.exp(-omega * dt);
  const c = s.velocity + omega * x;
  s.value = target + (x + c * dt) * exp;
  s.velocity = (s.velocity - omega * c * dt) * exp;
}
