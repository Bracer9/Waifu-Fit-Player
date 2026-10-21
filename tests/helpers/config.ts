import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const testRoot = fileURLToPath(new URL('../', import.meta.url));
const visual = [
  'album-artwork',
  'album-cover-motion',
  'practice-layout',
  'practice-ribbons',
  'practice-stage',
  'game-viewport',
  'menu-viewport',
  'menu-motion',
  'note-overlap',
];
const performance = [
  'special-performance',
  'long-hold-performance',
  'full-playback',
  'menu-music-repeat',
];
const patterns = (names: string[]) => names.map((name) => `**/${name}.spec.ts`);
export function testConfig(suite: 'regression' | 'visual' | 'performance') {
  const testServerToken = randomUUID();
  return defineConfig({
    metadata: { testServerToken },
    testDir: testRoot,
    testMatch:
      suite === 'regression' ? '**/*.spec.ts' : patterns(suite === 'visual' ? visual : performance),
    testIgnore: suite === 'regression' ? patterns([...visual, ...performance, 'song-packs']) : [],
    timeout: 60000,
    fullyParallel: false,
    workers: 1,
    reporter: [
      ['list'],
      ['html', { open: 'never', outputFolder: root + `artifacts/test-reports/${suite}` }],
    ],
    outputDir: root + `artifacts/test-results/${suite}`,
    globalTeardown: fileURLToPath(new URL('./stop-server.ts', import.meta.url)),
    use: {
      baseURL: 'http://127.0.0.1:4180',
      channel: 'chrome',
      viewport: { width: 1920, height: 1080 },
      actionTimeout: 8000,
      trace: suite === 'performance' ? 'off' : 'retain-on-failure',
      screenshot: 'only-on-failure',
    },
    webServer: {
      command: 'node scripts/test-server.mjs',
      cwd: root,
      env: {
        WFP_MAPS_DIR: `artifacts/test-maps/${testServerToken}`,
        WFP_TEST_TOKEN: testServerToken,
        WFP_TEST_ENDURANCE: suite === 'performance' ? '1' : '0',
      },
      url: 'http://127.0.0.1:4180',
      reuseExistingServer: false,
      timeout: 30000,
    },
  });
}
