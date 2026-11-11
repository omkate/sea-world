import { expect, test, type Page } from '@playwright/test';
import { DISCOVERY_UI } from '../../src/discovery/flags';

const hud = (page: Page, field: string) => page.locator(`[data-hud="${field}"]`);
const depthMetres = async (page: Page) => page.evaluate(() => window.__abyss!.state.depth);

async function ready(page: Page) {
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 60_000 });
}

for (const backend of ['webgpu', 'webgl2'] as const) {
  test.describe(backend, () => {
    const q = backend === 'webgl2' ? '&webgl' : '';

    test('boots, renders and shows the HUD and the episode title at the surface', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`/?debug${q}`);
      await ready(page);
      await expect(hud(page, 'zone')).toHaveText('SURFACE');
      await expect(hud(page, 'pressure')).toHaveText('1.0 atm');
      await expect(page).toHaveTitle(/Episode 1/);
      await expect(page.locator('.opening-card h1')).toHaveText('The Sunken Crown');
      // The depth readout is for development only.
      await expect(page.locator('#hud')).toBeVisible();
      expect(await page.evaluate(() => document.body.dataset.backend)).toBe(backend);
      expect(errors).toEqual([]);
    });

    test('scrolling descends smoothly and monotonically', async ({ page }) => {
      await page.goto(`/?debug${q}`);
      await ready(page);
      await page.mouse.move(640, 360);
      const samples: number[] = [];
      for (let i = 0; i < 24; i++) {
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(120);
        samples.push(await depthMetres(page));
      }
      await page.waitForTimeout(2500);
      samples.push(await depthMetres(page));
      for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]! - 1e-6);
      expect(samples.at(-1)!).toBeGreaterThan(0);
      await expect(hud(page, 'zone')).not.toHaveText('SURFACE');
    });

    test('deep links jump to a depth and the HUD agrees with the physics', async ({ page }) => {
      await page.goto(`/?debug&depth=127${q}`);
      await ready(page);
      await expect(hud(page, 'depth')).toHaveText('127 m');
      await expect(hud(page, 'pressure')).toHaveText('13.6 atm');
      await expect(hud(page, 'zone')).toHaveText('SUNLIGHT ZONE');
      // The dive ends at the wreck terrace: deeper links clamp to the end of the finale.
      await page.goto(`/?debug&depth=1500${q}`);
      await ready(page);
      await expect(hud(page, 'depth')).toHaveText('145 m');
      await expect(hud(page, 'zone')).toHaveText('SUNLIGHT ZONE');
    });
  });
}

test('underwater frames darken continuously with depth', async ({ page }) => {
  const luminance: number[] = [];
  // Depths far enough apart that wave-driven flicker near the surface cannot reorder them; the
  // last is just above the finale (below 130 m the shot list takes the camera).
  for (const d of [5, 60, 128]) {
    // Without the dive companion: this measures the water's own light.
    await page.goto(`/?depth=${d}&companion=0`);
    await ready(page);
    await page.waitForTimeout(3000);
    const png = await page.screenshot({ clip: { x: 540, y: 420, width: 200, height: 120 } });
    luminance.push(await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      return sum / (data.length / 4);
    }, png.toString('base64')));
  }
  // Natural light falls monotonically with depth.
  for (let i = 1; i < luminance.length; i++) expect(luminance[i]!).toBeLessThan(luminance[i - 1]!);
});

test('the episode ends as a film, with an end card and a way back to the surface', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await ready(page);
  await expect(page.locator('body')).not.toHaveClass(/cinema-mode/);
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForFunction(() => window.__abyss!.state.depth > 144.5, null, { timeout: 15_000 });
  expect(await depthMetres(page)).toBeLessThanOrEqual(145 + 1e-6);
  await expect(hud(page, 'zone')).toHaveText('SUNLIGHT ZONE');
  await expect(page.locator('body')).toHaveClass(/cinema-mode/);
  await expect.poll(() => page.locator('.end-card').evaluate((e) => Number(getComputedStyle(e).opacity))).toBeGreaterThan(0.9);
  await expect(page.locator('.end-card h2')).toHaveText('ABYSS');
  await expect(page.locator('.end-card')).toContainText('End of Episode 1');
  // "Back to the surface" runs the film back to the boat: the letterbox lifts on the way up.
  await page.locator('.end-replay').click();
  await expect(page.locator('body')).not.toHaveClass(/cinema-mode/, { timeout: 30_000 });
  await page.waitForFunction(() => scrollY < 5, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('fallback page explains hardware acceleration is required', async ({ page }) => {
  await page.goto('/?fallback');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#fallback h1')).toContainText('hardware-accelerated');
  await expect(page.locator('#ocean')).toHaveCount(0);
});

// The discovery UI is switched off until the end of the build (src/discovery/flags.ts).
test('nearby species get a glyph, are logged, and open in the codex', async ({ page }) => {
  test.skip(!DISCOVERY_UI, 'discovery UI switched off (src/discovery/flags.ts)');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?depth=17');
  await ready(page);
  await expect(page.locator('.glyph:not([hidden])').first()).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.codex-toggle')).not.toHaveText(/^Codex 0\//);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss.discovered.v1') ?? '[]') as string[]);
  expect(stored.length).toBeGreaterThan(0);

  // The glyph follows a moving animal, so dispatch the click rather than wait for it to settle.
  await page.locator('.glyph:not([hidden])').first().dispatchEvent('click');
  await expect(page.locator('.species-card')).toBeVisible();
  await page.locator('.card-explore').click();
  await expect(page.locator('.codex')).toBeVisible();
  await expect(page.locator('.codex-detail h3')).not.toBeEmpty();
  await expect(page.locator('.codex-detail .badge')).toHaveText(/verified/i);

  // Locked entries never match a search.
  await page.locator('.codex-search').fill('anglerfish');
  await expect(page.locator('.codex-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.codex')).toBeHidden();
  expect(errors).toEqual([]);
});
