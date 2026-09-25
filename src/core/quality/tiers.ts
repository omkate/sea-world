export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';

export const TIER_ORDER: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

export interface QualitySettings {
  tier: QualityTier;
  /** Max device-pixel-ratio multiplier the dynamic resolution may reach. */
  maxRenderScale: number;
  minRenderScale: number;
  /** Absolute cap on internal render pixels (3840×2160 on ultra). */
  maxPixels: number;
  surfaceSegments: number;
  surfaceWaves: number;
  suspendedParticles: number;
  lensEffects: boolean;
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
  },
  high: {
    tier: 'high',
    maxRenderScale: 1,
    minRenderScale: 0.55,
    maxPixels: 2560 * 1440,
    surfaceSegments: 288,
    surfaceWaves: 10,
    suspendedParticles: 36000,
    lensEffects: true,
  },
  medium: {
    tier: 'medium',
    maxRenderScale: 0.85,
    minRenderScale: 0.5,
    maxPixels: 1920 * 1080,
    surfaceSegments: 192,
    surfaceWaves: 8,
    suspendedParticles: 18000,
    lensEffects: true,
  },
  low: {
    tier: 'low',
    maxRenderScale: 0.7,
    minRenderScale: 0.45,
    maxPixels: 1280 * 720,
    surfaceSegments: 128,
    surfaceWaves: 6,
    suspendedParticles: 8000,
    lensEffects: false,
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
