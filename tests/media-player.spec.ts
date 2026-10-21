import { editInStudio } from './helpers/project';
import { test, expect, demo, seek } from './helpers/editor';
import { TEST_DURATION_MS } from './helpers/test-media';

test('真实 MP4 播放、暂停、跳转、变速和单视频切换 @smoke', async ({ page }) => {
  await demo(page);
  await expect(page.locator('video')).toHaveCount(1);
  const videoNode = (await page.locator('video').elementHandle())!;
  for (const name of ['新建', '打开作品', '更换视频', '保存草稿', '导出 JSON', '操作帮助'])
    await expect(page.getByRole('button', { name, exact: true })).not.toBeVisible();
  await expect(page.getByRole('navigation')).not.toBeVisible();
  await expect(page.getByTestId('special-cue')).toHaveText('');
  const info = await page.locator('video').evaluate((v) => ({
    width: (v as HTMLVideoElement).videoWidth,
    height: (v as HTMLVideoElement).videoHeight,
    duration: (v as HTMLVideoElement).duration,
  }));
  expect(info.width).toBe(1920);
  expect(info.height).toBe(1080);
  expect(info.duration).toBeCloseTo(TEST_DURATION_MS / 1000, 1);
  await seek(page, 3);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'sway');
  await page.screenshot({ path: 'artifacts/demo-player.png', fullPage: true });
  await seek(page, 1);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'idle');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(1.4);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime);
  await page.waitForTimeout(350);
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime)).toBe(
    paused,
  );
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 0.5;
  });
  await seek(page, 3);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'sway');
  await editInStudio(page);
  expect(await videoNode.evaluate((v) => v.isConnected)).toBe(true);
  await expect(page.getByRole('button', { name: '打开作品', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/demo-editor.png', fullPage: true });
  expect(
    await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime),
  ).toBeCloseTo(3, 1);
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).playbackRate)).toBe(
    0.5,
  );
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await seek(page, 23.5);
  await expect(page.getByTestId('special-cue')).toContainText('GET READY');
  await seek(page, 24.4);
  await expect(page.getByTestId('special-cue')).toContainText('SPECIAL!');
  await seek(page, 26);
  await expect(page.getByTestId('special-cue')).not.toContainText('SPECIAL!');
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 1;
  });
  await seek(page, TEST_DURATION_MS / 1000 - 0.3);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).ended))
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});
