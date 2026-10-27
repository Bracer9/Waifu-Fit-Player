import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Chart } from '../src/model';

async function exported(page: Page): Promise<Chart> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}

async function scratch(page: Page) {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }),
  );
  await page.goto('/');
  await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
  await page.locator('.create-mode').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: `first-beat-${randomUUID()}.mp4`,
    mimeType: 'video/mp4',
    buffer: await readFile('tests/fixtures/bpm-148.mp4'),
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const chart = await exported(page);
  chart.videoOffsetMs = 350;
  chart.tempoSegments[0].bpm = 148;
  chart.tempoSegments[0].anchorMs = 5000;
  chart.tempoSegments.push({ id: 'later', anchorMs: 14000, bpm: 110, meter: '4/4' });
  chart.notes = [{ id: 'keep', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 3200 }];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'first-beat-scratch.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  return chart;
}

test('first-beat detection changes only the active anchor, preserves notes and video, and supports undo', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await scratch(page);
  const video = page.locator('video');
  await video.evaluate((node: HTMLVideoElement) => {
    node.currentTime = 3;
    node.volume = 0;
  });
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.seeking)).toBe(false);
  const before = await exported(page);
  const detect = page.getByRole('button', { name: '自动检测第一拍', exact: true });
  await detect.click();
  await expect(page.getByRole('status')).toContainText('第一拍候选', { timeout: 20000 });
  const after = await exported(page);
  expect(after.tempoSegments[0].anchorMs).toBeLessThan(1000);
  expect(after.tempoSegments[0].anchorMs).toBeGreaterThanOrEqual(350);
  expect(after.tempoSegments[0].bpm).toBe(148);
  expect(after.tempoSegments[1]).toEqual(before.tempoSegments[1]);
  expect(after.notes).toEqual(before.notes);
  expect(after.videoOffsetMs).toBe(350);
  expect(
    await video.evaluate((node: HTMLVideoElement) => [node.currentTime, node.paused, node.volume]),
  ).toEqual([3, true, 0]);
  await page.screenshot({ path: 'artifacts/first-beat-2026-10-23/editor.png' });
  await page.getByRole('button', { name: /撤销/ }).click();
  expect((await exported(page)).tempoSegments[0].anchorMs).toBe(5000);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '更换视频', exact: true }).click();
  await (await chooser).setFiles('tests/fixtures/no-audio.mp4');
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  const saved = (await exported(page)).tempoSegments[0].anchorMs;
  await detect.click();
  await expect(page.getByRole('status')).toContainText('没有音轨');
  expect((await exported(page)).tempoSegments[0].anchorMs).toBe(saved);
  expect(errors).toEqual([]);
});

test('changing the target segment cancels first-beat detection without applying a stale result', async ({
  page,
}) => {
  await scratch(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/bpm.worker*', async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  const detect = page.getByRole('button', { name: '自动检测第一拍', exact: true });
  try {
    await detect.click();
    await expect(detect).toHaveAttribute('aria-busy', 'true');
    await page.getByLabel('当前编辑段').selectOption('later');
    await expect(detect).toHaveAttribute('aria-busy', 'false');
    expect((await exported(page)).tempoSegments[1].anchorMs).toBe(14000);
  } finally {
    release();
  }
});

test('manual two-beat correction shifts only the current grid anchor, supports undo and respects boundaries', async ({
  page,
}) => {
  await scratch(page);
  await page.getByLabel('BPM', { exact: true }).fill('95');
  await page.getByLabel('BPM', { exact: true }).press('Tab');
  const before = await exported(page);
  const earlier = page.getByRole('button', { name: '提前两拍', exact: true });
  const later = page.getByRole('button', { name: '延后两拍', exact: true });
  await earlier.click();
  let after = await exported(page);
  expect(after.tempoSegments[0].anchorMs).toBe(Math.round(5000 - 120000 / 95));
  expect(after.notes).toEqual(before.notes);
  expect(after.videoOffsetMs).toBe(before.videoOffsetMs);
  expect(after.tempoSegments[1]).toEqual(before.tempoSegments[1]);
  await page.getByRole('button', { name: /撤销/ }).click();
  expect((await exported(page)).tempoSegments).toEqual(before.tempoSegments);
  await later.click();
  after = await exported(page);
  expect(after.tempoSegments[0].anchorMs).toBe(Math.round(5000 + 120000 / 95));
  expect(after.notes).toEqual(before.notes);
  await page.getByLabel('本段 Offset / ms', { exact: true }).fill('0');
  await page.getByLabel('本段 Offset / ms', { exact: true }).press('Tab');
  await expect(earlier).toBeDisabled();
  await expect(later).toBeEnabled();
  await page.getByLabel('本段 Offset / ms', { exact: true }).fill('1000');
  await page.getByLabel('本段 Offset / ms', { exact: true }).press('Tab');
  await page.getByLabel('当前编辑段').selectOption('later');
  await page.getByLabel('本段 Offset / ms', { exact: true }).fill('1400');
  await page.getByLabel('本段 Offset / ms', { exact: true }).press('Tab');
  await expect(earlier).toBeDisabled();
  await page.screenshot({ path: 'artifacts/offset-two-beat-correction.png' });
});
