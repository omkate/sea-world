import { rgb } from './FishMorph';
import type { FishSpeciesVisual } from './reefFish';

/**
 * Mesopelagic fish (200–1,000 m). Colours are linear-light approximations of the coloration
 * in the species manifest; photophore rows follow each genus' published layout in outline only.
 */

/** Bioluminescence in this zone is mostly blue (~470–490 nm). */
const BLUE_LIGHT = rgb(0.15, 0.55, 1.0);

const diaphus: FishSpeciesVisual = {
  speciesId: 'diaphus',
  morph: {
    profile: [
      [0, 0.0, 0.0, 0],
      [0.03, 0.07, 0.04, 0],
      [0.12, 0.12, 0.06, 0],
      [0.3, 0.12, 0.055, 0],
      [0.55, 0.085, 0.04, 0],
      [0.75, 0.04, 0.02, 0],
      [0.82, 0.035, 0.016, 0],
    ],
    peduncle: 0.82,
    sectionExponent: 2.0,
    caudal: { shape: 'forked', halfSpan: 0.13, length: 0.17 },
    dorsal: [
      [0.35, 0.0],
      [0.38, 0.06],
      [0.5, 0.03],
      [0.55, 0.0],
    ],
    anal: [
      [0.5, 0.0],
      [0.53, 0.05],
      [0.68, 0.02],
      [0.72, 0.0],
    ],
    pectoral: { s: 0.22, length: 0.1, width: 0.03 },
    pelvic: { s: 0.35, length: 0.06 },
    // Lanternfish have very large eyes.
    eye: { s: 0.09, v: 0.2, radius: 0.06 },
    swim: { style: 'subcarangiform', bodyWave: 0.05, cruiseBL: 1.5 },
  },
  pattern: {
    // Dark body with silvery sides. Mirror sides reflect the surrounding water rather than
    // scattering light, so the silver is a low diffuse albedo with high gloss (it flashes under the lamp).
    back: rgb(0.04, 0.05, 0.07),
    belly: rgb(0.2, 0.22, 0.25),
    bellyLine: 0.15,
    bellySoftness: 0.3,
    bands: [],
    stripes: [],
    fins: { dorsal: rgb(0.1, 0.1, 0.12), anal: rgb(0.2, 0.2, 0.22), caudal: rgb(0.1, 0.1, 0.12), pectoral: rgb(0.3, 0.3, 0.32) },
    iris: rgb(0.3, 0.32, 0.35),
    sheen: 0.7,
    roughness: 0.3,
    photophores: {
      color: BLUE_LIGHT,
      // Two ventral rows and the enlarged luminous organs near the eye ("headlights").
      rows: [
        { v: -0.6, sMin: 0.14, sMax: 0.74, count: 13, radius: 0.012 },
        { v: -0.88, sMin: 0.2, sMax: 0.68, count: 9, radius: 0.011 },
        { v: 0.45, sMin: 0.03, sMax: 0.09, count: 1, radius: 0.022 },
      ],
      brightness: 1.8,
      flash: true,
      flashWave: true,
      counterillumination: true,
    },
    mirror: 0.5,
  },
};

const argyropelecusHemigymnus: FishSpeciesVisual = {
  speciesId: 'argyropelecus-hemigymnus',
  morph: {
    // A deep, keeled "hatchet" forebody tapering abruptly into a thin tail stalk.
    profile: [
      [0, 0.0, 0.0, 0.05],
      [0.04, 0.1, 0.03, 0.04],
      [0.15, 0.26, 0.045, -0.04],
      [0.35, 0.3, 0.045, -0.08],
      [0.52, 0.22, 0.035, -0.06],
      [0.62, 0.07, 0.016, 0],
      [0.8, 0.045, 0.012, 0],
      [0.84, 0.04, 0.01, 0],
    ],
    peduncle: 0.84,
    sectionExponent: 2.2,
    caudal: { shape: 'forked', halfSpan: 0.12, length: 0.15 },
    dorsal: [
      [0.4, 0.0],
      [0.44, 0.05],
      [0.55, 0.02],
      [0.6, 0.0],
    ],
    anal: [
      [0.55, 0.0],
      [0.58, 0.04],
      [0.7, 0.02],
      [0.75, 0.0],
    ],
    pectoral: { s: 0.22, length: 0.1, width: 0.03 },
    pelvic: { s: 0.4, length: 0.05 },
    // Tubular eyes looking upward, high on the head.
    eye: { s: 0.1, v: 0.5, radius: 0.07 },
    swim: { style: 'labriform', bodyWave: 0.03, cruiseBL: 0.8 },
  },
  pattern: {
    // Bright mirror-silver, with a dark back (low diffuse albedo, high gloss: see Diaphus).
    back: rgb(0.08, 0.09, 0.12),
    belly: rgb(0.18, 0.2, 0.22),
    bellyLine: 0.6,
    bellySoftness: 0.15,
    bands: [],
    stripes: [],
    fins: { dorsal: rgb(0.5, 0.52, 0.55), anal: rgb(0.6, 0.62, 0.65), caudal: rgb(0.5, 0.52, 0.55), pectoral: rgb(0.6, 0.62, 0.65) },
    iris: rgb(0.2, 0.22, 0.25),
    sheen: 1,
    roughness: 0.15,
    photophores: {
      color: BLUE_LIGHT,
      // Large ventral photophores along the keel.
      rows: [{ v: -0.9, sMin: 0.12, sMax: 0.6, count: 12, radius: 0.016 }],
      brightness: 1.4,
      flash: false,
      counterillumination: true,
    },
    // Hatchetfish flanks are near-perfect mirrors: they vanish upright and flash when tilted.
    mirror: 1,
  },
};

const cyclothone: FishSpeciesVisual = {
  speciesId: 'cyclothone',
  morph: {
    // Slender, elongate bristlemouth.
    profile: [
      [0, 0.0, 0.0, 0],
      [0.03, 0.05, 0.025, 0],
      [0.12, 0.07, 0.03, 0],
      [0.35, 0.065, 0.028, 0],
      [0.6, 0.05, 0.022, 0],
      [0.82, 0.03, 0.012, 0],
      [0.86, 0.028, 0.01, 0],
    ],
    peduncle: 0.86,
    sectionExponent: 2.0,
    caudal: { shape: 'forked', halfSpan: 0.1, length: 0.13 },
    dorsal: [
      [0.5, 0.0],
      [0.53, 0.04],
      [0.62, 0.0],
    ],
    anal: [
      [0.48, 0.0],
      [0.52, 0.04],
      [0.68, 0.0],
    ],
    pectoral: { s: 0.18, length: 0.07, width: 0.02 },
    pelvic: { s: 0.4, length: 0.04 },
    eye: { s: 0.07, v: 0.2, radius: 0.025 },
    swim: { style: 'subcarangiform', bodyWave: 0.06, cruiseBL: 0.6 },
  },
  pattern: {
    // Brown to brown-black with dense stellate pigment.
    back: rgb(0.05, 0.035, 0.025),
    belly: rgb(0.08, 0.06, 0.045),
    bellyLine: 0,
    bellySoftness: 0.5,
    bands: [],
    stripes: [],
    fins: { dorsal: rgb(0.06, 0.05, 0.04), anal: rgb(0.06, 0.05, 0.04), caudal: rgb(0.06, 0.05, 0.04), pectoral: rgb(0.08, 0.06, 0.05) },
    iris: rgb(0.1, 0.1, 0.1),
    sheen: 0.1,
    roughness: 0.6,
    photophores: {
      color: BLUE_LIGHT,
      // Small photophores in a single ventral row.
      rows: [{ v: -0.75, sMin: 0.12, sMax: 0.78, count: 15, radius: 0.008 }],
      brightness: 0.45,
      flash: false,
      counterillumination: false,
    },
  },
};

export const TWILIGHT_FISH: readonly FishSpeciesVisual[] = [diaphus, argyropelecusHemigymnus, cyclothone];
