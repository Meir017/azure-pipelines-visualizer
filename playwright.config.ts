import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './recordings',
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    video: 'on',
  },
  outputDir: './recordings/test-results',
  reporter: [['list']],
  workers: 1,
});
