import { clamp } from '../core/math/monotoneCubic';
import { stepCriticalSpring, type Spring } from './spring';

/** Screen heights of scrolling for the whole dive. */
const DIVE_SCREENS = 42;
const SPRING_OMEGA = 2.6;

/**
 * Native document scroll → smoothed dive progress. Using the real scrollbar keeps wheel,
 * trackpad, touch, keyboard and assistive tech working without hijacking input.
 */
export class ScrollInput {
  private readonly spring: Spring = { value: 0, velocity: 0 };
  private target = 0;

  constructor(private readonly spacer: HTMLElement) {
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('scroll', () => this.read(), { passive: true });
    this.read();
    this.spring.value = this.target;
  }

  get progress(): number {
    return clamp(this.spring.value, 0, 1);
  }

  get rawProgress(): number {
    return this.target;
  }

  update(dt: number): number {
    stepCriticalSpring(this.spring, this.target, SPRING_OMEGA, dt);
    return this.progress;
  }

  jumpTo(progress: number): void {
    const p = clamp(progress, 0, 1);
    scrollTo({ top: p * this.maxScroll(), behavior: 'instant' });
    this.target = p;
    this.spring.value = p;
    this.spring.velocity = 0;
  }

  private maxScroll(): number {
    return Math.max(1, document.documentElement.scrollHeight - innerHeight);
  }

  private resize(): void {
    this.spacer.style.height = `${DIVE_SCREENS * 100}vh`;
    this.read();
  }

  private read(): void {
    this.target = clamp(scrollY / this.maxScroll(), 0, 1);
  }
}
