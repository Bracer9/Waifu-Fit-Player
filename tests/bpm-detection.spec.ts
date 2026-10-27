import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Chart } from '../src/model';
import { importDemo } from './helpers/project';

test('ambiguous detections keep existing values until a candidate is selected and clear on target changes', async ({
  page,
}) => {
  await page.route('**/bpm.worker*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `self.onmessage = ({ data }) => self.postMessage({ candidates: data.firstBeatBpm === undefined ? { kind: 'bpm', values: [134.1, 67, 89.3] } : { kind: 'first-beat', values: [125, 1800] } });`,
    }),
  );
  await page.goto('/');
  await importDemo(page);
  const chart = await exported(page);
  chart.tempoSegments[0].bpm = 100;
  chart.tempoSegments[0].anchorMs = 5000;
  chart.tempoSegments.push({ id: 'next', anchorMs: 20000, bpm: 110, meter: '4/4' });
  await page
    .getByLabel('导入谱面文件')
    .setInputFiles({
      name: 'candidates.wfp.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(chart)),
    });
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  const bpm = page.getByLabel('BPM', { exact: true });
  const offset = page.getByLabel('本段 Offset / ms', { exact: true });
  const detect = page.getByRole('button', { name: '自动检测 BPM', exact: true });
  const choices = page.getByRole('group', { name: 'BPM 检测候选', exact: true });
  await detect.click();
  await expect(choices).toBeVisible();
  await expect(bpm).toHaveValue('100');
  await expect(choices.getByRole('button', { name: /^采用/ })).toHaveCount(3);
  await page.screenshot({ path: 'artifacts/bpm-candidates-light.png' });
  await choices.getByRole('button', { name: '采用 134.1 BPM', exact: true }).click();
  await expect(bpm).toHaveValue('134.1');
  expect((await exported(page)).notes).toEqual(chart.notes);
  await page.getByRole('button', { name: /撤销/ }).click();
  await expect(bpm).toHaveValue('100');
  await detect.click();
  await choices.getByRole('button', { name: '收起检测候选', exact: true }).click();
  await expect(bpm).toHaveValue('100');
  await page.getByRole('button', { name: '自动检测第一拍', exact: true }).click();
  const origins = page.getByRole('group', { name: '第一拍检测候选', exact: true });
  await expect(origins).toBeVisible();
  await expect(offset).toHaveValue('5000');
  await page.getByRole('button', { name: '切换日夜主题', exact: true }).click();
  await page.screenshot({ path: 'artifacts/first-beat-candidates-dark.png' });
  await origins.getByRole('button', { name: '采用 1.800 s', exact: true }).click();
  await expect(offset).toHaveValue('1800');
  const after = await exported(page);
  expect(after.notes).toEqual(chart.notes);
  expect(after.tempoSegments[1]).toEqual(chart.tempoSegments[1]);
  await detect.click();
  await expect(choices).toBeVisible();
  await page.getByLabel('当前编辑段').selectOption('next');
  await expect(page.locator('.bpm-candidates')).toHaveCount(0);
  await expect(bpm).toHaveValue('110');
});

async function selectVideo(page: Page, name: string, file: string) {
  const previous = await page.locator('video').getAttribute('src');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name, exact: true }).click();
  await (await chooser).setFiles(`tests/fixtures/${file}`);
  if (previous) await expect(page.locator('video')).not.toHaveAttribute('src', previous);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
}

async function exported(page: Page): Promise<Chart> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}

test('从真实 MP4 音轨检测并填入本段 BPM，可撤销且不改变视频位置与动作时间', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }),
  );
  await page.goto('/');
  await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
  await page.getByRole('button', { name: /创作模式/ }).click();
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  const detect = page.getByRole('button', { name: '自动检测 BPM', exact: true });
  await expect(detect).toBeDisabled();
  await selectVideo(page, '新建', 'bpm-148.mp4');
  const prepared = await exported(page);
  prepared.tempoSegments[0].bpm = 100;
  prepared.videoOffsetMs = 350;
  prepared.tempoSegments.push({ id: 'later', anchorMs: 14000, bpm: 110, meter: '4/4' });
  prepared.notes = [
    { id: 'keep-time', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 3200 },
  ];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'bpm-check.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(prepared)),
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  const bpm = page.getByRole('spinbutton', { name: 'BPM', exact: true });
  await bpm.fill('100');
  await bpm.press('Enter');
  const video = page.locator('video');
  await video.evaluate((node: HTMLVideoElement) => {
    node.currentTime = 3;
    node.volume = 0;
  });
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.seeking)).toBe(false);
  const before = await exported(page);
  await detect.click();
  await expect
    .poll(async () => Number(await bpm.inputValue()), { timeout: 20000 })
    .toBeCloseTo(148, 0);
  await expect(detect).toBeEnabled();
  expect(
    await video.evaluate((node: HTMLVideoElement) => [node.currentTime, node.paused, node.volume]),
  ).toEqual([3, true, 0]);
  const after = await exported(page);
  expect(after.notes).toEqual(before.notes);
  expect(after.videoOffsetMs).toBe(before.videoOffsetMs);
  expect(after.tempoSegments[1]).toEqual(before.tempoSegments[1]);
  expect(after.tempoSegments.map((segment) => segment.anchorMs)).toEqual(
    before.tempoSegments.map((segment) => segment.anchorMs),
  );
  await page.getByRole('button', { name: /撤销/ }).click();
  await expect(bpm).toHaveValue('100');
  await page.getByRole('button', { name: '切换日夜主题', exact: true }).click();
  await page.screenshot({ path: 'artifacts/bpm-detection-dark-1080p.png' });

  // A video without audio is valid for editing, but must not replace a manual BPM.
  await selectVideo(page, '更换视频', 'no-audio.mp4');
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  const original = await bpm.inputValue();
  await detect.click();
  await expect(page.getByRole('status')).toContainText('没有音轨');
  await expect(detect).toBeEnabled();
  await expect(bpm).toHaveValue(original);
  expect(errors).toEqual([]);
});

test('检测期间切换节拍段会终止后台任务，不会把旧结果填到新段', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
    const terminate = Worker.prototype.terminate;
    Worker.prototype.terminate = function () {
      document.documentElement.dataset.workerTerminated = 'true';
      terminate.call(this);
    };
  });
  await page.goto('/');
  await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
  await page.getByRole('button', { name: /创作模式/ }).click();
  await selectVideo(page, '新建', 'bpm-148.mp4');
  const chart = await exported(page);
  chart.tempoSegments.push({ id: 'next', anchorMs: 10000, bpm: 110, meter: '4/4' });
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'segments.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/bpm.worker*', async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  const detect = page.getByRole('button', { name: '自动检测 BPM', exact: true });
  try {
    await detect.click();
    await expect(detect).toHaveAttribute('aria-busy', 'true');
    await page.getByLabel('当前编辑段').selectOption('next');
    await expect(page.locator('html')).toHaveAttribute('data-worker-terminated', 'true');
    await expect(detect).toBeEnabled();
    await expect(page.getByRole('spinbutton', { name: 'BPM', exact: true })).toHaveValue('110');
  } finally {
    release();
  }
});
