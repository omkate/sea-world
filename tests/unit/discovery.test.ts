import { describe, expect, it } from 'vitest';
import { DiscoveryStore, STORAGE_KEY, type KeyValueStorage } from '../../src/discovery/persistence/DiscoveryStore';
import { scanRange, selectSightings } from '../../src/discovery/scanner/Scanner';
import { entryState, matchesSearch, sortEntries } from '../../src/ui/codex/Codex';
import { depthRange, sizeLabel, verificationBadge } from '../../src/ui/discovery/speciesFacts';
import { loadSpecies } from '../../src/data/species';

const memory = (initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

const throwing: KeyValueStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('discovery persistence', () => {
  it('persists discoveries and restores them', () => {
    const storage = memory();
    const a = new DiscoveryStore(storage);
    expect(a.add('chromis-viridis')).toBe(true);
    expect(a.add('chromis-viridis')).toBe(false);
    expect(new DiscoveryStore(storage).has('chromis-viridis')).toBe(true);
  });

  it('keeps working when storage throws on read and write', () => {
    const s = new DiscoveryStore(throwing);
    expect(s.size).toBe(0);
    expect(s.add('cephea-cephea')).toBe(true);
    expect(s.has('cephea-cephea')).toBe(true);
  });

  it('works with no storage at all', () => {
    const s = new DiscoveryStore(null);
    expect(s.add('chelonia-mydas')).toBe(true);
    expect(s.size).toBe(1);
  });

  it('ignores corrupt or foreign data', () => {
    expect(new DiscoveryStore(memory({ [STORAGE_KEY]: '{not json' })).size).toBe(0);
    expect(new DiscoveryStore(memory({ [STORAGE_KEY]: '{"a":1}' })).size).toBe(0);
    expect(new DiscoveryStore(memory({ [STORAGE_KEY]: '["a", 3, null]' })).size).toBe(1);
  });

  it('notifies once per new discovery', () => {
    const s = new DiscoveryStore(null);
    const seen: string[] = [];
    s.subscribe((id) => seen.push(id));
    s.add('x');
    s.add('x');
    s.add('y');
    expect(seen).toEqual(['x', 'y']);
  });
});

describe('scanner', () => {
  it('scales the scan range with body size, within limits', () => {
    expect(scanRange(0.07)).toBeCloseTo(5.4);
    expect(scanRange(0.3)).toBeGreaterThan(scanRange(0.07));
    expect(scanRange(0)).toBe(4);
    expect(scanRange(20)).toBe(25);
  });

  it('shows the nearest species first and caps the count', () => {
    const at = (species: string, distance: number) => ({ species, x: 0, y: 0, distance, radius: 10 });
    const picked = selectSightings([at('a', 9), at('b', 2), at('c', 5), at('d', 7)], 3);
    expect(picked.map((s) => s.species)).toEqual(['b', 'c', 'd']);
  });

  it('marks only animals big enough on screen to be seen', () => {
    const at = (species: string, radius: number) => ({ species, x: 0, y: 0, distance: 5, radius });
    expect(selectSightings([at('speck', 4), at('fish', 12)], 3).map((s) => s.species)).toEqual(['fish']);
  });

  it('favours undiscovered species and marks known ones only up close', () => {
    const at = (species: string, distance: number, radius: number) => ({ species, x: 0, y: 0, distance, radius });
    const known = (id: string) => id === 'old' || id === 'near';
    const picked = selectSightings([at('old', 2, 12), at('new', 6, 10), at('near', 1, 30)], 3, known);
    expect(picked.map((s) => s.species)).toEqual(['new', 'near']);
  });

  it('shows each species once even when several chapters render it', () => {
    const at = (species: string, distance: number) => ({ species, x: 0, y: 0, distance, radius: 10 });
    const picked = selectSightings([at('shark', 12), at('shark', 4), at('tuna', 8)], 3);
    expect(picked).toEqual([at('shark', 4), at('tuna', 8)]);
  });
});

describe('codex', () => {
  const species = loadSpecies();
  const angelfish = species.find((s) => s.id === 'pygoplites-diacanthus')!;
  const store = { has: (id: string) => id === 'pygoplites-diacanthus' };
  const available = new Set(['pygoplites-diacanthus', 'chromis-viridis']);

  it('unlocks only discovered entries and labels species the dive cannot show', () => {
    expect(entryState('pygoplites-diacanthus', store, available)).toBe('discovered');
    expect(entryState('chromis-viridis', store, available)).toBe('undiscovered');
    expect(entryState('melanocetus-johnsonii', store, available)).toBe('absent');
  });

  it('lists discovered entries first and keeps depth order within each group', () => {
    const order = sortEntries([
      { id: 'a', state: 'absent' as const },
      { id: 'b', state: 'discovered' as const },
      { id: 'c', state: 'undiscovered' as const },
      { id: 'd', state: 'discovered' as const },
    ]);
    expect(order.map((x) => x.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('never matches locked entries in search', () => {
    const chromis = species.find((s) => s.id === 'chromis-viridis')!;
    expect(matchesSearch(angelfish, 'royal', 'discovered')).toBe(true);
    expect(matchesSearch(angelfish, 'pygoplites', 'discovered')).toBe(true);
    expect(matchesSearch(chromis, 'chromis', 'undiscovered')).toBe(false);
    expect(matchesSearch(chromis, '', 'undiscovered')).toBe(true);
  });

  it('names every unconfirmed value on uncertain entries', () => {
    const badge = verificationBadge(angelfish);
    expect(badge.tone).toBe('uncertain');
    expect(badge.detail).toContain('colouring');
    expect(badge.detail).toContain('typical size');
    const verified = species.find((s) => s.verification === 'verified')!;
    expect(verificationBadge(verified)).toEqual({ label: 'Verified', tone: 'verified', detail: null });
  });

  it('formats depth and size for people', () => {
    expect(depthRange(angelfish)).toBe('0–110 m');
    expect(sizeLabel(0.18)).toBe('18 cm');
    expect(sizeLabel(2.1)).toBe('2.1 m');
  });
});
