import type { MarineSpecies, SiteId } from '../../data/schemas';

/** Species that may appear at this depth at this site. Unverified entries never spawn. */
export function eligibleSpecies(all: readonly MarineSpecies[], depth: number, site: SiteId): MarineSpecies[] {
  return all.filter(
    (s) => s.verification !== 'unverified' && s.sites.includes(site) && depth >= s.depthMin && depth <= s.depthMax,
  );
}

/** Whether a placement is scientifically allowed; used to reject bad spawns at runtime. */
export function canSpawn(species: MarineSpecies, depth: number, site: SiteId): boolean {
  return species.verification !== 'unverified' && species.sites.includes(site) && depth >= species.depthMin && depth <= species.depthMax;
}
