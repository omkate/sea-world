import { EPISODE, EPISODE_LABEL } from './episode';

/**
 * The film framing: the episode's opening title over the boat, letterbox bars that close in as
 * the wreck sequence begins, the HUD stepping back, a cut through black, and the end card with a
 * way back to the surface. Like the HUD, bars and card sample at
 * 10 Hz and write only what changed (a CSS transition carries them between ticks). The cut is the
 * one exception: it hides the diver passing through a wall, so it must never be skipped by a fast
 * scroll; it is written every frame, but only while its value changes.
 */
export class Cinema {
  private readonly root: HTMLElement;
  private accumulator = 0;
  private lastBars = -1;
  private lastCard = -1;
  private cinema = false;
  private lastFade = -1;
  private readonly black: HTMLElement;
  private readonly replay: HTMLButtonElement;
  private opening = true;
  private cardOn = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'cinema';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <i class="cinema-bar cinema-top"></i>
      <i class="cinema-bar cinema-bottom"></i>
      <i class="cinema-black"></i>
      <div class="opening-card">
        <p class="end-eyebrow">${EPISODE.series} · ${EPISODE_LABEL}</p>
        <h1>${EPISODE.title}</h1>
        <p class="end-line">${EPISODE.logline}</p>
      </div>
      <div class="end-card">
        <p class="end-eyebrow">End of ${EPISODE_LABEL}</p>
        <h2>${EPISODE.series}</h2>
        <p class="end-line">${EPISODE.title}</p>
        <p class="end-next">${EPISODE.next}</p>
        <button type="button" class="end-replay" tabindex="-1">↑ Back to the surface</button>
      </div>`;
    parent.append(this.root);
    this.black = this.root.querySelector<HTMLElement>('.cinema-black')!;
    this.replay = this.root.querySelector<HTMLButtonElement>('.end-replay')!;
    // The film runs backwards to the boat as the page glides back to the top.
    this.replay.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /** `start`: scroll progress near 0 shows the opening title (it fades as the dive begins). */
  update(dt: number, letterbox: number, endCard: number, fade: number, start: number): void {
    const opening = start < 0.004;
    if (opening !== this.opening) {
      this.root.classList.toggle('opening-gone', !opening);
      this.opening = opening;
    }
    const f = Math.round(fade * 50) / 50;
    if (f !== this.lastFade) {
      this.black.style.opacity = String(f);
      this.lastFade = f;
    }
    this.accumulator += dt;
    if (this.accumulator < 0.1) return;
    this.accumulator = 0;
    const bars = Math.round(letterbox * 100) / 100;
    if (bars !== this.lastBars) {
      this.root.style.setProperty('--bars', String(bars));
      this.lastBars = bars;
    }
    const card = Math.round(endCard * 100) / 100;
    if (card !== this.lastCard) {
      this.root.style.setProperty('--card', String(card));
      this.lastCard = card;
    }
    // The end card's button only takes clicks (and focus) while the card is up.
    const cardOn = endCard > 0.6;
    if (cardOn !== this.cardOn) {
      this.root.classList.toggle('card-on', cardOn);
      this.replay.tabIndex = cardOn ? 0 : -1;
      this.root.setAttribute('aria-hidden', cardOn ? 'false' : 'true');
      this.cardOn = cardOn;
    }
    const cinema = letterbox > 0.5;
    if (cinema !== this.cinema) {
      document.body.classList.toggle('cinema-mode', cinema);
      this.cinema = cinema;
    }
  }
}
