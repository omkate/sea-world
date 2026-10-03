import type { MarineSpecies } from '../../data/schemas';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Plain-language names for manifest fields, used when flagging uncertain values. */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  scientificName: 'name',
  depthMin: 'shallowest depth',
  depthMax: 'deepest depth',
  regions: 'presence at Guam',
  sizeTypical: 'typical size',
  sizeMax: 'maximum size',
  diet: 'diet',
  behavior: 'behaviour',
  bioluminescent: 'bioluminescence',
  'visual.coloration': 'colouring',
  'visual.bioluminescenceColor': 'light colour',
  habitats: 'habitat',
};

const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Splits PascalCase behaviour ids: "StationKeep" → "station keep". */
const behaviourLabel = (b: string) => b.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

export function depthRange(s: MarineSpecies): string {
  return s.depthMin === s.depthMax ? `${nf.format(s.depthMin)} m` : `${nf.format(s.depthMin)}–${nf.format(s.depthMax)} m`;
}

export function sizeLabel(metres: number): string {
  return metres < 1 ? `${nf.format(metres * 100)} cm` : `${(Math.round(metres * 10) / 10).toString()} m`;
}

export function habitatLabel(s: MarineSpecies): string {
  return s.habitats.map(titleCase).join(', ');
}

export function behaviourList(s: MarineSpecies): string {
  return titleCase(s.behavior.map(behaviourLabel).join(', '));
}

export interface VerificationBadge {
  label: string;
  tone: 'verified' | 'uncertain';
  /** Which values are not confirmed, in plain language. */
  detail: string | null;
}

/** The codex shows verification on every entry; uncertain values are named, never hidden. */
export function verificationBadge(s: MarineSpecies): VerificationBadge {
  if (s.verification === 'verified') return { label: 'Verified', tone: 'verified', detail: null };
  const fields = s.uncertainFields.map((f) => FIELD_LABELS[f] ?? f);
  return { label: 'Partly verified', tone: 'uncertain', detail: fields.length > 0 ? `Unconfirmed: ${fields.join(', ')}` : null };
}

/** True when a field is flagged uncertain, so the value can be marked where it is shown. */
export function isUncertain(s: MarineSpecies, field: string): boolean {
  return s.uncertainFields.includes(field);
}
