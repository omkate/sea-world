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
    sheen: 0.4,
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

const amphiprionMelanopus: FishSpeciesVisual = {
  speciesId: 'amphiprion-melanopus',
  morph: amphiprionChrysopterus.morph,
  pattern: {
    back: rgb(0.85, 0.16, 0.03),
    belly: rgb(0.95, 0.3, 0.05),
    bellyLine: -0.4,
    bellySoftness: 0.5,
    // One white head bar edged in black; a dark patch over the rear flank.
    bands: [
      { s: 0.2, halfWidth: 0.028, slant: 0.02, color: rgb(0.92, 0.94, 0.95), edge: BLACK },
      { s: 0.52, halfWidth: 0.16, slant: 0.05, color: rgb(0.06, 0.02, 0.015), vMin: -0.45, vMax: 0.75 },
    ],
    stripes: [],
    fins: { dorsal: rgb(0.85, 0.2, 0.04), anal: rgb(0.08, 0.03, 0.02), caudal: rgb(0.95, 0.3, 0.05), pectoral: rgb(0.95, 0.35, 0.06) },
    iris: rgb(0.5, 0.2, 0.05),
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

const WHITE = rgb(0.9, 0.92, 0.94);
const ROYAL_BLUE = rgb(0.06, 0.16, 0.62);

const pygoplitesDiacanthus: FishSpeciesVisual = {
  speciesId: 'pygoplites-diacanthus',
  morph: {
    profile: [
      [0, 0.0, 0.0, -0.01],
      [0.03, 0.06, 0.02, -0.01],
      [0.1, 0.16, 0.035, 0.0],
      [0.25, 0.25, 0.045, 0.01],
      [0.45, 0.25, 0.044, 0.01],
      [0.65, 0.16, 0.032, 0.005],
      [0.78, 0.07, 0.016, 0.0],
      [0.83, 0.06, 0.013, 0.0],
    ],
    peduncle: 0.83,
    sectionExponent: 2.0,
    caudal: { shape: 'rounded', halfSpan: 0.12, length: 0.15 },
    dorsal: [
      [0.18, 0.0],
      [0.28, 0.06],
      [0.55, 0.09],
      [0.72, 0.1],
      [0.81, 0.02],
    ],
    anal: [
      [0.45, 0.0],
      [0.52, 0.08],
      [0.7, 0.1],
      [0.81, 0.02],
    ],
    pectoral: { s: 0.3, length: 0.12, width: 0.045 },
    pelvic: { s: 0.3, length: 0.09 },
    eye: { s: 0.13, v: 0.2, radius: 0.03 },
    swim: { style: 'labriform', bodyWave: 0.025, cruiseBL: 0.8 },
  },
  pattern: {
    back: rgb(0.95, 0.5, 0.06),
    belly: rgb(0.95, 0.62, 0.1),
    bellyLine: -0.5,
    bellySoftness: 0.5,
    // Eight blue-edged white bars, slanting back toward the dorsal fin.
    bands: [0.2, 0.27, 0.34, 0.41, 0.48, 0.55, 0.62, 0.69].map((s) => ({ s, halfWidth: 0.011, slant: 0.05, color: WHITE, edge: ROYAL_BLUE })),
    stripes: [],
    fins: { dorsal: rgb(0.12, 0.2, 0.55), anal: rgb(0.1, 0.16, 0.5), caudal: rgb(0.95, 0.72, 0.08), pectoral: rgb(0.95, 0.72, 0.1) },
    iris: rgb(0.15, 0.15, 0.4),
    sheen: 0.3,
    roughness: 0.4,
  },
};

const balistoidesConspicillum: FishSpeciesVisual = {
  speciesId: 'balistoides-conspicillum',
  morph: {
    profile: [
      [0, 0.0, 0.0, 0.0],
      [0.03, 0.05, 0.02, 0.0],
      [0.12, 0.15, 0.05, 0.01],
      [0.3, 0.21, 0.07, 0.01],
      [0.48, 0.19, 0.065, 0.0],
      [0.66, 0.11, 0.04, 0.0],
      [0.78, 0.05, 0.018, 0.0],
      [0.82, 0.045, 0.014, 0.0],
    ],
    peduncle: 0.82,
    sectionExponent: 2.2,
    caudal: { shape: 'truncate', halfSpan: 0.12, length: 0.16 },
    dorsal: [
      [0.5, 0.0],
      [0.56, 0.07],
      [0.7, 0.06],
      [0.8, 0.015],
    ],
    anal: [
      [0.5, 0.0],
      [0.56, 0.07],
      [0.7, 0.06],
      [0.8, 0.015],
    ],
    pectoral: { s: 0.3, length: 0.08, width: 0.04 },
    pelvic: null,
    eye: { s: 0.22, v: 0.42, radius: 0.026 },
    // Triggerfish scull with their dorsal and anal fins and keep the body almost rigid.
    swim: { style: 'labriform', bodyWave: 0.015, cruiseBL: 0.7 },
  },
  pattern: {
    back: rgb(0.02, 0.02, 0.025),
    belly: rgb(0.015, 0.015, 0.02),
    bellyLine: 0,
    bellySoftness: 0.4,
    // Orange lips, then a yellow-white bar across the snout in front of the eye; pale tail band.
    bands: [
      { s: 0.03, halfWidth: 0.03, slant: 0, color: rgb(0.95, 0.4, 0.04) },
      { s: 0.13, halfWidth: 0.025, slant: -0.02, color: rgb(0.95, 0.85, 0.3), vMin: -0.2, vMax: 0.7 },
    ],
    stripes: [],
    spots: [
      // Big white spots on the dark belly.
      { cell: 0.1, aspect: 0.35, radius: 0.33, color: WHITE, sMin: 0.2, sMax: 0.7, vMin: -1, vMax: -0.15 },
      // Yellow reticulated saddle on the back.
      { cell: 0.045, aspect: 0.2, radius: 0.38, color: rgb(0.95, 0.75, 0.08), sMin: 0.3, sMax: 0.62, vMin: 0.35, vMax: 0.95 },
    ],
    fins: { dorsal: rgb(0.03, 0.03, 0.035), anal: rgb(0.03, 0.03, 0.035), caudal: rgb(0.7, 0.72, 0.7), pectoral: rgb(0.2, 0.18, 0.1) },
    iris: rgb(0.5, 0.4, 0.1),
    sheen: 0.15,
    roughness: 0.5,
  },
};

const chlorurusSpilurus: FishSpeciesVisual = {
  speciesId: 'chlorurus-spilurus',
  morph: {
    profile: [
      [0, 0.0, 0.0, -0.01],
      [0.02, 0.06, 0.04, -0.01],
      [0.1, 0.13, 0.065, 0.0],
      [0.28, 0.16, 0.075, 0.005],
      [0.48, 0.15, 0.07, 0.005],
      [0.66, 0.1, 0.048, 0.0],
      [0.79, 0.05, 0.024, 0.0],
      [0.83, 0.045, 0.02, 0.0],
    ],
    peduncle: 0.83,
    sectionExponent: 2.0,
    caudal: { shape: 'emarginate', halfSpan: 0.13, length: 0.17 },
    dorsal: [
      [0.2, 0.0],
      [0.25, 0.04],
      [0.6, 0.045],
      [0.78, 0.04],
      [0.82, 0.01],
    ],
    anal: [
      [0.55, 0.0],
      [0.6, 0.045],
      [0.78, 0.04],
      [0.82, 0.01],
    ],
    pectoral: { s: 0.27, length: 0.13, width: 0.05 },
    pelvic: { s: 0.3, length: 0.07 },
    eye: { s: 0.13, v: 0.3, radius: 0.026 },
    // Parrotfish row with their pectoral fins.
    swim: { style: 'labriform', bodyWave: 0.03, cruiseBL: 1.0 },
  },
  pattern: {
    // Terminal-phase male: blue-green with pink-orange markings on the head and fin margins.
    back: rgb(0.04, 0.42, 0.32),
    belly: rgb(0.12, 0.6, 0.5),
    bellyLine: -0.3,
    bellySoftness: 0.5,
    bands: [{ s: 0.04, halfWidth: 0.035, slant: 0, color: rgb(0.1, 0.5, 0.45), vMax: 0.3 }],
    stripes: [
      // Pink scale margins.
      { spacing: 0.045, width: 0.006, angle: 0.4, color: rgb(0.85, 0.42, 0.45), sMin: 0.22, sMax: 0.78, vMin: -0.8, vMax: 0.8 },
    ],
    lines: [{ v: -0.25, halfHeight: 0.07, halfHeightTail: 0.05, color: rgb(0.95, 0.5, 0.35), sMin: 0.04, sMax: 0.2 }],
    fins: { dorsal: rgb(0.9, 0.45, 0.4), anal: rgb(0.9, 0.45, 0.4), caudal: rgb(0.08, 0.5, 0.45), pectoral: rgb(0.15, 0.45, 0.55) },
    iris: rgb(0.6, 0.3, 0.1),
    sheen: 0.4,
    roughness: 0.35,
  },
};

const labroidesDimidiatus: FishSpeciesVisual = {
  speciesId: 'labroides-dimidiatus',
  morph: {
    profile: [
      [0, 0.0, 0.0, 0.0],
      [0.03, 0.035, 0.025, 0.0],
      [0.12, 0.08, 0.045, 0.0],
      [0.3, 0.095, 0.05, 0.0],
      [0.5, 0.09, 0.046, 0.0],
      [0.7, 0.065, 0.032, 0.0],
      [0.83, 0.045, 0.02, 0.0],
      [0.86, 0.04, 0.017, 0.0],
    ],
    peduncle: 0.86,
    sectionExponent: 2.0,
    caudal: { shape: 'truncate', halfSpan: 0.08, length: 0.13 },
    dorsal: [
      [0.25, 0.0],
      [0.3, 0.03],
      [0.8, 0.035],
      [0.85, 0.01],
    ],
    anal: [
      [0.5, 0.0],
      [0.55, 0.03],
      [0.8, 0.03],
      [0.85, 0.01],
    ],
    pectoral: { s: 0.25, length: 0.1, width: 0.04 },
    pelvic: { s: 0.28, length: 0.05 },
    eye: { s: 0.1, v: 0.15, radius: 0.04 },
    swim: { style: 'labriform', bodyWave: 0.04, cruiseBL: 1.2 },
  },
  pattern: {
    back: rgb(0.12, 0.32, 0.85),
    belly: rgb(0.75, 0.85, 0.95),
    bellyLine: -0.2,
    bellySoftness: 0.4,
    bands: [],
    stripes: [],
    // Black lateral stripe from the snout through the eye, widening into the tail.
    lines: [{ v: 0, halfHeight: 0.14, halfHeightTail: 0.45, color: rgb(0.01, 0.01, 0.02), sMin: 0.0, sMax: 1.0 }],
    fins: { dorsal: rgb(0.1, 0.25, 0.75), anal: rgb(0.6, 0.7, 0.9), caudal: rgb(0.08, 0.2, 0.7), pectoral: rgb(0.7, 0.8, 0.9) },
    iris: rgb(0.1, 0.1, 0.12),
    sheen: 0.4,
    roughness: 0.35,
  },
};

const dascyllusAruanus: FishSpeciesVisual = {
  speciesId: 'dascyllus-aruanus',
  morph: {
    profile: [
      [0, 0.0, 0.0, -0.01],
      [0.03, 0.06, 0.035, -0.01],
      [0.1, 0.16, 0.06, 0.0],
      [0.25, 0.23, 0.07, 0.015],
      [0.45, 0.22, 0.066, 0.015],
      [0.64, 0.13, 0.045, 0.005],
      [0.77, 0.06, 0.024, 0.0],
      [0.82, 0.055, 0.02, 0.0],
    ],
    peduncle: 0.82,
    sectionExponent: 2.0,
    caudal: { shape: 'emarginate', halfSpan: 0.12, length: 0.18 },
    dorsal: [
      [0.17, 0.0],
      [0.25, 0.1],
      [0.5, 0.09],
      [0.68, 0.08],
      [0.77, 0.02],
    ],
    anal: [
      [0.5, 0.0],
      [0.56, 0.09],
      [0.7, 0.08],
      [0.77, 0.02],
    ],
    pectoral: { s: 0.28, length: 0.13, width: 0.05 },
    pelvic: { s: 0.28, length: 0.1 },
    eye: { s: 0.12, v: 0.22, radius: 0.04 },
    swim: { style: 'labriform', bodyWave: 0.035, cruiseBL: 1.3 },
  },
  pattern: {
    back: WHITE,
    belly: rgb(0.88, 0.9, 0.9),
    bellyLine: -0.3,
    bellySoftness: 0.5,
    // Three black bars: through the eye, mid-body into the dorsal fin, and across the rear.
    bands: [
      { s: 0.12, halfWidth: 0.04, slant: 0.06, color: BLACK },
      { s: 0.38, halfWidth: 0.06, slant: 0.1, color: BLACK },
      { s: 0.66, halfWidth: 0.045, slant: 0.08, color: BLACK },
    ],
    stripes: [],
    fins: { dorsal: BLACK, anal: BLACK, caudal: rgb(0.8, 0.82, 0.82), pectoral: rgb(0.85, 0.87, 0.87) },
    iris: rgb(0.05, 0.05, 0.05),
    sheen: 0.2,
    roughness: 0.4,
  },
};

export const REEF_FISH: readonly FishSpeciesVisual[] = [
  chromisViridis,
  acanthurusTriostegus,
  chaetodonLunula,
  amphiprionChrysopterus,
  amphiprionMelanopus,
  nasoLituratus,
  pygoplitesDiacanthus,
  balistoidesConspicillum,
  chlorurusSpilurus,
  labroidesDimidiatus,
  dascyllusAruanus,
];

export function reefFish(speciesId: string): FishSpeciesVisual {
  const v = REEF_FISH.find((f) => f.speciesId === speciesId);
  if (!v) throw new Error(`No visual for ${speciesId}`);
  return v;
}
