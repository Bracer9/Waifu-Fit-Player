import { importDemo } from './helpers/project';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blankChart } from '../src/model';

test('global note speed preserves media timing, scales taps and ribbons, and persists', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await importDemo(page, blankChart());
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '全局设置', exact: true })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const chart = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  chart.title = 'Note speed check';
  chart.videoOffsetMs = 0;
  chart.notes = [
    { id: 'speed-tap', lane: 'punch', direction: 'left', kind: 'tap', timeMs: 2000 },
    {
      id: 'speed-hold',
      lane: 'squat',
      direction: 'down',
      kind: 'hold',
      modifier: 'none',
      timeMs: 1500,
      endTimeMs: 3500,
    },
    { id: 'speed-future', lane: 'step', direction: 'right', kind: 'tap', timeMs: 8000 },
  ];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'speed.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title, exact: true })).toBeVisible();
  const video = page.locator('video');
  const seek = async (seconds: number) => {
    await video.evaluate((v: HTMLVideoElement, time) => {
      v.currentTime = time;
    }, seconds);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  };
  await seek(1);
  const geometry = () =>
    page.locator('.player-lanes').evaluate((root) => ({
      tap: parseFloat(root.querySelector<HTMLElement>('[data-note-id="speed-tap"]')!.style.left),
      hold: parseFloat(
        root.querySelector<HTMLElement>('.player-hold[data-note-id="speed-hold"]')!.style.width,
      ),
    }));
  const original = await geometry();
  expect(original.tap).toBeCloseTo(88 - 88 / 3.6);
  expect(original.hold).toBeCloseTo((88 * 2) / 3.6);
  const settings = page.getByRole('button', { name: '全局设置', exact: true });
  const openSettings = async () => {
    await page.getByRole('button', { name: '主菜单', exact: true }).click();
    await settings.click();
    await page.getByRole('tab', { name: 'SYSTEM', exact: true }).hover();
  };
  const returnToEditor = async () => {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /创作模式/ }).click();
    await expect(settings).toHaveCount(0);
  };
  await openSettings();
  const speed = page.getByRole('slider', { name: '音符流速', exact: true });
  await expect(speed).toHaveValue('3');
  await expect(speed).toHaveAttribute('min', '0.5');
  await expect(speed).toHaveAttribute('max', '10');
  await speed.focus();
  await speed.press('End');
  await expect(speed).toHaveValue('10');
  await page.screenshot({ path: 'artifacts/note-speed-settings.png', fullPage: true });
  await returnToEditor();
  await expect.poll(async () => (await geometry()).hold).toBeCloseTo((original.hold * 10) / 3);
  expect(88 - (await geometry()).tap).toBeCloseTo(((88 - original.tap) * 10) / 3);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  expect((await geometry()).hold).toBeCloseTo((original.hold * 10) / 3);
  await expect(page.locator('[data-note-id="speed-future"]')).toHaveCount(0);
  expect(
    await page
      .locator('.hold-ribbon > svg')
      .evaluate(
        (svg) =>
          Number(svg.getAttribute('data-full-width')) / svg.closest('.note-highway')!.clientWidth,
      ),
  ).toBeCloseTo((0.88 * 2000) / 1080);
  expect(
    await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.playbackRate, v.paused]),
  ).toEqual([1, 1, true]);
  await page.screenshot({ path: 'artifacts/note-speed-game.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: /创作模式/ }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await seek(1);
  await page.getByRole('button', { name: '切换日夜主题', exact: true }).click();
  await openSettings();
  await speed.focus();
  await speed.press('Home');
  await expect(speed).toHaveValue('0.5');
  await returnToEditor();
  await expect.poll(async () => (await geometry()).hold).toBeCloseTo(original.hold / 6);
  expect(88 - (await geometry()).tap).toBeCloseTo((88 - original.tap) / 6);
  await page.screenshot({ path: 'artifacts/note-speed-settings-dark.png', fullPage: true });
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.locator('[data-note-id="speed-future"]')).toHaveCount(1);
  await seek(2);
  await expect(page.locator('.player-note[data-note-id="speed-tap"]')).toHaveCount(0);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'holding');
  await seek(3.5);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'idle');
  await seek(3.501);
  await expect(page.locator('.player-hold[data-note-id="speed-hold"]')).toHaveCount(0);
  await page.reload();
  await settings.click();
  await page.getByRole('tab', { name: 'SYSTEM', exact: true }).hover();
  await expect(speed).toHaveValue('0.5');
  await speed.fill('3');
  await expect(speed).toHaveValue('3');
  await page.keyboard.press('Escape');
  await page.reload();
  await settings.click();
  await page.getByRole('tab', { name: 'SYSTEM', exact: true }).hover();
  await expect(speed).toHaveValue('3');
  expect(errors).toEqual([]);
});
