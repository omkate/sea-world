import { rgb } from './FishMorph';
import type { FishSpeciesVisual } from './reefFish';

/**
 * Open-water fish off Guam. Proportions follow body depth ÷ total length; colours are
 * linear-light approximations of the coloration in the species manifest.
 */

const DARK_FIN = rgb(0.04, 0.06, 0.14);

/** Tuna share a body plan: deep forebody, needle-thin keeled peduncle, tall lunate tail, finlets. */
const tunaMorph = (depth: number, secondDorsal: number, pectoral: number): FishSpeciesVisual['morph'] => ({
  profile: [
    [0, 0.0, 0.0, 0],
    [0.03, 0.04 * depth, 0.03, 0],
    [0.1, 0.09 * depth, 0.065, 0],
    [0.3, 0.125 * depth, 0.09, 0],
    [0.45, 0.12 * depth, 0.085, 0],
    [0.65, 0.07 * depth, 0.05, 0],
    [0.8, 0.022, 0.02, 0],
    [0.84, 0.018, 0.03, 0],
  ],
  peduncle: 0.84,
  sectionExponent: 2.0,
  caudal: { shape: 'lunate', halfSpan: 0.2, length: 0.12 },
  // First dorsal, the second (sickle-shaped in yellowfin), then a row of finlets to the tail.
  dorsal: [
    [0.25, 0.0],
    [0.28, 0.06],
    [0.38, 0.025],
    [0.44, 0.02],
    [0.47, secondDorsal],
    [0.52, 0.035],
    [0.58, 0.018],
    [0.66, 0.015],
    [0.74, 0.012],
    [0.81, 0.008],
  ],
  anal: [
    [0.49, 0.0],
    [0.52, secondDorsal * 0.9],
    [0.57, 0.03],
    [0.64, 0.015],
    [0.72, 0.012],
    [0.81, 0.008],
  ],
  pectoral: { s: 0.27, length: pectoral, width: 0.04 },
  pelvic: { s: 0.28, length: 0.05 },
  eye: { s: 0.08, v: 0.25, radius: 0.024 },
  swim: { style: 'thunniform', bodyWave: 0.035, cruiseBL: 1.0 },
});

const thunnusAlbacares: FishSpeciesVisual = {
  speciesId: 'thunnus-albacares',
  morph: tunaMorph(1, 0.13, 0.22),
  pattern: {
    back: rgb(0.02, 0.05, 0.18),
    belly: rgb(0.72, 0.75, 0.78),
    bellyLine: 0.05,
    bellySoftness: 0.2,
    bands: [],
    // Faint vertical rows of pale spots and bars on the lower flank.
    stripes: [{ spacing: 0.035, width: 0.006, angle: 0, color: rgb(0.85, 0.87, 0.9), sMin: 0.3, sMax: 0.72, vMin: -0.9, vMax: -0.2 }],
    // The golden-yellow band along the upper flank.
    lines: [{ v: 0.18, halfHeight: 0.07, halfHeightTail: 0.05, color: rgb(0.85, 0.62, 0.08), sMin: 0.1, sMax: 0.7 }],
    fins: { dorsal: rgb(0.9, 0.72, 0.06), anal: rgb(0.9, 0.72, 0.06), caudal: DARK_FIN, pectoral: DARK_FIN },
    iris: rgb(0.1, 0.1, 0.12),
    sheen: 0.8,
    roughness: 0.25,
  },
};

const katsuwonusPelamis: FishSpeciesVisual = {
  speciesId: 'katsuwonus-pelamis',
  morph: tunaMorph(1.08, 0.05, 0.12),
  pattern: {
    back: rgb(0.05, 0.03, 0.16),
    belly: rgb(0.75, 0.77, 0.8),
    bellyLine: 0.0,
    bellySoftness: 0.18,
    bands: [],
    stripes: [],
    // Four to six dark lengthwise stripes on the belly.
    lines: [-0.3, -0.48, -0.66, -0.84].map((v) => ({ v, halfHeight: 0.035, halfHeightTail: 0.025, color: rgb(0.1, 0.1, 0.16), sMin: 0.22, sMax: 0.74 })),
    fins: { dorsal: DARK_FIN, anal: rgb(0.6, 0.62, 0.66), caudal: DARK_FIN, pectoral: DARK_FIN },
    iris: rgb(0.1, 0.1, 0.12),
    sheen: 0.8,
    roughness: 0.25,
  },
};

const decapterusMacarellus: FishSpeciesVisual = {
  speciesId: 'decapterus-macarellus',
  morph: {
    profile: [
      [0, 0.0, 0.0, 0],
      [0.03, 0.035, 0.025, 0],
      [0.1, 0.075, 0.045, 0],
      [0.3, 0.1, 0.055, 0],
      [0.5, 0.09, 0.05, 0],
      [0.7, 0.05, 0.03, 0],
      [0.8, 0.025, 0.015, 0],
      [0.83, 0.022, 0.013, 0],
    ],
    peduncle: 0.83,
    sectionExponent: 2.0,
    caudal: { shape: 'forked', halfSpan: 0.15, length: 0.17 },
    dorsal: [
      [0.28, 0.0],
      [0.31, 0.05],
      [0.38, 0.015],
      [0.42, 0.04],
      [0.6, 0.025],
      [0.78, 0.01],
    ],
    anal: [
      [0.5, 0.0],
      [0.53, 0.035],
      [0.65, 0.02],
      [0.78, 0.01],
    ],
    pectoral: { s: 0.25, length: 0.12, width: 0.035 },
    pelvic: { s: 0.28, length: 0.05 },
    eye: { s: 0.09, v: 0.22, radius: 0.04 },
    swim: { style: 'carangiform', bodyWave: 0.04, cruiseBL: 1.6 },
  },
  pattern: {
    back: rgb(0.08, 0.3, 0.32),
    belly: rgb(0.8, 0.82, 0.85),
    bellyLine: 0.1,
    bellySoftness: 0.25,
    // Small black blotch on the upper edge of the gill cover.
    bands: [{ s: 0.18, halfWidth: 0.012, slant: 0, color: rgb(0.01, 0.01, 0.015), vMin: 0.3, vMax: 0.6 }],
    stripes: [],
    fins: { dorsal: rgb(0.3, 0.42, 0.4), anal: rgb(0.8, 0.82, 0.82), caudal: rgb(0.6, 0.7, 0.2), pectoral: rgb(0.8, 0.82, 0.82) },
    iris: rgb(0.1, 0.1, 0.12),
    sheen: 0.9,
    roughness: 0.25,
  },
};

export const PELAGIC_FISH: readonly FishSpeciesVisual[] = [thunnusAlbacares, katsuwonusPelamis, decapterusMacarellus];
