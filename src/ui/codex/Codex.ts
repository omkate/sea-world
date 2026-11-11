import type { MarineSpecies } from '../../data/schemas';
import type { DiscoveryStore } from '../../discovery/persistence/DiscoveryStore';
import { FIELD_LABELS, behaviourList, depthRange, habitatLabel, isUncertain, sizeLabel, verificationBadge } from '../discovery/speciesFacts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

export type EntryState = 'discovered' | 'undiscovered' | 'absent';

/**
 * Discovered entries are unlocked; the rest stay locked. 'absent' means the scanner cannot
 * find the species in this build (not rendered yet, or scenery like coral that isn't scanned).
 */
export function entryState(id: string, store: Pick<DiscoveryStore, 'has'>, available: ReadonlySet<string>): EntryState {
  if (store.has(id)) return 'discovered';
  return available.has(id) ? 'undiscovered' : 'absent';
}

/** Search matches only what the viewer has unlocked, so it can't reveal locked entries. */
const ORDER: Record<EntryState, number> = { discovered: 0, undiscovered: 1, absent: 2 };

/** Discovered first, then findable, then not yet discoverable; manifest (depth) order within each. */
export function sortEntries<T extends { state: EntryState }>(items: readonly T[]): T[] {
  return items.map((item, i) => ({ item, i })).sort((a, b) => ORDER[a.item.state] - ORDER[b.item.state] || a.i - b.i).map((x) => x.item);
}

export function matchesSearch(s: MarineSpecies, query: string, state: EntryState): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (state !== 'discovered') return false;
  return s.commonName.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q);
}

/**
 * The species codex: searchable, filtered by category, with only discovered entries unlocked.
 * Every entry shows its verification and sources, and uncertain values are labelled where
 * they appear. Opening it pauses page scroll (the dive), so reading never moves the camera.
 */
export class Codex {
  private readonly button = el('button', 'codex-toggle');
  private readonly dialog = el('div', 'codex');
  private readonly progress = el('span', 'codex-progress');
  private readonly search = el('input', 'codex-search');
  private readonly chips = el('div', 'codex-chips');
  private readonly list = el('ul', 'codex-list');
  private readonly detail = el('article', 'codex-detail');
  private category: string | null = null;
  private selected: string | null = null;
  private returnFocus: HTMLElement | null = null;
  private readonly entries: MarineSpecies[];

  constructor(
    parent: HTMLElement,
    species: readonly MarineSpecies[],
    private readonly store: DiscoveryStore,
    private readonly available: ReadonlySet<string>,
  ) {
    // Only species the manifest stands behind; unverified records are never shown as fact.
    this.entries = species.filter((s) => s.verification !== 'unverified');
    this.button.type = 'button';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.addEventListener('click', () => this.open());

    this.dialog.hidden = true;
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'codex-title');
    const panel = el('div', 'codex-panel');
    const header = el('header', 'codex-header');
    const title = el('h2', undefined, 'Codex');
    title.id = 'codex-title';
    const close = el('button', 'codex-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close codex');
    close.addEventListener('click', () => this.close());
    header.append(title, this.progress, close);
    this.search.type = 'search';
    this.search.placeholder = 'Search discovered species';
    this.search.setAttribute('aria-label', 'Search discovered species');
    this.search.addEventListener('input', () => this.renderList());
    const body = el('div', 'codex-body');
    body.append(this.list, this.detail);
    panel.append(header, this.search, this.chips, body);
    this.dialog.append(panel);
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.close();
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.dialog.hidden) this.close();
    });

    this.renderChips();
    this.updateButton();
    store.subscribe(() => {
      this.updateButton();
      if (!this.dialog.hidden) this.renderList();
    });
    parent.append(this.button, this.dialog);
  }

  /** Opens the codex, optionally at one species (EXPLORE SPECIES). */
  open(id?: string): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (id) {
      this.selected = id;
      this.category = null;
      this.search.value = '';
      this.renderChips();
    }
    this.dialog.hidden = false;
    document.documentElement.classList.add('codex-open');
    this.renderList();
    this.renderDetail();
    this.search.focus({ preventScroll: true });
  }

  close(): void {
    this.dialog.hidden = true;
    document.documentElement.classList.remove('codex-open');
    this.returnFocus?.focus({ preventScroll: true });
  }

  private updateButton(): void {
    const found = this.entries.filter((s) => this.store.has(s.id)).length;
    this.button.textContent = `Codex ${found}/${this.entries.length}`;
    this.progress.textContent = `${found} of ${this.entries.length} discovered`;
  }

  private renderChips(): void {
    const categories = [...new Set(this.entries.map((s) => s.category))];
    const chip = (label: string, value: string | null) => {
      const b = el('button', 'codex-chip', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(this.category === value));
      b.addEventListener('click', () => {
        this.category = value;
        this.renderChips();
        this.renderList();
      });
      return b;
    };
    this.chips.replaceChildren(chip('All', null), ...categories.map((c) => chip(c, c)));
  }

  private renderList(): void {
    const items = sortEntries(
      this.entries
        .map((s) => ({ s, state: entryState(s.id, this.store, this.available) }))
        .filter(({ s, state }) => (this.category === null || s.category === this.category) && matchesSearch(s, this.search.value, state)),
    );
    const rows = items.map(({ s, state }) => {
      const li = el('li', `codex-entry is-${state}`);
      if (state === 'discovered') {
        const b = el('button', undefined);
        b.type = 'button';
        b.setAttribute('aria-current', String(this.selected === s.id));
        b.append(el('span', 'entry-name', s.commonName), el('span', 'entry-sci', s.scientificName), el('span', 'entry-depth', depthRange(s)));
        b.addEventListener('click', () => {
          this.selected = s.id;
          this.renderList();
          this.renderDetail();
        });
        li.append(b);
      } else {
        li.append(el('span', 'entry-name', state === 'absent' ? 'Not yet discoverable' : 'Undiscovered'), el('span', 'entry-sci', s.category));
      }
      return li;
    });
    if (rows.length === 0) rows.push(el('li', 'codex-empty', 'Nothing matches yet.'));
    this.list.replaceChildren(...rows);
    this.list.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  private renderDetail(): void {
    const s = this.entries.find((x) => x.id === this.selected);
    if (!s || !this.store.has(s.id)) {
      this.detail.replaceChildren(el('p', 'codex-hint', 'Species you meet on the dive appear here. Pick one to read about it.'));
      return;
    }
    const badge = verificationBadge(s);
    const facts = el('dl');
    const row = (term: string, value: string | undefined, ...fields: string[]) => {
      if (!value) return;
      const uncertain = fields.some((f) => isUncertain(s, f));
      const dd = el('dd', uncertain ? 'is-uncertain' : undefined, value);
      if (uncertain) dd.append(el('small', undefined, ' unconfirmed'));
      facts.append(el('dt', undefined, term), dd);
    };
    row('Depth', depthRange(s), 'depthMin', 'depthMax');
    row('Typical size', `${sizeLabel(s.sizeTypical)} (max ${sizeLabel(s.sizeMax)})`, 'sizeTypical', 'sizeMax');
    row('Habitat', habitatLabel(s), 'habitats');
    row('Behaviour', behaviourList(s), 'behavior');
    row('Diet', s.diet, 'diet');
    row('Colouring', s.visual.coloration, 'visual.coloration');
    row('Adaptation', s.adaptation);
    row('Range', s.regions.join(', '), 'regions');
    const sources = el('ul', 'codex-sources');
    for (const src of s.sources) {
      const a = el('a', undefined, src.label);
      a.href = src.url;
      a.target = '_blank';
      a.rel = 'noopener';
      const li = el('li');
      li.append(a);
      if (src.field) li.append(el('small', undefined, ` · ${FIELD_LABELS[src.field] ?? src.field}`));
      sources.append(li);
    }
    const tag = el('span', `badge badge-${badge.tone}`, badge.label);
    const children: HTMLElement[] = [el('p', 'card-eyebrow', s.category), el('h3', undefined, s.commonName), el('p', 'card-sci', s.scientificName), tag];
    if (badge.detail) children.push(el('p', 'codex-uncertain', badge.detail));
    children.push(facts);
    if (s.notes) children.push(el('p', 'codex-notes', s.notes));
    children.push(el('h4', undefined, 'Sources'), sources);
    this.detail.replaceChildren(...children);
  }
}
