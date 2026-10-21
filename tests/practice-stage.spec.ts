import { expect, test } from '@playwright/test';
import { blankChart } from '../src/model';
import { importDemo } from './helpers/project';

test('stage artwork, track metadata and shared keyboard/mouse pause controls at 1080p', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const chart = blankChart();
  chart.title = 'Happy Halloween';
  chart.chartType = 'fitness';
  chart.intensity = 'medium';
  chart.notes = [
    { id: 'resume-cue', kind: 'tap', lane: 'squat', direction: 'down', timeMs: 14500 },
  ];
  chart.tempoSegments = [
    { id: 'first', anchorMs: 0, bpm: 120, meter: '4/4' },
    { id: 'second', anchorMs: 20000, bpm: 148, meter: '4/4' },
  ];
  await importDemo(page, chart);
  const video = page.locator('video');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('12500');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByRole('button', { name: '用当前视频画面', exact: true }).click();
  const cover = await page.locator('.draft-cover img').getAttribute('src');
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();

  const header = page.locator('.practice-masthead');
  await expect(header.getByRole('heading', { name: chart.title, exact: true })).toBeVisible();
  await expect(header.locator('.practice-song-cover img')).toHaveAttribute('src', cover!);
  await expect(header.locator('.track-status')).toHaveText('NOW PLAYING');
  await expect(header.locator('.practice-chart-type')).toHaveText('FITNESSINT. MEDIUM');
  await expect(header.locator('.practice-bpm')).toHaveText('BPM120');
  await expect(header).not.toContainText('TIME');
  await expect(page.locator('.return-workspace')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'EDIT IN STUDIO', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'SELECT MUSIC', exact: true })).toHaveCount(0);
  expect(
    await page
      .locator('.studio-scene')
      .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    12.5,
    true,
  ]);

  await page.screenshot({ path: 'artifacts/practice-stage-1080p.png' });
  const pause = page.getByRole('button', { name: '暂停游戏', exact: true });
  const dialog = page.getByRole('dialog', { name: 'PAUSED', exact: true });
  const back = dialog.getByRole('button', { name: 'BACK TO SELECT', exact: true });
  const restart = dialog.getByRole('button', { name: 'RESTART', exact: true });
  const countdown = page.getByRole('dialog', { name: '开始倒计时', exact: true });
  const room = page.locator('.album-workspace.practice');
  await pause.hover();
  await expect(pause.locator('.practice-pause-glyph')).toHaveCSS(
    'background-color',
    'rgb(246, 78, 147)',
  );
  await pause.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(page.locator('.practice-pause')).toHaveClass(/is-pressed/);
  await expect(back).toHaveAttribute('data-selected', 'true');
  await expect(dialog.locator('.pause-option')).toHaveText([
    'BACK TO SELECT',
    'RESTART',
    'EDIT IN STUDIO',
  ]);
  await expect(dialog.getByRole('button', { name: 'RESUME', exact: true })).toHaveCount(0);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect(page.locator('.practice-pause-overlay')).toHaveCSS(
    'background-color',
    'rgba(7, 9, 20, 0.65)',
  );
  await expect(room).toHaveAttribute('data-paused');
  await expect(page.locator('.ready-room-shade')).toHaveCSS('opacity', '0.38');
  await expect(page.locator('.ready-lamp-cap')).toHaveCSS('opacity', '0.9');
  await page.screenshot({ path: 'artifacts/practice-paused-1080p.png' });
  await page.keyboard.press('ArrowDown');
  await expect(restart).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(back).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(countdown).toHaveAttribute('data-resuming');
  await expect(countdown.getByRole('timer')).toHaveText('3');
  await expect(page.locator('[data-note-id="resume-cue"]')).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    12.5,
    true,
  ]);
  await expect(room).not.toHaveAttribute('data-paused');
  await expect(page.locator('.ready-lamp-cap')).toHaveCSS('opacity', '0');
  await expect(page.locator('.ready-room-shade')).toHaveCSS('opacity', '0');
  await expect(countdown).toHaveCount(0);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect(page.locator('.studio-startup-lighting')).toHaveCount(0);
  await pause.click();
  await expect(dialog).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(countdown).toBeVisible();
  await expect(countdown).toHaveCount(0);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(dialog).toBeVisible();
  await restart.hover();
  await expect(restart).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(back).toHaveAttribute('data-selected', 'true');
  await expect(restart).toHaveAttribute('data-selected', 'false');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(countdown).toBeVisible();
  const heldTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.keyboard.press('Backspace');
  await expect(dialog).toBeVisible();
  await expect(countdown).toHaveCount(0);
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    heldTime,
    true,
  ]);
  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  await expect(countdown).toHaveCount(0);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.keyboard.press('Backspace');
  await expect(dialog).toHaveCount(0);
  await expect(countdown).toBeVisible();
  await expect(countdown).toHaveCount(0);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('21000');
  await expect(header.locator('.practice-bpm')).toHaveText('BPM148');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1920);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(1080);
  for (const part of await header
    .locator(
      '.practice-song-cover, .track-status, h1, .practice-chart-type, .practice-bpm, .practice-pause',
    )
    .all()) {
    await expect(part).toBeVisible();
    const box = (await part.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1920);
  }
  expect(errors).toEqual([]);
});
