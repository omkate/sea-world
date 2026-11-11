// The film's type, bundled with the site (no third-party font requests): Cinzel for titles (after
// classical inscriptions: crowns, a castle, a king of the sea), Cormorant Garamond for its lines.
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import './styles.css';
import { createRenderer } from './core/renderer/createRenderer';
import { parseTier, selectTier } from './core/quality/tiers';
import { showFallback } from './ui/fallback/fallback';
import { mountCredits } from './ui/credits/Credits';

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const canvas = document.querySelector<HTMLCanvasElement>('#ocean')!;
  if (params.has('fallback')) return showFallback('preview');

  const isMobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;

  let info;
  try {
    info = await createRenderer(canvas, params.has('webgl'));
  } catch (err) {
    console.error(err);
    return showFallback('unsupported');
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const tier =
    parseTier(params.get('quality')) ??
    selectTier({
      isMobile,
      isWebGPU: info.backend === 'webgpu',
      hardwareConcurrency: navigator.hardwareConcurrency || 4,
      deviceMemoryGB: nav.deviceMemory,
      maxTextureSize: info.maxTextureSize,
      gpuVendor: info.gpuVendor,
    });

  const depthParam = params.get('depth');
  const startDepth = depthParam !== null && Number.isFinite(Number(depthParam)) ? Number(depthParam) : null;

  const { Experience } = await import('./core/engine/Experience');
  const experience = new Experience({
    info,
    tier,
    dom: {
      spacer: document.querySelector<HTMLElement>('#dive')!,
      hud: document.querySelector<HTMLElement>('#hud')!,
      debugRoot: document.body,
      cue: document.querySelector<HTMLElement>('#cue'),
    },
    startDepth,
    debug: params.has('debug'),
    companion: params.get('companion') !== '0',
  });
  await experience.prepare();
  experience.start();
  mountCredits(document.body);
  document.body.classList.add('ready');
  document.body.dataset.backend = info.backend;
  document.body.dataset.tier = tier;
}

void boot();
