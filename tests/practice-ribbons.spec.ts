import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { type Chart } from '../src/model';

test('曲线长音符保留媒体相位、方向和轨道色，组合数随跳转重算，卡路里暂不计算', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByRole('button', { name: '体验示例作品', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const chart: Chart = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  chart.title = 'STUDIO SESSION';
  chart.specialEvents = [];
  chart.notes = [
    { id: 'squat-1', lane: 'squat', direction: 'down', timeMs: 2700, kind: 'tap' },
    { id: 'squat-2', lane: 'squat', direction: 'up', timeMs: 3500, kind: 'tap' },
    { id: 'squat-3', lane: 'squat', direction: 'down', timeMs: 4300, kind: 'tap' },
    {
      id: 'calf-hold',
      lane: 'calf_raise',
      direction: 'up',
      timeMs: 2200,
      endTimeMs: 5500,
      kind: 'hold',
      modifier: 'none',
    },
    { id: 'punch-1', lane: 'punch', direction: 'left', timeMs: 2600, kind: 'tap' },
    { id: 'punch-2', lane: 'punch', direction: 'right', timeMs: 3400, kind: 'tap' },
    { id: 'punch-3', lane: 'punch', direction: 'left', timeMs: 4200, kind: 'tap' },
    { id: 'step-1', lane: 'step', direction: 'left', timeMs: 2600, kind: 'tap' },
    { id: 'step-c', lane: 'step', direction: 'close', timeMs: 3000, kind: 'tap' },
    { id: 'step-2', lane: 'step', direction: 'right', distance: 2, timeMs: 3600, kind: 'tap' },
    {
      id: 'side-sway',
      lane: 'side_crunch',
      direction: 'right',
      timeMs: 2200,
      endTimeMs: 5800,
      kind: 'hold',
      modifier: 'sway',
    },
  ];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'studio-session.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title })).toBeVisible();
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  const video = page.locator('video');
  const node = (await video.elementHandle())!;
  const seek = async (seconds: number) => {
    await video.evaluate((v: HTMLVideoElement, time) => {
      v.currentTime = time;
    }, seconds);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  };
  await seek(2.12);
  const sway = page.getByTestId('lane-side_crunch').locator('.player-hold.sway');
  const path = sway.locator('.ribbon-color');
  await expect(path).toHaveAttribute('d', / C /);
  await expect(path).toHaveCSS('stroke', 'rgb(57, 197, 187)');
  await expect(page.getByTestId('lane-calf_raise').locator('.ribbon-color')).toHaveAttribute(
    'd',
    / L /,
  );
  await expect(sway.locator('.hold-head')).toBeVisible();
  await expect(sway).toHaveAttribute('data-direction', 'right');
  await expect(page.locator('.combo-stat strong')).toHaveText('000');
  await expect(page.locator('.calorie-stat strong')).toHaveText('— KCAL');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.screenshot({ path: 'artifacts/vfold-ribbons-1920.png', fullPage: true });
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.screenshot({ path: 'artifacts/vfold-ribbons-2560-1440.png', fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  const d = await path.getAttribute('d');
  const idleWidth = await sway
    .locator('.hold-ribbon svg')
    .evaluate((el) => el.getAttribute('style'));
  await seek(3.2);
  await expect(page.getByTestId('target-side_crunch')).toHaveAttribute('data-state', 'sway');
  await expect(path).toHaveAttribute('d', d!);
  expect(await sway.locator('.hold-ribbon svg').getAttribute('style')).not.toBe(idleWidth);
  await expect(sway.locator('.hold-head')).toBeHidden();
  await expect(page.locator('.combo-stat strong')).toHaveText('006');
  const paused = await sway.getAttribute('style');
  await page.waitForTimeout(200);
  await expect(sway).toHaveAttribute('style', paused!);
  await expect(path).toHaveAttribute('d', d!);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(3.45);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(path).toHaveAttribute('d', d!);
  await seek(5.9);
  await expect(page.getByTestId('target-side_crunch')).toHaveAttribute('data-state', 'idle');
  await expect(sway).toHaveCount(0);
  await expect(page.locator('.combo-stat strong')).toHaveText('011');
  await seek(2.12);
  await expect(path).toHaveAttribute('d', d!);
  await expect(page.locator('.combo-stat strong')).toHaveText('000');
  await expect(page.locator('.calorie-stat strong')).toHaveText('— KCAL');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(path).toBeVisible();
  await page.screenshot({ path: 'artifacts/vfold-reduced-motion.png', fullPage: true });
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  expect(await node.evaluate((element) => element.isConnected)).toBe(true);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(2.12, 2);
  expect(errors).toEqual([]);
});
