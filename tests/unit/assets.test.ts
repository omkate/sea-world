import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../../assets/manifest.json';
import sources from '../../assets/sources.json';

const ALLOWED = new Set(['CC0 Public Domain', 'CC Attribution']);
const root = path.resolve(import.meta.dirname, '../..');

describe('asset manifest', () => {
  it('uses only licences that allow commercial use and modification', () => {
    for (const m of manifest) expect(ALLOWED.has(m.license), m.id).toBe(true);
  });

  it('credits every model with author, source and licence links', () => {
    for (const m of manifest) {
      expect(m.author.length, m.id).toBeGreaterThan(0);
      expect(m.source, m.id).toMatch(/^https:\/\/sketchfab\.com\//);
      expect(m.licenseUrl, m.id).toMatch(/^https:\/\/creativecommons\.org\//);
      expect(m.modifications.length, m.id).toBeGreaterThan(0);
    }
  });

  it('ships a file for every manifest entry and nothing unlisted', () => {
    const shipped = fs.readdirSync(path.join(root, 'public/assets/models')).sort();
    expect(shipped).toEqual(manifest.map((m) => path.basename(m.file)).sort());
  });

  it('has a manifest entry for every source and vice versa', () => {
    expect(sources.map((s) => s.id).sort()).toEqual(manifest.map((m) => m.id).sort());
  });

  it('never commits the API token', () => {
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/\.env\*\.local/);
    for (const f of ['assets/manifest.json', 'assets/sources.json', 'scripts/fetch-assets.ts']) {
      expect(fs.readFileSync(path.join(root, f), 'utf8')).not.toMatch(/SKETCHFAB_TOKEN=\w+/);
    }
  });
});
