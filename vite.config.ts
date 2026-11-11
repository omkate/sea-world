import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site from https://omkate.github.io/sea-world/.
  // Dev server, Playwright and Vitest keep running at the root.
  base: command === 'build' ? '/sea-world/' : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));
