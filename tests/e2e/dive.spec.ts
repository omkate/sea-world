import { expect, test, type Page } from '@playwright/test';

const hud = (page: Page, field: string) => page.locator(`[data-hud="${field}"]`);
const depthMetres = async (page: Page) => page.evaluate(() => window.__abyss!.state.depth);

async function ready(page: Page) {
  await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 60_000 });
}

for (const backend of ['webgpu', 'webgl2'] as const) {
  test.describe(backend, () => {
    const q = backend === 'webgl2' ? '&webgl' : '';

    test('boots, renders and shows the HUD at the surface', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`/?debug${q}`);
      await ready(page);
      await expect(hud(page, 'zone')).toHaveText('SURFACE');
      await expect(hud(page, 'pressure')).toHaveText('1.0 atm');
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
      await page.goto(`/?debug&depth=1500${q}`);
      await ready(page);
      await expect(hud(page, 'zone')).toHaveText('MIDNIGHT ZONE');
      await expect(hud(page, 'light')).toHaveText('NONE · LAMP');
    });
  });
}

test('underwater frames darken continuously with depth', async ({ page }) => {
  const luminance: number[] = [];
  for (const d of [5, 100, 300, 600, 1500]) {
    await page.goto(`/?depth=${d}`);
    await ready(page);
    // From ~450 m the camera lamp switches on; measure natural light only.
    if (d >= 450) await page.keyboard.press('l');
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
  // Natural light falls monotonically through the sunlit and twilight zones…
  for (let i = 1; i < luminance.length - 1; i++) expect(luminance[i]!).toBeLessThan(luminance[i - 1]!);
  // …and below 1,000 m only the camera's sensor-noise floor remains.
  expect(luminance.at(-1)!).toBeLessThan(3);
});

test('the lamp comes on where sunlight ends and lights marine snow', async ({ page }) => {
  await page.goto('/?debug&depth=3000');
  await ready(page);
  await expect(hud(page, 'light')).toHaveText('NONE · LAMP');
  expect(await page.evaluate(() => window.__abyss!.state.lightLabel)).toBe('NONE');
  await page.keyboard.press('l');
  await expect(hud(page, 'light')).toHaveText('NONE');
});

test('fallback page explains hardware acceleration is required', async ({ page }) => {
  await page.goto('/?fallback');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#fallback h1')).toContainText('hardware-accelerated');
  await expect(page.locator('#ocean')).toHaveCount(0);
});
