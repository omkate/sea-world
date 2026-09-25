import { z } from 'zod';

export const CATEGORIES = [
  'Fish',
  'Mammals',
  'Reptiles',
  'Birds',
  'Cephalopods',
  'Crustaceans',
  'Cnidarians',
  'Echinoderms',
  'Mollusks',
  'Worms',
  'Plankton',
  'Microorganisms',
  'Corals',
  'Sponges',
] as const;

export const HABITATS = [
  'surface',
  'coral-reef',
  'reef-wall',
  'seagrass',
  'kelp-forest',
  'epipelagic',
  'mesopelagic',
  'bathypelagic',
  'abyssal-plain',
  'hydrothermal-vent',
  'whale-fall',
  'hadal-trench',
  'rocky-seafloor',
] as const;

export const SITES = ['mariana', 'monterey', 'east-pacific-rise'] as const;

export const LOCOMOTION = [
  'carangiform',
  'thunniform',
  'subcarangiform',
  'anguilliform',
  'labriform',
  'balistiform',
  'rajiform',
  'flipper',
  'fluke',
  'jet',
  'pulse',
  'drift',
  'crawl',
  'sessile',
  'flight',
  'swarm',
] as const;

export const BEHAVIORS = [
  'Idle',
  'Cruise',
  'SearchFood',
  'Feed',
  'Flee',
  'Chase',
  'School',
  'Avoid',
  'Rest',
  'Hide',
  'Investigate',
  'Surface',
  'Dive',
  'FollowCurrent',
  'StationKeep',
  'Ambush',
  'LureActivate',
  'VerticalMigrate',
  'BioluminescentSignal',
  'Territorial',
  'Graze',
  'Clean',
  'Scavenge',
  'Pulse',
  'Drift',
  'FilterFeed',
] as const;

export const VERIFICATION = ['verified', 'uncertain', 'unverified'] as const;

const SourceSchema = z.object({
  label: z.string().min(1),
  url: z.url(),
  field: z.string().optional(),
});

const VisualSchema = z.object({
  coloration: z.string().min(1),
  camouflage: z
    .array(z.enum(['countershading', 'transparent', 'red-pigment', 'black-pigment', 'mirror-sides', 'counterillumination', 'cryptic', 'none']))
    .default([]),
  photophores: z.boolean().default(false),
  bioluminescenceColor: z.string().optional(),
});

export const SpeciesSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    commonName: z.string().min(1),
    scientificName: z.string().min(1),
    taxonRank: z.enum(['species', 'genus', 'family', 'order', 'class', 'group']).default('species'),
    category: z.enum(CATEGORIES),
    depthMin: z.number().min(0),
    depthMax: z.number().max(11000),
    habitats: z.array(z.enum(HABITATS)).min(1),
    regions: z.array(z.string().min(1)).min(1),
    sites: z.array(z.enum(SITES)).min(1),
    sizeTypical: z.number().positive(),
    sizeMax: z.number().positive(),
    diet: z.string().optional(),
    behavior: z.array(z.enum(BEHAVIORS)).min(1),
    locomotion: z.enum(LOCOMOTION),
    bioluminescent: z.boolean(),
    visual: VisualSchema,
    adaptation: z.string().optional(),
    rarity: z.enum(['common', 'uncommon', 'rare', 'hidden']).default('common'),
    representation: z.enum(['hero', 'mid', 'instanced', 'particle']),
    modelAsset: z.string().optional(),
    verification: z.enum(VERIFICATION),
    uncertainFields: z.array(z.string()).default([]),
    notes: z.string().optional(),
    sources: z.array(SourceSchema),
  })
  .refine((s) => s.depthMax >= s.depthMin, { message: 'depthMax must be >= depthMin', path: ['depthMax'] })
  .refine((s) => s.sizeMax >= s.sizeTypical, { message: 'sizeMax must be >= sizeTypical', path: ['sizeMax'] })
  .refine((s) => s.verification === 'unverified' || s.sources.length > 0, {
    message: 'verified/uncertain species require at least one source',
    path: ['sources'],
  });

export type MarineSpecies = z.infer<typeof SpeciesSchema>;
export type Category = (typeof CATEGORIES)[number];
export type HabitatId = (typeof HABITATS)[number];
export type SiteId = (typeof SITES)[number];

export const SpeciesManifestSchema = z.array(SpeciesSchema).superRefine((list, ctx) => {
  const seen = new Set<string>();
  list.forEach((s, i) => {
    if (seen.has(s.id)) ctx.addIssue({ code: 'custom', message: `duplicate id ${s.id}`, path: [i, 'id'] });
    seen.add(s.id);
  });
});
