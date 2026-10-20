import { expect, test } from '@playwright/test';

test('BGM console arrows and Enter operate playback, tracks, modes, mute and confirmed volume', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('waifu-menu-volume', '0.5');
    localStorage.setItem('waifu-menu-order', 'list');
    const NativeAudio = window.Audio;
    Object.assign(window, { keyboardBgmAudio: [] });
    window.Audio = class extends NativeAudio {
      constructor() {
        super();
        (window as unknown as { keyboardBgmAudio: HTMLAudioElement[] }).keyboardBgmAudio.push(this);
      }
    };
  });
  await page.goto('/');
  await page.mouse.move(10, 10);
  const headphone = page.getByRole('button', { name: '选择主界面 BGM' });
  const panel = page.getByRole('region', { name: '主界面音乐' });
  const volume = panel.getByRole('slider', { name: '菜单 BGM 音量' });
  const mute = panel.locator('.music-mute-toggle');
  await expect(headphone).toBeVisible();
  const focused = async (id: string) => {
    const node = panel.locator(`[data-music-control="${id}"]`);
    await expect(node).toBeFocused();
    await expect(node).toHaveAttribute('data-music-highlighted', '');
    await expect(panel.locator('[data-music-highlighted]')).toHaveCount(1);
    await expect(node).toHaveCSS('outline-style', 'solid');
  };
  const audio = () =>
    page.evaluate(() => {
      const bgm = (window as unknown as { keyboardBgmAudio: HTMLAudioElement[] })
        .keyboardBgmAudio[0];
      return { paused: bgm.paused, volume: bgm.volume, time: bgm.currentTime };
    });
  await page.keyboard.press('ArrowDown');
  await focused('track-0');
  await expect.poll(async () => (await audio()).paused).toBe(false);
  await expect(headphone).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.play-mode')).toBeFocused();
  await expect(panel).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await focused('track-0');
  await page.keyboard.press('ArrowLeft');
  await focused('play');
  await page.keyboard.press('ArrowDown');
  await expect(headphone).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(headphone).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowUp');
  const trackCount = await panel.locator('.theme-track').count();
  await focused(`track-${trackCount - 1}`);
  for (let index = trackCount - 2; index >= 0; index--) {
    await page.keyboard.press('ArrowUp');
    await focused(`track-${index}`);
  }
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.play-mode')).toBeFocused();
  await expect(panel).toBeVisible();
  await expect(headphone).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown');
  await focused('track-0');
  for (const id of ['play', 'order-2']) {
    await panel.locator(`[data-music-control="${id}"]`).focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.play-mode')).toBeFocused();
    await expect(panel).toBeVisible();
    await expect(headphone).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowDown');
    await focused('track-0');
  }
  await page.keyboard.press('ArrowLeft');
  await focused('play');
  await expect.poll(async () => (await audio()).paused).toBe(false);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await audio()).paused).toBe(true);
  await page.keyboard.press('ArrowRight');
  const initialTrack = await panel.locator('.theme-track:focus').getAttribute('data-music-control');
  expect(initialTrack).not.toBeNull();
  await page.keyboard.press('ArrowDown');
  await focused('track-1');
  await page.keyboard.press('Enter');
  await expect(panel.locator('.theme-track').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.music-now-title')).toHaveText(
    await panel.locator('.theme-track').nth(1).locator('span').innerText(),
  );
  await expect.poll(async () => (await audio()).paused).toBe(false);
  await page.keyboard.press('ArrowRight');
  await focused('order-2');
  await page.keyboard.press('ArrowLeft');
  await focused('order-1');
  await expect(panel.locator('[data-music-control="order-1"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.keyboard.press('Enter');
  await expect(panel.locator('[data-music-control="order-1"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('ArrowDown');
  await focused('volume');
  await expect(volume).toHaveAttribute('data-adjusting', '');
  await page.keyboard.press('ArrowLeft');
  await expect(volume).toHaveValue('0.45');
  await expect.poll(async () => (await audio()).volume).toBe(0.45);
  await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveValue('0.5');
  await page.keyboard.press('Enter');
  await expect(volume).not.toHaveAttribute('data-adjusting');
  await page.keyboard.press('ArrowLeft');
  await focused('mute');
  await page.keyboard.press('Enter');
  await expect(volume).toHaveValue('0');
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect(mute.locator('.lucide-volume-x')).toHaveCount(1);
  await expect(page.locator('.headphone-pin-rays')).toHaveAttribute('data-muted', '');
  await page.keyboard.press('Enter');
  await expect(volume).toHaveValue('0.5');
  await page.keyboard.press('ArrowRight');
  await focused('volume');
  await page.keyboard.press('ArrowUp');
  await focused('order-1');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await focused('track-1');
  await page.keyboard.press('ArrowLeft');
  await focused('play');
  await page.keyboard.press('ArrowDown');
  await expect(headphone).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await focused('play');
  // The pointer takes over one internal highlight; a stationary hover does not reclaim it.
  await panel.locator('[data-music-control="order-0"]').hover();
  await focused('order-0');
  await page.keyboard.press('ArrowRight');
  await focused('order-1');
  await expect(panel.locator('[data-music-control="order-0"]')).not.toHaveAttribute(
    'data-music-highlighted',
  );
  await page.screenshot({ path: 'artifacts/bgm-console-keyboard-1080p.png' });
  // A pinned panel stays open when the pointer returns to the main cards, without keeping focus.
  await page.locator('.create-mode').hover();
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-music-highlighted]')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.menu-settings')).toBeFocused();
  await headphone.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Backspace');
  await expect(panel).toBeHidden();
  await expect(headphone).toBeFocused();
  // Reopening highlights the first track without changing the song already playing.
  await page.keyboard.press('ArrowDown');
  await expect(panel).toBeVisible();
  await focused('track-0');
  await expect(panel.locator('.theme-track').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await focused('volume');
  await volume.fill('0.02');
  await page.keyboard.press('ArrowLeft');
  await expect(volume).toHaveValue('0');
  await page.keyboard.press('ArrowLeft');
  await expect(volume).toBeFocused();
  await expect(volume).toHaveValue('0');
  await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveValue('0.05');
  await volume.fill('0.99');
  await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveValue('1');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => localStorage.getItem('waifu-menu-volume'))).toBe('1');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});
