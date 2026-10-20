import { expect, test, type Page } from '@playwright/test';

type BgmProbe = { tracks: HTMLAudioElement[]; revoked: string[] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('waifu-menu-track', 'Sparkling Future Pop.mp3');
    localStorage.setItem('waifu-menu-order', 'list');
    const probe: BgmProbe = { tracks: [], revoked: [] };
    Object.assign(window, { bgmProbe: probe });
    const Native = window.Audio;
    window.Audio = class extends Native {
      constructor() {
        super();
        probe.tracks.push(this);
      }
    };
    const revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => {
      probe.revoked.push(url);
      revoke.call(URL, url);
    };
  });
});

const audio = (page: Page) =>
  page.evaluate(() => {
    const probe = (window as unknown as { bgmProbe: BgmProbe }).bgmProbe;
    const bgm = probe.tracks[0];
    return {
      paused: bgm.paused,
      time: bgm.currentTime,
      duration: bgm.duration,
      src: bgm.getAttribute('src'),
      error: bgm.error?.message,
      revoked: probe.revoked,
      selected: localStorage.getItem('waifu-menu-track'),
      playing: probe.tracks.filter((track) => !track.paused).length,
    };
  });

async function finishPop(page: Page) {
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.headphone-button').click();
  await expect.poll(async () => (await audio(page)).paused).toBe(false);
  await expect.poll(async () => (await audio(page)).duration).toBeGreaterThan(180);
  await page.evaluate(() => {
    const bgm = (window as unknown as { bgmProbe: BgmProbe }).bgmProbe.tracks[0];
    bgm.currentTime = bgm.duration - 0.12;
  });
}

test('sequential MP3 → M4A recovers one empty range response without stopping or showing an error', async ({
  page,
}) => {
  const requests: { url: string; range?: string; cache?: string }[] = [];
  await page.route('**/*Sparkling*Pop2*.m4a*', async (route) => {
    requests.push({
      url: route.request().url(),
      range: route.request().headers().range,
      cache: route.request().headers()['cache-control'],
    });
    if (requests.length === 1) await route.fulfill({ status: 204 });
    else await route.continue();
  });
  await finishPop(page);
  await expect.poll(async () => (await audio(page)).selected).toBe('Sparkling Future Pop2.m4a');
  await expect
    .poll(async () => {
      const state = await audio(page);
      return !state.paused && state.duration > 182 && state.duration < 183 && state.time > 0.15;
    })
    .toBe(true);
  expect(requests).toHaveLength(2);
  expect(requests[0].range).toBe('bytes=0-');
  expect(requests[1].range).toBe('bytes=0-');
  expect(requests[1].url).toContain('?bgm-retry=');
  const state = await audio(page);
  expect(state.playing).toBe(1);
  expect(state.error).toBeUndefined();
  expect(state.src).toMatch(/^blob:/);
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('failed download can be retried by selecting the same track, without reloading the page', async ({
  page,
}) => {
  let unavailable = true;
  await page.route('**/*Sparkling*Pop2*.m4a*', (route) =>
    unavailable ? route.fulfill({ status: 503 }) : route.continue(),
  );
  await finishPop(page);
  await expect(page.locator('.toast')).toContainText('菜单音乐加载失败');
  const before = await audio(page);
  expect(before.selected).toBe('Sparkling Future Pop2.m4a');
  expect(before.paused).toBe(true);
  // Keep the last good compressed source alive until the replacement succeeds.
  expect(before.revoked).not.toContain(before.src);
  unavailable = false;
  await page
    .locator('.theme-track')
    .filter({ hasText: /Sparkling Future Pop2$/ })
    .click();
  await expect.poll(async () => (await audio(page)).duration).toBeCloseTo(182.7665, 2);
  await expect.poll(async () => (await audio(page)).time).toBeGreaterThan(0.15);
  const after = await audio(page);
  expect(after.paused).toBe(false);
  expect(after.error).toBeUndefined();
  expect(after.revoked).toContain(before.src);
});
