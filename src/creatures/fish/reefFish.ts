import { rgb, type FishMorph, type FishPattern } from './FishMorph';

export interface FishSpeciesVisual {
  speciesId: string;
  morph: FishMorph;
  pattern: FishPattern;
}

/**
 * Reef fish of Guam. Proportions follow each species' body depth ÷ standard length;
 * colours are linear-light approximations of the verified coloration in the species manifest.
 */

const chromisViridis: FishSpeciesVisual = {
  speciesId: 'chromis-viridis',
  morph: {
    profile: [
      [0, 0.0, 0.0, 0],
      [0.02, 0.05, 0.03, -0.005],
      [0.08, 0.11, 0.05, 0],
      [0.2, 0.16, 0.06, 0.01],
      [0.38, 0.17, 0.058, 0.012],
      [0.58, 0.12, 0.042, 0.008],
      [0.74, 0.055, 0.02, 0.004],
      [0.8, 0.045, 0.015, 0.003],
    ],
    peduncle: 0.8,
    sectionExponent: 2.1,
    caudal: { shape: 'forked', halfSpan: 0.15, length: 0.22 },
    dorsal: [
      [0.2, 0.0],
      [0.26, 0.07],
      [0.5, 0.075],
      [0.66, 0.09],
      [0.74, 0.02],
    ],
    anal: [
      [0.5, 0.0],
      [0.56, 0.08],
      [0.68, 0.08],
      [0.75, 0.02],
    ],
    pectoral: { s: 0.27, length: 0.13, width: 0.05 },
    pelvic: { s: 0.3, length: 0.09 },
    eye: { s: 0.11, v: 0.28, radius: 0.034 },
    swim: { style: 'labriform', bodyWave: 0.035, cruiseBL: 1.6 },
  },
  pattern: {
    back: rgb(0.2, 0.62, 0.6),
    belly: rgb(0.62, 0.82, 0.8),
    bellyLine: -0.25,
    bellySoftness: 0.5,
    bands: [],
    stripes: [],
    fins: { dorsal: rgb(0.3, 0.62, 0.62), anal: rgb(0.35, 0.65, 0.65), caudal: rgb(0.35, 0.68, 0.68), pectoral: rgb(0.6, 0.8, 0.8) },
    iris: rgb(0.08, 0.2, 0.22),
    sheen: 0.7,
    roughness: 0.3,
  },
};

const BLACK = rgb(0.012, 0.012, 0.014);

const acanthurusTriostegus: FishSpeciesVisual = {
  speciesId: 'acanthurus-triostegus',
  morph: {
    profile: [
      [0, 0.0, 0.0, -0.03],
      [0.03, 0.05, 0.02, -0.035],
      [0.1, 0.15, 0.04, -0.01],
      [0.22, 0.2, 0.05, 0.01],
      [0.4, 0.2, 0.05, 0.01],
      [0.6, 0.13, 0.036, 0.004],
      [0.76, 0.05, 0.018, 0.0],
      [0.82, 0.045, 0.014, 0.0],
    ],
    peduncle: 0.82,
    sectionExponent: 2.0,
    caudal: { shape: 'emarginate', halfSpan: 0.13, length: 0.17 },
    dorsal: [
      [0.18, 0.0],
      [0.24, 0.05],
      [0.5, 0.06],
      [0.7, 0.065],
      [0.79, 0.015],
    ],
    anal: [
      [0.42, 0.0],
      [0.48, 0.055],
      [0.7, 0.06],
      [0.79, 0.015],
    ],
    pectoral: { s: 0.28, length: 0.14, width: 0.05 },
    pelvic: { s: 0.3, length: 0.07 },
    eye: { s: 0.14, v: 0.3, radius: 0.032 },
    swim: { style: 'labriform', bodyWave: 0.03, cruiseBL: 1.2 },
  },
  pattern: {
    back: rgb(0.52, 0.56, 0.44),
    belly: rgb(0.86, 0.86, 0.82),
    bellyLine: -0.1,
    bellySoftness: 0.35,
    // Six narrow black bars: the first oblique through the eye, the last on the caudal peduncle.
    bands: [
      { s: 0.14, halfWidth: 0.012, slant: 0.03, color: BLACK },
      { s: 0.26, halfWidth: 0.014, slant: 0.0, color: BLACK, vMin: -0.55 },
      { s: 0.39, halfWidth: 0.014, slant: 0.0, color: BLACK, vMin: -0.6 },
      { s: 0.52, halfWidth: 0.014, slant: 0.0, color: BLACK, vMin: -0.6 },
      { s: 0.65, halfWidth: 0.013, slant: 0.0, color: BLACK, vMin: -0.6 },
      { s: 0.77, halfWidth: 0.011, slant: 0.0, color: BLACK },
    ],
    stripes: [],
    fins: { dorsal: rgb(0.5, 0.52, 0.42), anal: rgb(0.7, 0.7, 0.62), caudal: rgb(0.55, 0.56, 0.46), pectoral: rgb(0.75, 0.76, 0.7) },
    iris: rgb(0.6, 0.5, 0.1),
    sheen: 0.35,
    roughness: 0.4,
  },
};

const chaetodonLunula: FishSpeciesVisual = {
  speciesId: 'chaetodon-lunula',
  morph: {
    profile: [
      [0, 0.0, 0.0, -0.01],
      [0.03, 0.03, 0.015, -0.01],
      [0.1, 0.12, 0.03, 0.0],
      [0.22, 0.24, 0.045, 0.02],
      [0.42, 0.26, 0.046, 0.02],
      [0.62, 0.17, 0.034, 0.01],
      [0.76, 0.06, 0.016, 0.0],
      [0.82, 0.05, 0.013, 0.0],
    ],
    peduncle: 0.82,
    sectionExponent: 2.0,
    caudal: { shape: 'truncate', halfSpan: 0.11, length: 0.15 },
    dorsal: [
      [0.16, 0.0],
      [0.26, 0.06],
      [0.55, 0.08],
      [0.7, 0.08],
      [0.8, 0.02],
    ],
    anal: [
      [0.44, 0.0],
      [0.52, 0.07],
      [0.7, 0.07],
      [0.8, 0.02],
    ],
    pectoral: { s: 0.3, length: 0.12, width: 0.045 },
    pelvic: { s: 0.3, length: 0.08 },
    eye: { s: 0.13, v: 0.22, radius: 0.03 },
    swim: { style: 'labriform', bodyWave: 0.025, cruiseBL: 0.9 },
  },
  pattern: {
    back: rgb(0.85, 0.52, 0.06),
    belly: rgb(0.9, 0.68, 0.12),
    bellyLine: -0.4,
    bellySoftness: 0.5,
    // Black "raccoon" mask through the eye, white band behind it.
    bands: [
      { s: 0.14, halfWidth: 0.035, slant: 0.05, color: BLACK, vMin: -0.2 },
      { s: 0.21, halfWidth: 0.025, slant: 0.05, color: rgb(0.9, 0.9, 0.86), vMin: -0.1 },
    ],
    stripes: [
      { spacing: 0.05, width: 0.012, angle: 0.9, color: rgb(0.45, 0.22, 0.04), sMin: 0.28, sMax: 0.74, vMin: -0.8, vMax: 0.6 },
    ],
    fins: { dorsal: rgb(0.85, 0.55, 0.06), anal: rgb(0.85, 0.55, 0.06), caudal: rgb(0.8, 0.6, 0.12), pectoral: rgb(0.85, 0.75, 0.5) },
    iris: rgb(0.05, 0.05, 0.05),
    sheen: 0.2,
    roughness: 0.45,
  },
};

const amphiprionChrysopterus: FishSpeciesVisual = {
  speciesId: 'amphiprion-chrysopterus',
  morph: {
    profile: [
      [0, 0.0, 0.0, -0.01],
      [0.03, 0.05, 0.035, -0.01],
      [0.1, 0.13, 0.065, 0.0],
      [0.25, 0.18, 0.078, 0.01],
      [0.45, 0.17, 0.074, 0.01],
      [0.65, 0.11, 0.05, 0.005],
      [0.78, 0.06, 0.028, 0.0],
      [0.83, 0.055, 0.022, 0.0],
    ],
    peduncle: 0.83,
    sectionExponent: 2.0,
    caudal: { shape: 'emarginate', halfSpan: 0.12, length: 0.17 },
    dorsal: [
      [0.2, 0.0],
      [0.28, 0.06],
      [0.5, 0.05],
      [0.62, 0.08],
      [0.78, 0.02],
    ],
    anal: [
      [0.52, 0.0],
      [0.58, 0.07],
      [0.72, 0.06],
      [0.79, 0.015],
    ],
    pectoral: { s: 0.3, length: 0.14, width: 0.06 },
    pelvic: { s: 0.32, length: 0.08 },
    eye: { s: 0.13, v: 0.26, radius: 0.038 },
    swim: { style: 'labriform', bodyWave: 0.04, cruiseBL: 1.1 },
  },
  pattern: {
    back: rgb(0.11, 0.05, 0.03),
    belly: rgb(0.28, 0.12, 0.05),
    bellyLine: -0.5,
    bellySoftness: 0.5,
    // Two blue-white bars; orange-yellow fins.
    bands: [
      { s: 0.2, halfWidth: 0.03, slant: 0.02, color: rgb(0.78, 0.85, 0.92) },
      { s: 0.5, halfWidth: 0.03, slant: -0.01, color: rgb(0.78, 0.85, 0.92) },
    ],
    stripes: [],
    fins: { dorsal: rgb(0.2, 0.08, 0.03), anal: rgb(0.9, 0.45, 0.04), caudal: rgb(0.95, 0.72, 0.18), pectoral: rgb(0.95, 0.5, 0.05) },
    iris: rgb(0.4, 0.2, 0.05),
    sheen: 0.25,
    roughness: 0.4,
  },
};

const nasoLituratus: FishSpeciesVisual = {
  speciesId: 'naso-lituratus',
  morph: {
    profile: [
      [0, 0.0, 0.0, -0.02],
      [0.03, 0.05, 0.025, -0.03],
      [0.1, 0.13, 0.045, -0.01],
      [0.25, 0.17, 0.055, 0.005],
      [0.45, 0.16, 0.052, 0.005],
      [0.65, 0.1, 0.036, 0.0],
      [0.78, 0.04, 0.016, 0.0],
      [0.82, 0.035, 0.012, 0.0],
    ],
    peduncle: 0.82,
    sectionExponent: 2.0,
    caudal: { shape: 'lunate', halfSpan: 0.15, length: 0.17 },
    dorsal: [
      [0.2, 0.0],
      [0.25, 0.05],
      [0.55, 0.05],
      [0.75, 0.05],
      [0.8, 0.01],
    ],
    anal: [
      [0.45, 0.0],
      [0.5, 0.045],
      [0.75, 0.045],
      [0.8, 0.01],
    ],
    pectoral: { s: 0.28, length: 0.13, width: 0.045 },
    pelvic: { s: 0.3, length: 0.06 },
    eye: { s: 0.16, v: 0.34, radius: 0.028 },
    swim: { style: 'labriform', bodyWave: 0.03, cruiseBL: 1.0 },
  },
  pattern: {
    back: rgb(0.2, 0.2, 0.2),
    belly: rgb(0.62, 0.55, 0.22),
    bellyLine: -0.35,
    bellySoftness: 0.45,
    // Orange lips; orange keeled plates on the caudal peduncle.
    bands: [
      { s: 0.025, halfWidth: 0.025, slant: 0, color: rgb(0.95, 0.42, 0.04), vMax: 0.05 },
      { s: 0.795, halfWidth: 0.018, slant: 0, color: rgb(0.95, 0.42, 0.04), vMin: -0.5, vMax: 0.5 },
    ],
    stripes: [],
    fins: { dorsal: rgb(0.8, 0.72, 0.3), anal: rgb(0.25, 0.25, 0.28), caudal: rgb(0.2, 0.2, 0.22), pectoral: rgb(0.3, 0.3, 0.3) },
    iris: rgb(0.2, 0.15, 0.08),
    sheen: 0.25,
    roughness: 0.45,
  },
};

export const REEF_FISH: readonly FishSpeciesVisual[] = [chromisViridis, acanthurusTriostegus, chaetodonLunula, amphiprionChrysopterus, nasoLituratus];

export function reefFish(speciesId: string): FishSpeciesVisual {
  const v = REEF_FISH.find((f) => f.speciesId === speciesId);
  if (!v) throw new Error(`No visual for ${speciesId}`);
  return v;
}
