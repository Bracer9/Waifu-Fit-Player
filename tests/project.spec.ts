import { TEST_VIDEO } from './helpers/test-media';
import { openDemo, editInStudio } from './helpers/project';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blankChart, type Chart } from '../src/model';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', {
      value: undefined,
      writable: true,
      configurable: true,
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /创作模式/ }).click();
});
async function open(page: Page, chart: Chart) {
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'project.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
}
async function exported(page: Page): Promise<Chart> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}
async function ready(page: Page, title: string) {
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
}
async function selectVideo(page: Page, button: string, path = TEST_VIDEO) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await chooser).setFiles(path);
}
async function note(page: Page) {
  await page.locator('.timeline-surface').click({ position: { x: 224, y: 57 } });
}

test('保存作品后刷新再打开，自动恢复真实视频；同名但不同关联不能误配 @smoke', async ({ page }) => {
  await selectVideo(page, '新建');
  await ready(page, 'demo');
  await note(page);
  const chart = await exported(page);
  expect(chart.videoHint.assetId).toMatch(/^[a-f0-9-]{36}$/);
  expect(chart.notes).toHaveLength(1);
  await page.reload();
  await open(page, chart);
  await ready(page, 'demo');
  expect(await exported(page)).toEqual(chart);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.3);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.screenshot({ path: 'artifacts/project-reopened.png', fullPage: true });
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await open(page, { ...chart, title: '共用视频的另一份谱面', notes: [] });
  await ready(page, '共用视频的另一份谱面');
  await expect(page.getByRole('button', { name: '启用按键录谱', exact: true })).toBeVisible();
  await expect(page.getByTestId('editor-note')).toHaveCount(0);
  await open(page, chart);
  await ready(page, 'demo');
  const unrelated = {
    ...chart,
    title: '同名文件的另一个作品',
    videoHint: { ...chart.videoHint, assetId: '52b3c19d-4929-4228-89d7-fbd504276008' },
  };
  await open(page, unrelated);
  await expect(page.getByRole('dialog')).toContainText('当前浏览器没有此作品的视频关联');
  await page.getByRole('button', { name: '取消打开', exact: true }).click();
  await ready(page, 'demo');
  expect(await exported(page)).toEqual(chart);
});

test('旧谱一次定位后保存关联，失败与取消保留当前作品，全屏也能定位', async ({ page }) => {
  await openDemo(page);
  await editInStudio(page);
  const original = await exported(page);
  const legacy = blankChart('旧版作品');
  legacy.videoHint = { fileName: 'demo.mp4', durationMs: original.videoHint.durationMs };

  await open(page, legacy);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('这份旧作品还没有保存视频关联');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择对应视频', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a movie') });
  await expect(page.getByRole('status')).toContainText('视频无法播放');
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('旧版作品');
  await page.getByRole('button', { name: '取消打开', exact: true }).click();
  expect(await exported(page)).toEqual(original);
  await open(page, legacy);
  await selectVideo(page, '选择对应视频');
  await ready(page, '旧版作品');
  const linked = await exported(page);
  expect(linked.videoHint.assetId).toBeTruthy();

  await page.reload();
  await open(page, linked);
  await ready(page, '旧版作品');
  expect(await exported(page)).toEqual(linked);
});

test('新建取消、maps 写入失败时不进入半成品工作区', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await chooser).setFiles([]);
  await expect(page.getByRole('button', { name: '试玩谱面', exact: true })).toBeDisabled();
  await page.route('**/__wfp/workspace/attach', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'maps 磁盘写入失败' }),
    }),
  );
  await selectVideo(page, '新建');
  await expect(page.getByRole('status')).toContainText('maps 磁盘写入失败');
  await expect(page.getByRole('button', { name: '试玩谱面', exact: true })).toBeDisabled();
});
test('选择文件句柄后写入 maps，删除浏览器源文件也能重开', async ({ page }) => {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('handle-video.mp4', { create: true });
    const writable = await handle.createWritable();
    await writable.write(await (await fetch('/demo.mp4')).blob());
    await writable.close();
    Object.defineProperty(window, 'showOpenFilePicker', {
      value: async () => [handle],
      configurable: true,
    });
  });
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await ready(page, 'handle-video');
  const chart = await exported(page);
  expect(chart.videoHint.assetId).toMatch(/^pack-/);
  expect(await page.locator('video').getAttribute('src')).toContain('/__wfp/map-file/');
  await page.evaluate(async () => {
    await (await navigator.storage.getDirectory()).removeEntry('handle-video.mp4');
  });
  await page.reload();
  await open(page, chart);
  await ready(page, 'handle-video');
  expect(await exported(page)).toEqual(chart);
});
