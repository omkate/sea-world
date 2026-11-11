export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';

export const TIER_ORDER: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

export interface QualitySettings {
  tier: QualityTier;
  /** Internal render scale range (before FSR upscaling) that dynamic resolution may use. */
  maxRenderScale: number;
  minRenderScale: number;
  /** Cap on output (canvas) pixels: 3840×2160 on desktop tiers. */
  maxPixels: number;
  surfaceSegments: number;
  surfaceWaves: number;
  suspendedParticles: number;
  lensEffects: boolean;
  /** Ray-march samples for underwater light shafts. */
  shaftSamples: number;
  /** Distance (m) beyond which reef colonies are culled; the medium hides them anyway. */
  scenery: number;
  /** FSR 1 upscaling (high quality, costly on integrated GPUs); otherwise bilinear + sharpen. */
  fsr: boolean;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  ultra: {
    tier: 'ultra',
    maxRenderScale: 1,
    minRenderScale: 0.6,
    maxPixels: 3840 * 2160,
    surfaceSegments: 384,
    surfaceWaves: 12,
    suspendedParticles: 60000,
    lensEffects: true,
    shaftSamples: 14,
    fsr: true,
    scenery: 80,
  },
  high: {
    tier: 'high',
    maxRenderScale: 1,
    minRenderScale: 0.55,
    maxPixels: 3840 * 2160,
    surfaceSegments: 288,
    surfaceWaves: 10,
    suspendedParticles: 36000,
    lensEffects: true,
    shaftSamples: 9,
    fsr: false,
    scenery: 55,
  },
  medium: {
    tier: 'medium',
    maxRenderScale: 0.85,
    minRenderScale: 0.5,
    maxPixels: 2560 * 1440,
    surfaceSegments: 192,
    surfaceWaves: 8,
    suspendedParticles: 18000,
    lensEffects: true,
    shaftSamples: 6,
    fsr: false,
    scenery: 42,
  },
  low: {
    tier: 'low',
    maxRenderScale: 0.7,
    minRenderScale: 0.45,
    maxPixels: 1920 * 1080,
    surfaceSegments: 128,
    surfaceWaves: 6,
    suspendedParticles: 8000,
    lensEffects: false,
    shaftSamples: 4,
    fsr: false,
    scenery: 32,
  },
};

export interface DeviceHints {
  isMobile: boolean;
  isWebGPU: boolean;
  hardwareConcurrency: number;
  deviceMemoryGB: number | undefined;
  maxTextureSize: number;
  gpuVendor?: string | undefined;
}

export function selectTier(h: DeviceHints): QualityTier {
  if (h.isMobile) return 'low';
  let score = 0;
  if (h.isWebGPU) score += 2;
  if (h.hardwareConcurrency >= 8) score += 1;
  if (h.hardwareConcurrency >= 12) score += 1;
  if ((h.deviceMemoryGB ?? 8) >= 8) score += 1;
  if (h.maxTextureSize >= 16384) score += 1;
  const vendor = (h.gpuVendor ?? '').toLowerCase();
  if (vendor.includes('nvidia') || vendor.includes('amd') || vendor.includes('apple')) score += 1;
  if (score >= 6) return 'ultra';
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

export function parseTier(value: string | null): QualityTier | null {
  return value && (TIER_ORDER as readonly string[]).includes(value) ? (value as QualityTier) : null;
}

export function stepDown(tier: QualityTier): QualityTier {
  const i = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.max(0, i - 1)]!;
}

/** Pixel ratio that honours both the render scale and the tier's absolute pixel cap. */
export function effectivePixelRatio(devicePixelRatio: number, scale: number, width: number, height: number, maxPixels: number): number {
  const wanted = devicePixelRatio * scale;
  const cssPixels = Math.max(1, width * height);
  const capped = Math.sqrt(maxPixels / cssPixels);
  return Math.max(0.25, Math.min(wanted, capped));
}
