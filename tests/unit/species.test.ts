import { describe, expect, it } from 'vitest';
import raw from '../../src/data/species/mariana.json';
import { SpeciesManifestSchema, type MarineSpecies } from '../../src/data/schemas';
import { canSpawn, eligibleSpecies } from '../../src/ecosystem/spawning/eligibility';
import { MARIANA } from '../../src/data/sites/mariana';

const species: MarineSpecies[] = SpeciesManifestSchema.parse(raw);
const byName = (n: string) => species.find((s) => s.scientificName === n);

describe('species manifest', () => {
  it('validates against the schema', () => {
    expect(SpeciesManifestSchema.safeParse(raw).success).toBe(true);
    expect(species.length).toBeGreaterThan(40);
  });

  it('has unique ids', () => {
    expect(new Set(species.map((s) => s.id)).size).toBe(species.length);
  });

  it('keeps verification honest', () => {
    for (const s of species) {
      if (s.verification === 'verified') {
        expect(s.sources.length, s.id).toBeGreaterThan(0);
        expect(s.uncertainFields, s.id).toEqual([]);
      }
      if (s.verification === 'uncertain') expect(s.uncertainFields.length, s.id).toBeGreaterThan(0);
    }
  });

  it('only flags fields that exist', () => {
    const fields = new Set(species.flatMap((s) => [...Object.keys(s), ...Object.keys(s.visual).map((k) => `visual.${k}`)]));
    fields.add('visual.bioluminescenceColor');
    for (const s of species) for (const f of s.uncertainFields) expect(fields.has(f), `${s.id}: ${f}`).toBe(true);
  });

  it('fits every depth range inside the site', () => {
    for (const s of species.filter((x) => x.sites.includes('mariana'))) {
      expect(s.depthMin, s.id).toBeLessThanOrEqual(MARIANA.maxDepth);
    }
  });

  it('bioluminescent species carry a light description or photophores', () => {
    for (const s of species.filter((x) => x.bioluminescent)) {
      expect(s.visual.photophores || !!s.visual.bioluminescenceColor || s.uncertainFields.some((f) => f.startsWith('visual')), s.id).toBe(true);
    }
  });
});

describe('ecological placement', () => {
  it('keeps Riftia off the Mariana dive', () => {
    const riftia = byName('Riftia pachyptila');
    if (riftia) expect(riftia.sites).not.toContain('mariana');
  });

  it('does not use the non-native clownfish', () => {
    expect(byName('Amphiprion ocellaris')).toBeUndefined();
  });

  it('never spawns a species outside its depth range or site', () => {
    for (const depth of [0, 5, 30, 150, 500, 1500, 3000, 5000, 8000, 10900]) {
      for (const s of eligibleSpecies(species, depth, 'mariana')) {
        expect(depth).toBeGreaterThanOrEqual(s.depthMin);
        expect(depth).toBeLessThanOrEqual(s.depthMax);
        expect(s.sites).toContain('mariana');
      }
    }
  });

  it('has life in every zone of the dive', () => {
    for (const depth of [10, 500, 2000, 5000, 8000]) {
      expect(eligibleSpecies(species, depth, 'mariana').length, `${depth} m`).toBeGreaterThan(0);
    }
  });

  it('thins out with depth', () => {
    expect(eligibleSpecies(species, 10, 'mariana').length).toBeGreaterThan(eligibleSpecies(species, 8000, 'mariana').length);
  });

  it('rejects unverified species', () => {
    const fake = { ...species[0]!, verification: 'unverified' as const };
    expect(canSpawn(fake, fake.depthMin, 'mariana')).toBe(false);
  });
});
