import {
  downwelling,
  exposureEV,
  lightFraction,
  lightLabel,
  particleDensity,
  pressureAtm,
  submersion,
  temperatureC,
  turbidity,
  ZONES,
  zoneIndexWithHysteresis,
  type LightLabel,
  type Rgb,
  type ZoneId,
} from '../data/zones/physics';
import type { SiteProfile } from '../data/sites/mariana';

export interface DepthState {
  /** Metres below the mean surface; negative when the camera is in the air. */
  depth: number;
  progress: number;
  pressureAtm: number;
  temperatureC: number;
  light: Rgb;
  lightFraction: number;
  lightLabel: LightLabel;
  zone: ZoneId;
  zoneName: string;
  zoneIndex: number;
  exposureEV: number;
  particleDensity: number;
  turbidity: number;
  submersion: number;
}

export function createDepthState(): DepthState {
  return {
    depth: 0,
    progress: 0,
    pressureAtm: 1,
    temperatureC: 0,
    light: [1, 1, 1],
    lightFraction: 1,
    lightLabel: 'BRIGHT',
    zone: 'surface',
    zoneName: 'SURFACE',
    zoneIndex: -1,
    exposureEV: 0,
    particleDensity: 1,
    turbidity: 0,
    submersion: 0,
  };
}

export function updateDepthState(state: DepthState, depth: number, progress: number, site: SiteProfile): DepthState {
  const z = Math.max(0, depth);
  state.depth = depth;
  state.progress = progress;
  state.pressureAtm = pressureAtm(z);
  state.temperatureC = temperatureC(z, site);
  downwelling(z, site.kd, state.light);
  state.lightFraction = lightFraction(z, site.kd);
  state.lightLabel = lightLabel(state.lightFraction);
  state.exposureEV = exposureEV(z, site.kd);
  state.particleDensity = particleDensity(z, site.chlorophyllMaxDepth);
  state.turbidity = turbidity(z, site.chlorophyllMaxDepth);
  state.submersion = submersion(depth);

  if (depth < 0) {
    state.zone = 'surface';
    state.zoneName = 'SURFACE';
    state.zoneIndex = -1;
  } else {
    const index = zoneIndexWithHysteresis(z, state.zoneIndex < 0 ? null : state.zoneIndex);
    const zone = ZONES[index]!;
    state.zone = zone.id;
    state.zoneName = zone.name;
    state.zoneIndex = index;
  }
  return state;
}
