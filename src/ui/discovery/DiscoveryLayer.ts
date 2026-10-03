import type { MarineSpecies } from '../../data/schemas';
import type { Sighting } from '../../discovery/scanner/Scanner';
import type { DiscoveryStore } from '../../discovery/persistence/DiscoveryStore';
import { behaviourList, depthRange, habitatLabel, isUncertain, verificationBadge } from './speciesFacts';

interface Glyph {
  el: HTMLButtonElement;
  label: HTMLSpanElement;
  species: string | null;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Just above the animal, clear of its body: half its on-screen length plus a small gap. */
const glyphTransform = (s: Sighting) => `translate3d(${s.x}px, ${s.y - Math.min(s.radius * 0.5, 60) - 14}px, 0)`;

/**
 * Screen-space discovery: a tiny glyph fades in beside each nearby species (no card, no
 * pointer telling you where to look). Hovering shows its name; a click opens a minimal card
 * with EXPLORE SPECIES, which opens the codex. Updated only on scanner ticks (10 Hz): glyphs
 * glide between ticks with a CSS transition, so the render loop never touches the DOM.
 */
export class DiscoveryLayer {
  private readonly root = el('div', 'discovery');
  private readonly glyphs: Glyph[] = [];
  private readonly card = el('aside', 'species-card');
  private openSpecies: string | null = null;

  constructor(
    parent: HTMLElement,
    private readonly species: ReadonlyMap<string, MarineSpecies>,
    private readonly store: DiscoveryStore,
    private readonly explore: (id: string) => void,
    max: number,
  ) {
    this.root.setAttribute('aria-label', 'Nearby species');
    for (let i = 0; i < max; i++) {
      const button = el('button', 'glyph');
      button.type = 'button';
      button.hidden = true;
      const label = el('span', 'glyph-label');
      button.append(el('i'), label);
      const glyph: Glyph = { el: button, label, species: null };
      button.addEventListener('click', () => glyph.species && this.showCard(glyph.species));
      this.glyphs.push(glyph);
      this.root.append(button);
    }
    this.card.hidden = true;
    this.card.setAttribute('aria-live', 'polite');
    parent.append(this.root, this.card);
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.card.hidden) this.hideCard();
    });
  }

  /** Called on each scanner tick with the current sightings. */
  update(sightings: readonly Sighting[]): void {
    const free = this.glyphs.filter((g) => !sightings.some((s) => s.species === g.species));
    for (const s of sightings) {
      const info = this.species.get(s.species);
      if (!info) continue;
      // Keep a glyph on the same species between ticks so it glides instead of jumping.
      const glyph = this.glyphs.find((g) => g.species === s.species) ?? free.shift();
      if (!glyph) continue;
      if (glyph.species !== s.species) {
        glyph.species = s.species;
        glyph.label.textContent = info.commonName;
        glyph.el.setAttribute('aria-label', `${info.commonName}: open species card`);
        glyph.el.style.transition = 'none';
        glyph.el.style.transform = glyphTransform(s);
        glyph.el.hidden = false;
        void glyph.el.offsetWidth;
        glyph.el.style.transition = '';
        glyph.el.classList.add('glyph-in');
      } else {
        glyph.el.style.transform = glyphTransform(s);
      }
      this.store.add(s.species);
    }
    for (const g of free) {
      if (g.species === null) continue;
      g.species = null;
      g.el.classList.remove('glyph-in');
      g.el.hidden = true;
    }
  }

  private showCard(id: string): void {
    const s = this.species.get(id);
    if (!s) return;
    this.openSpecies = id;
    const badge = verificationBadge(s);
    const close = el('button', 'card-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close species card');
    close.addEventListener('click', () => this.hideCard());
    const facts = el('dl');
    const row = (term: string, value: string, uncertain = false) => {
      const dd = el('dd', uncertain ? 'is-uncertain' : undefined, value);
      if (uncertain) dd.title = 'Not confirmed by a primary source';
      facts.append(el('dt', undefined, term), dd);
    };
    row('Depth', depthRange(s), isUncertain(s, 'depthMin') || isUncertain(s, 'depthMax'));
    row('Habitat', habitatLabel(s), isUncertain(s, 'habitats'));
    row('Behaviour', behaviourList(s), isUncertain(s, 'behavior'));
    const explore = el('button', 'card-explore', 'Explore species');
    explore.type = 'button';
    explore.addEventListener('click', () => {
      this.hideCard();
      this.explore(id);
    });
    const name = el('h3', undefined, s.commonName);
    const sci = el('p', 'card-sci', s.scientificName);
    const tag = el('span', `badge badge-${badge.tone}`, badge.label);
    if (badge.detail) tag.title = badge.detail;
    this.card.replaceChildren(close, el('p', 'card-eyebrow', s.category), name, sci, tag, facts, explore);
    this.card.hidden = false;
    explore.focus({ preventScroll: true });
  }

  private hideCard(): void {
    this.card.hidden = true;
    const g = this.glyphs.find((x) => x.species === this.openSpecies);
    this.openSpecies = null;
    g?.el.focus({ preventScroll: true });
  }
}
