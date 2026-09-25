import type { SiteId } from '../schemas';

export interface SiteProfile {
  id: SiteId;
  name: string;
  maxDepth: number;
  /** In-situ temperature profile, [depth m, °C]. */
  temperature: readonly (readonly [number, number])[];
  temperatureVerification: 'verified' | 'uncertain';
  /** Diffuse attenuation Kd (1/m) for R, G, B bands. */
  kd: readonly [number, number, number];
  /** Depth of the deep chlorophyll maximum, m. */
  chlorophyllMaxDepth: number;
}

/**
 * Temperature points approximate a tropical western-Pacific profile: warm mixed layer,
 * thermocline, ~4 °C near 1,000 m, minimum near 4,000 m and an adiabatic rise at hadal depth
 * (~2.5 °C reported near the Challenger Deep floor). Values are uncertain until checked against
 * World Ocean Atlas / CTD casts for the Mariana region (see docs/ocean-zones.md).
 */
export const MARIANA: SiteProfile = {
  id: 'mariana',
  name: 'Mariana Islands → Mariana Trench',
  maxDepth: 10935,
  temperature: [
    [0, 28.8],
    [50, 28.4],
    [100, 27.0],
    [150, 23.5],
    [200, 19.0],
    [300, 13.0],
    [500, 8.0],
    [700, 5.6],
    [1000, 4.2],
    [1500, 2.9],
    [2000, 2.2],
    [3000, 1.65],
    [4000, 1.5],
    [5000, 1.52],
    [6000, 1.6],
    [8000, 1.95],
    [10935, 2.45],
  ],
  temperatureVerification: 'uncertain',
  kd: [0.35, 0.07, 0.022],
  chlorophyllMaxDepth: 120,
};
