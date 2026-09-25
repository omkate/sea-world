import { defineConfig } from '@playwright/test';

const gpuArgs = ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=vulkan', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1280, height: 720 },
    channel: process.env.PW_CHANNEL ?? 'chrome',
    launchOptions: { args: gpuArgs },
  },
  webServer: {
    command: 'pnpm vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
