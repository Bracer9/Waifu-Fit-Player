import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Chart, Note } from '../src/model';

test('真实全屏：音符保持单中心线和大尺寸，连续与重叠长条不覆盖动作标记', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByRole('button', { name: '体验示例作品', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const video = page.locator('video');
  const seek = async (seconds: number) => {
    await video.evaluate((v: HTMLVideoElement, time) => {
      v.currentTime = time;
    }, seconds);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  };
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await seek(29.3);
  await page.screenshot({ path: 'artifacts/notes-demo-fullscreen-1920.png' });
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const chart: Chart = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  const hold = (
    id: string,
    lane: Note['lane'],
    direction: Note['direction'],
    timeMs: number,
    endTimeMs: number,
    modifier: 'none' | 'sway' = 'none',
  ): Note => ({ id, lane, direction, timeMs, endTimeMs, kind: 'hold', modifier });
  chart.title = 'DENSE NOTE CHECK';
  chart.specialEvents = [];
  chart.notes = [
    hold('squat-hold', 'squat', 'down', 2800, 7600),
    { id: 'squat-tap-1', lane: 'squat', direction: 'up', timeMs: 4000, kind: 'tap' },
    { id: 'squat-tap-2', lane: 'squat', direction: 'down', timeMs: 4600, kind: 'tap' },
    hold('calf-first', 'calf_raise', 'up', 3000, 5000),
    hold('calf-next', 'calf_raise', 'down', 5000, 7000),
    hold('punch-first', 'punch', 'left', 3000, 6500),
    hold('punch-overlap', 'punch', 'right', 4500, 7600),
    hold('step-first', 'step', 'right', 3000, 5000),
    hold('step-free', 'step', 'free', 5000, 7000, 'sway'),
    { id: 'step-next', lane: 'step', direction: 'left', timeMs: 7000, kind: 'tap' },
    hold('side-first', 'side_crunch', 'right', 3000, 5000, 'sway'),
    hold('side-next', 'side_crunch', 'left', 5000, 7000, 'sway'),
    hold('short', 'step', 'left', 8000, 8125),
    hold('free-sway', 'step', 'free', 9500, 12500, 'sway'),
  ];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'overlap.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title })).toBeVisible();
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  if (!(await page.evaluate(() => !!document.fullscreenElement)))
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await seek(3.35);
  const heads = page.locator('.practice .hold-head, .practice .player-note');
  for (const item of await heads.all()) {
    await expect(item).toHaveCSS('width', '52px');
    const position = await item.evaluate((el) => {
      const parent = el.parentElement!;
      return Math.abs(parseFloat(getComputedStyle(el).top) - parent.clientHeight / 2);
    });
    expect(position).toBeLessThan(1);
  }
  const first = page.locator('.player-hold[data-note-id="step-first"]');
  await expect(first.locator('.hold-tail')).toHaveCount(0);
  await expect(page.locator('.player-hold[data-note-id="step-free"] .hold-head')).toBeVisible();
  await expect(page.locator('.player-hold[data-note-id="squat-hold"] mask ellipse')).toHaveCount(2);
  await expect(page.locator('.practice .note-impact .note-glyph')).toHaveCount(0);
  const tail = page.locator('.player-hold[data-note-id="punch-overlap"] .hold-tail');
  await expect(tail).toHaveCSS('background-color', 'rgb(246, 78, 147)');
  expect(await tail.evaluate((el) => getComputedStyle(el, '::after').backgroundColor)).toBe(
    'rgb(250, 255, 255)',
  );
  await page.screenshot({ path: 'artifacts/notes-overlap-fullscreen-1920.png' });
  await page
    .locator('.lanes-stack')
    .screenshot({ path: 'artifacts/notes-overlap-tracks-1920.png' });
  await seek(4.4);
  await expect(page.getByTestId('target-punch')).toHaveCSS('opacity', '0');
  await expect(page.getByTestId('target-squat')).toHaveCSS('opacity', '0');
  await expect(tail).toHaveCSS('z-index', '2');
  await page.screenshot({ path: 'artifacts/notes-junction-fullscreen-1920.png' });
  await seek(5.04);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-direction', 'free');
  await expect(page.getByTestId('target-step').locator('.note-glyph')).toHaveCount(1);
  await expect(page.getByTestId('impact-step').locator('.note-glyph')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/notes-handoff-fullscreen-1920.png' });
  await seek(7.7);
  await page.screenshot({ path: 'artifacts/notes-short-fullscreen-1920.png' });
  await seek(10.2);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-action', 'FREE SWAY');
  await page.screenshot({ path: 'artifacts/notes-free-sway-fullscreen-1920.png' });
  await seek(3.35);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expect(heads.first()).toHaveCSS('width', '68px');
  await page.screenshot({ path: 'artifacts/notes-overlap-fullscreen-2560.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: 'artifacts/notes-overlap-fullscreen-1280.png' });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(4.2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(errors).toEqual([]);
});
