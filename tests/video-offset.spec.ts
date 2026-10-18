import { openDemo } from './helpers/project';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Chart } from '../src/model';

test('video/audio offset saves, seeks and records consistently without altering authored times', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }),
  );
  await page.goto('/');
  await openDemo(page);
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  const exportChart = async (): Promise<Chart> => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
    return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  };
  const load = async (chart: Chart) => {
    await page.getByLabel('导入谱面文件').setInputFiles({
      name: 'offset-check.wfp.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(chart)),
    });
    await expect(page.getByRole('heading', { name: chart.title, exact: true })).toBeVisible();
  };
  const seek = async (time: number) => {
    await page.locator('video').evaluate((v: HTMLVideoElement, time) => {
      v.currentTime = time;
    }, time);
    await expect
      .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.seeking))
      .toBe(false);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const chart = await exportChart();
  chart.title = 'VIDEO OFFSET';
  chart.tempoSegments = [{ id: 'tempo', anchorMs: 0, bpm: 120, meter: '4/4' }];
  chart.notes = [
    { id: 'tap', lane: 'squat', direction: 'down', timeMs: 3000, kind: 'tap' },
    {
      id: 'hold',
      lane: 'step',
      direction: 'left',
      timeMs: 4000,
      endTimeMs: 5000,
      kind: 'hold',
      modifier: 'sway',
    },
  ];
  chart.specialMove = { name: 'HEART', icon: 'heart', previewBeats: 1 };
  chart.specialEvents = [{ id: 'special', timeMs: 4000, endTimeMs: 5000 }];
  await load(chart);
  await seek(2);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  const input = page.getByRole('spinbutton', { name: '视频偏移 / ms', exact: true });
  await expect(input).toHaveValue('0');
  await input.fill('500');
  await input.press('Enter');
  await expect(page.locator('.editor-position')).toHaveText('00:02.500');
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(2);
  await page.screenshot({ path: 'artifacts/video-offset-editor.png', fullPage: true });
  let saved = await exportChart();
  expect(saved.videoOffsetMs).toBe(500);
  expect(saved.notes).toEqual(chart.notes);
  expect(saved.tempoSegments).toEqual(chart.tempoSegments);
  expect(saved.specialEvents).toEqual(chart.specialEvents);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await seek(2.4);
  await expect(page.locator('.combo-stat strong')).toHaveText('000');
  await seek(2.5);
  await expect(page.locator('.combo-stat strong')).toHaveText('001');
  await seek(3.5);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'sway');
  await expect(page.getByTestId('special-cue')).toContainText('SPECIAL!');
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await input.fill('-500');
  await input.press('Enter');
  saved = await exportChart();
  await load(saved);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await expect(input).toHaveValue('-500');
  await input.fill('1001');
  await input.press('Enter');
  await expect(input).toHaveValue('-500');
  const timeline = (await page.locator('.timeline-surface').boundingBox())!;
  await page.mouse.click(timeline.x + 124 + 300, timeline.y + 12);
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(3.5, 2);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await seek(8);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowUp');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  saved = await exportChart();
  expect(saved.notes).toHaveLength(4);
  expect(saved.notes[2].timeMs).toBeGreaterThanOrEqual(7500);
  expect(saved.notes[2].timeMs).toBeLessThan(8000);
  expect(saved.notes[3].kind).toBe('hold');
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await seek(3);
  await expect(page.locator('.combo-stat strong')).toHaveText('000');
  await seek(3.5);
  await expect(page.locator('.combo-stat strong')).toHaveText('001');
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByRole('button', { name: '视频偏移归零', exact: true }).click();
  await expect(input).toHaveValue('0');
  expect((await exportChart()).videoOffsetMs).toBeUndefined();
  expect(errors).toEqual([]);
});
