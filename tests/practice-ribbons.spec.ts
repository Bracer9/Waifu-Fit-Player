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
  chart.tempoSegments = [{ id: 'tempo', anchorMs: 0, bpm: 120, meter: '4/4' }];
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
    { id: 'step-middle', lane: 'step', direction: 'right', timeMs: 3000, kind: 'tap' },
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
    {
      id: 'step-balance',
      lane: 'step',
      direction: 'left',
      timeMs: 8000,
      endTimeMs: 10000,
      kind: 'hold',
      modifier: 'none',
    },
    {
      id: 'step-free-short',
      lane: 'step',
      direction: 'free',
      timeMs: 10000,
      endTimeMs: 11500,
      kind: 'hold',
      modifier: 'sway',
    },
    {
      id: 'step-double',
      lane: 'step',
      direction: 'right',
      distance: 2,
      timeMs: 12500,
      endTimeMs: 15000,
      kind: 'hold',
      modifier: 'sway',
    },
    {
      id: 'step-free',
      lane: 'step',
      direction: 'free',
      timeMs: 15500,
      endTimeMs: 18500,
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
  await expect(path).toHaveCSS('fill', 'rgb(246, 78, 147)');
  await expect(page.getByTestId('lane-calf_raise').locator('.ribbon-color')).toHaveAttribute(
    'd',
    / C /,
  );
  await expect(sway.locator('.hold-head')).toBeVisible();
  await expect(sway).toHaveAttribute('data-direction', 'right');
  await expect(page.locator('.combo-stat strong')).toHaveText('000');
  await expect(page.locator('.calorie-stat strong')).toHaveText('— KCAL');
  await page.evaluate(() => document.fonts.ready);

  await expect(page.getByTestId('lane-step').locator('.lane-label')).toHaveCSS(
    'background-image',
    'none',
  );
  await expect(sway.locator('.ribbon-bloom')).toBeVisible();
  const arrow = page.getByTestId('lane-squat').locator('.player-note').first();
  await expect(arrow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(arrow).toHaveCSS('border-width', '0px');
  await expect(arrow.locator('.glyph-ring')).toHaveCount(0);
  await expect(page.getByTestId('lane-step').locator('.player-note .glyph--step')).toHaveCount(3);
  await expect(page.getByTestId('lane-calf_raise').locator('.hold-tail')).toHaveCSS(
    'border-radius',
    '50%',
  );
  await page.screenshot({ path: 'artifacts/arrow-notes-1920.png', fullPage: true });
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.screenshot({ path: 'artifacts/arrow-notes-2560-1440.png', fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seek(1.6);
  await page.screenshot({ path: 'artifacts/arrow-hold-approach-1920.png', fullPage: true });
  await seek(2.12);
  const d = await path.getAttribute('d');
  const idleWidth = await sway
    .locator('.hold-ribbon svg')
    .evaluate((el) => el.getAttribute('data-full-width'));
  await seek(3.2);
  await expect(page.getByTestId('target-side_crunch')).toHaveAttribute('data-state', 'sway');
  await expect(sway.locator('.hold-ribbon svg')).toHaveAttribute('data-full-width', idleWidth!);
  expect(
    Number(await sway.locator('.hold-ribbon svg').getAttribute('data-visible-fraction')),
  ).toBeLessThan(1);
  const activePath = await path.getAttribute('d');
  await expect(sway.locator('.hold-head')).toBeVisible();
  await expect(sway.locator('.hold-head')).toHaveCSS('opacity', '1');
  await expect(page.locator('.combo-stat strong')).toHaveText('014');
  const paused = await sway.getAttribute('style');
  await page.waitForTimeout(200);
  await expect(sway).toHaveAttribute('style', paused!);
  await expect(path).toHaveAttribute('d', activePath!);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(3.45);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(sway.locator('.hold-ribbon svg')).toHaveAttribute('data-full-width', idleWidth!);
  await seek(5.9);
  await expect(page.getByTestId('target-side_crunch')).toHaveAttribute('data-state', 'idle');
  await expect(sway).toHaveCount(0);
  await expect(page.locator('.combo-stat strong')).toHaveText('040');
  await seek(2.28);
  await expect(page.getByTestId('impact-calf_raise').locator('.impact-ring')).toBeVisible();
  await page.screenshot({ path: 'artifacts/arrow-hold-arrival-1920.png', fullPage: true });
  const burst = await page
    .getByTestId('impact-calf_raise')
    .locator('.impact-ring')
    .getAttribute('style');
  await page.waitForTimeout(180);
  await expect(page.getByTestId('impact-calf_raise').locator('.impact-ring')).toHaveAttribute(
    'style',
    burst!,
  );
  await seek(2.67);
  await page.screenshot({ path: 'artifacts/arrow-tap-impact-1920.png', fullPage: true });
  await seek(3.21);
  await expect(page.locator('.combo-stat strong')).toHaveText('014');
  await page.screenshot({ path: 'artifacts/arrow-sustain-1920.png', fullPage: true });
  await seek(5.58);
  await expect(page.getByTestId('impact-calf_raise')).toHaveClass(/release/);
  await page.screenshot({ path: 'artifacts/arrow-hold-release-1920.png', fullPage: true });
  await seek(9.4);
  await expect(
    page.getByTestId('lane-step').locator('.player-hold[data-direction="free"] .hold-tail'),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/arrow-free-short-approach-1920.png', fullPage: true });
  await seek(10.4);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-action', 'FREE SWAY');
  await expect(page.getByTestId('target-step')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: 'artifacts/arrow-free-short-hold-1920.png', fullPage: true });
  await seek(16.1);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-action', 'FREE SWAY');
  await expect(
    page.locator('.player-hold[data-note-id="step-free"] .holding-cue .glyph--free'),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/arrow-free-sway-1920.png', fullPage: true });
  await seek(2.12);
  await expect(path).toHaveAttribute('d', d!);
  await expect(page.locator('.combo-stat strong')).toHaveText('000');
  await expect(page.locator('.calorie-stat strong')).toHaveText('— KCAL');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(path).toBeVisible();
  await page.screenshot({ path: 'artifacts/arrow-reduced-motion.png', fullPage: true });
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  expect(await node.evaluate((element) => element.isConnected)).toBe(true);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(2.12, 2);
  expect(errors).toEqual([]);
});
