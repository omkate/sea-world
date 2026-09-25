import raw from './mariana.json';
import { SpeciesManifestSchema, type MarineSpecies } from '../schemas';

/**
 * Validated species manifest. Invalid data fails loudly in development and is skipped
 * entry-by-entry in production so one bad record can't take the experience down.
 */
export function loadSpecies(dev = import.meta.env?.DEV ?? true): MarineSpecies[] {
  const parsed = SpeciesManifestSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (dev) throw new Error(`Species manifest invalid:\n${JSON.stringify(parsed.error.issues, null, 2)}`);
  return [];
}
