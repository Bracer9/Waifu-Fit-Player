import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  outputDir: '../artifacts/song-pack-qa/results',
  testMatch: 'song-packs.spec.ts',
  timeout: 60000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4178',
    channel: 'chrome',
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4178 --strictPort',
    cwd: '..',
    env: { WFP_MAPS_DIR: 'artifacts/song-pack-qa/maps' },
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: false,
  },
});
