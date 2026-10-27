import { holdStart } from './helpers/project';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Chart } from '../src/model';

test('restart replays the countdown at the range start, while seeking only changes playback position', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
    if (localStorage.getItem('waifu-fit-player-se-volume') === null)
      localStorage.setItem('waifu-fit-player-se-volume', '0.3');
    const events: { name: string; volume: number }[] = [];
    const played: string[] = [];
    Object.assign(window, { pauseSoundEvents: events, pauseSoundsPlayed: played });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.menuSound)
        events.push({ name: this.dataset.menuSound, volume: this.volume });
      const result = play.call(this);
      if (this.dataset.menuSound)
        void result.then(() => played.push(this.dataset.menuSound!)).catch(() => {});
      return result;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /创作模式/ }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await chooser).setFiles('tests/fixtures/bpm-148.mp4');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const chart: Chart = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  chart.title = 'Pause range check';
  chart.chartType = 'fitness';
  chart.danceDifficulty = 3;
  chart.playRange = { startMs: 3000, endMs: 18000 };
  chart.notes = [{ id: 'first', kind: 'tap', lane: 'squat', direction: 'down', timeMs: 4000 }];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'pause.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await page.evaluate(() => {
    const state = window as unknown as { pauseSoundEvents: unknown[]; pauseSoundsPlayed: string[] };
    state.pauseSoundEvents.length = 0;
    state.pauseSoundsPlayed.length = 0;
  });
  const video = page.locator('video');
  const originalVideo = (await video.elementHandle())!;
  const seek = page.getByRole('slider', { name: 'Playback position', exact: true });
  await seek.fill('12000');
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeEnabled();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog', { name: 'PAUSED', exact: true });
  await expect(dialog).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    12,
    true,
  ]);
  // Let each isolated gesture become audible before testing rapid navigation;
  // the shared sound player intentionally interrupts the previous short clip.
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { pauseSoundsPlayed: string[] }).pauseSoundsPlayed),
    )
    .toEqual(['settings']);
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { pauseSoundsPlayed: string[] }).pauseSoundsPlayed),
    )
    .toEqual(['settings', 'settings']);
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  const countdown = page.getByRole('dialog', { name: '开始倒计时', exact: true });
  await expect(countdown).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    3,
    true,
  ]);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(seek).toBeDisabled();
  await expect(countdown.getByRole('timer')).toHaveText('3');
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect(countdown).toHaveCount(0);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  expect(await originalVideo.evaluate((v) => v.isConnected)).toBe(true);
  const soundEvents = () =>
    page.evaluate(
      () =>
        (window as unknown as { pauseSoundEvents: { name: string; volume: number }[] })
          .pauseSoundEvents,
    );
  expect((await soundEvents()).map((event) => event.name)).toEqual([
    'settings',
    'settings',
    'song',
    'settings',
    'settings',
    'settings',
    'mode',
  ]);

  // Dragging to the start keeps playback running and must not recreate the countdown.
  await seek.fill('3000');
  await expect(countdown).toHaveCount(0);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(3.1);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);

  await seek.fill('10000');
  // Space is media transport even when the full-pause button retains focus.
  await page.getByRole('button', { name: '暂停游戏', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect(dialog).toHaveCount(0);
  await expect(countdown).toHaveCount(0);
  await expect(page.locator('.album-workspace')).not.toHaveAttribute('data-paused');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.keyboard.down('Space');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  // Holding Space must not repeatedly toggle playback.
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect(dialog).toHaveCount(0);
  await expect(countdown).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  const pausedAt = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(countdown).toHaveAttribute('data-resuming');
  await expect(countdown.getByRole('timer')).toHaveText('3');
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    pausedAt,
    true,
  ]);
  await expect(countdown).toHaveCount(0);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.keyboard.press('Backspace');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'RESTART', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(countdown).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    3,
    true,
  ]);
  await expect(countdown).toHaveCount(0);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window as unknown as {
          pauseSoundsPlayed: string[];
          pauseSoundEvents: unknown[];
        };
        return state.pauseSoundsPlayed.length === state.pauseSoundEvents.length;
      }),
    )
    .toBe(true);
  await expect(dialog.getByRole('button', { name: 'BACK TO SELECT', exact: true })).toHaveAttribute(
    'data-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  const card = page.locator('.record-card[aria-current="true"]');
  await expect(card).toContainText(chart.title);
  await expect(page.getByRole('button', { name: /FITNESS/, pressed: true })).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  expect(await originalVideo.evaluate((v) => v.isConnected)).toBe(true);
  const expectedSounds = [
    'settings',
    'settings',
    'song',
    'settings',
    'settings',
    'settings',
    'mode',
    'settings',
    'mode',
    'settings',
    'settings',
    'settings',
    'mode',
    'settings',
    'settings',
    'song',
    'settings',
    'settings',
    'settings',
    'mode',
    'settings',
    'back',
  ];
  expect((await soundEvents()).map((event) => event.name)).toEqual(expectedSounds);
  expect((await soundEvents()).every((event) => Math.abs(event.volume - 0.3) < 0.001)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { pauseSoundsPlayed: string[] }).pauseSoundsPlayed),
    )
    .toEqual(expectedSounds);

  await card.locator('.record-select').click();
  await holdStart(page);
  await expect(page.getByRole('dialog', { name: '开始倒计时', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog', { name: '开始倒计时', exact: true })).toHaveCount(0);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await dialog.getByRole('button', { name: 'BACK TO SELECT', exact: true }).click();
  await expect(card).toContainText(chart.title);
  await page.evaluate(() => localStorage.setItem('waifu-fit-player-se-volume', '0'));
  await page.reload();
  await page.getByRole('button', { name: /创作模式/ }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(countdown).toBeVisible();
  await expect(countdown).toHaveCount(0);
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await soundEvents()).toEqual([]);
  expect(errors).toEqual([]);
});
