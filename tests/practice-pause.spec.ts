import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Chart } from '../src/model';

test('restart uses the play-range start, return restores song selection, and countdown stays separate', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
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
  chart.difficulty = 'normal';
  chart.difficultyRating = 3;
  chart.playRange = { startMs: 3000, endMs: 18000 };
  chart.notes = [{ id: 'first', kind: 'tap', lane: 'squat', direction: 'down', timeMs: 4000 }];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'pause.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('touhou');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  const video = page.locator('video');
  const originalVideo = (await video.elementHandle())!;
  const seek = page.getByRole('slider', { name: 'Playback position', exact: true });
  await seek.fill('12000');
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog', { name: 'PAUSED', exact: true });
  await expect(dialog).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    12,
    true,
  ]);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThanOrEqual(3);
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime < 4, v.paused])).toEqual([
    true,
    false,
  ]);
  expect(await originalVideo.evaluate((v) => v.isConnected)).toBe(true);

  await seek.fill('10000');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(10);
  await page.keyboard.press('Backspace');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'RESTART', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(4);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowUp');
  await expect(dialog.getByRole('button', { name: 'BACK TO SELECT', exact: true })).toHaveAttribute(
    'data-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  const card = page.locator('.record-card[aria-current="true"]');
  await expect(card).toContainText(chart.title);
  await expect(page.getByRole('button', { name: /NORMAL/, pressed: true })).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  expect(await originalVideo.evaluate((v) => v.isConnected)).toBe(true);

  await card.locator('.record-select').click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
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
  expect(errors).toEqual([]);
});
