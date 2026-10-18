import { openDemo } from './helpers/project';
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
async function selectVideo(page: Page, button: string, path = 'public/demo.mp4') {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await chooser).setFiles(path);
}
async function note(page: Page) {
  const box = (await page.locator('.timeline-surface').boundingBox())!;
  await page.mouse.click(box.x + 224, box.y + 57);
}

test('保存作品后刷新再打开，自动恢复真实视频；同名但不同关联不能误配', async ({ page }) => {
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
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
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

test('新建取消、无法记住视频时不进入半成品工作区', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await chooser).setFiles([]);
  await expect(page.locator('video')).not.toHaveAttribute('src', /blob:/);
  await expect(page.getByRole('button', { name: '试玩谱面', exact: true })).toBeDisabled();
  await page.evaluate(() => {
    indexedDB.open = () => {
      throw new DOMException('storage unavailable', 'QuotaExceededError');
    };
  });
  await selectVideo(page, '新建');
  await expect(page.getByRole('status')).toContainText('无法记住视频');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('video')).not.toHaveAttribute('src', /blob:/);
});

test('真实文件句柄持久化、刷新恢复、权限重新授权与文件变动检查', async ({ page }) => {
  // OPFS supplies a real serializable FileSystemFileHandle; only the OS picker UI is substituted.
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
  const stored = await page.evaluate(
    async (id) =>
      new Promise<{ handle: boolean; copy: boolean }>((resolve, reject) => {
        const open = indexedDB.open('waifu-fit-player-media', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('videos').objectStore('videos').get(id);
          request.onsuccess = () => {
            resolve({
              handle: request.result.handle instanceof FileSystemFileHandle,
              copy: !!request.result.file,
            });
            db.close();
          };
        };
      }),
    chart.videoHint.assetId!,
  );
  expect(stored).toEqual({ handle: true, copy: false });
  await page.reload();
  await open(page, chart);
  await ready(page, 'handle-video');
  await page.reload();
  await page.evaluate(() => {
    let granted = false,
      attempts = 0;
    Object.defineProperty(FileSystemHandle.prototype, 'queryPermission', {
      value: async () => (granted ? 'granted' : 'prompt'),
      configurable: true,
    });
    Object.defineProperty(FileSystemHandle.prototype, 'requestPermission', {
      value: async () => (++attempts === 1 ? 'denied' : ((granted = true), 'granted')),
      configurable: true,
    });
  });
  await open(page, chart);
  await expect(page.getByRole('dialog')).toContainText('允许读取关联视频');
  await page.getByRole('button', { name: '允许读取视频', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('尚未允许读取');
  await expect(page.locator('video')).not.toHaveAttribute('src', /blob:/);
  await page.getByRole('button', { name: '允许读取视频', exact: true }).click();
  await ready(page, 'handle-video');
  await page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('handle-video.mp4');
    const writable = await handle.createWritable();
    await writable.write('changed');
    await writable.close();
  });
  await open(page, chart);
  await expect(page.getByRole('dialog')).toContainText('原视频已被修改');
});
