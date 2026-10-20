import { importDemo } from './helpers/project';
import { expect, test } from '@playwright/test';

test('首次等待图片解码，白底进度条完成后可玩，普通编辑不重新加载', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/art/')) requests.push(request.url());
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/art/special/burst-heart.png', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await importDemo(page);
  const progress = page.getByRole('progressbar', { name: '准备播放资源' });
  await expect(progress).toBeVisible();
  await expect(page.locator('.playback-preparation')).toHaveCSS(
    'background-color',
    'rgb(247, 244, 237)',
  );
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.keyboard.press('Space');
  expect(
    await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused && v.currentTime === 0),
  ).toBe(true);
  await page.screenshot({ path: 'artifacts/startup-loading.png' });
  release();
  await expect(progress).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect(requests.some((url) => /burst-(star|sparkles)\.png/.test(url))).toBe(false);
  await page.screenshot({ path: 'artifacts/startup-ready.png' });
  const count = requests.length;
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('3');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await expect(progress).toHaveCount(0);
  expect(requests.length).toBe(count);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(progress).toHaveCount(0);
  expect(requests.length).toBe(count);
});

test('资源失败显示重试，重试后正常进入', async ({ page }) => {
  let requests = 0;
  await page.route('**/art/special/burst-heart.png', async (route) => {
    if (++requests === 1) await route.abort();
    else await route.continue();
  });
  await page.goto('/');
  await importDemo(page);
  await expect(page.getByRole('alert')).toContainText('图片资源未能加载');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.playback-preparation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect(requests).toBe(2);
});
