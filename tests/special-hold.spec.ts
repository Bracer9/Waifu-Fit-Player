import { openDemo, editInStudio } from './helpers/project';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Chart } from '../src/model';

test('SPECIAL HOLD 用同速长带表达时长，长条裁切、重叠、短条与暂停回拖保持准确', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await openDemo(page);
  await editInStudio(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const chart: Chart = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  chart.title = 'SPECIAL SUSTAIN';
  chart.tempoSegments = [{ id: 'tempo', anchorMs: 0, bpm: 120, meter: '4/4' }];
  chart.specialMove = { name: 'HEART POSE', icon: 'heart', previewBeats: 4 };
  chart.specialEvents = [
    { id: 'first', timeMs: 4000, endTimeMs: 5500 },
    { id: 'long', timeMs: 8000, endTimeMs: 15500 },
    { id: 'overlap', timeMs: 14200, endTimeMs: 17200 },
    { id: 'short', timeMs: 20000, endTimeMs: 20150 },
  ];
  chart.notes = [
    { id: 'punch', lane: 'punch', direction: 'left', timeMs: 10000, kind: 'tap' },
    {
      id: 'step',
      lane: 'step',
      direction: 'right',
      timeMs: 9000,
      endTimeMs: 12000,
      kind: 'hold',
      modifier: 'none',
    },
  ];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'special-hold.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title })).toBeVisible();
  await expect(page.locator('.timeline-footer')).toContainText('4 SPECIAL');
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();

  const video = page.locator('video');
  const seek = async (seconds: number) => {
    await video.evaluate((v: HTMLVideoElement, t) => {
      v.currentTime = t;
    }, seconds);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  };
  const effects = (id: string) => page.locator(`.special-lane-effect[data-event="${id}"]`);
  const geometry = (id: string) =>
    effects(id)
      .first()
      .evaluate((el) => {
        const target = el.closest<HTMLElement>('.note-highway')!.clientWidth * 0.88;
        const matrix = (selector: string) =>
          new DOMMatrix(getComputedStyle(el.querySelector(selector)!).transform);
        const body = matrix('.special-hold-strip');
        // Tail transform includes its half-width anchor; compare its centre.
        const tail = el.querySelector<HTMLElement>('.special-hold-tail')!;
        return {
          start: body.e / target,
          length: (body.a * 256) / target,
          tail: (matrix('.special-hold-tail').e + tail.offsetWidth / 2) / target,
        };
      });
  await seek(3.8);
  await expect(effects('first').locator('.special-hold-strip')).toHaveCount(5);
  await expect(effects('first').locator('.special-comet, .special-hold-ring')).toHaveCount(0);
  let g = await geometry('first');
  expect(g.length).toBeCloseTo(0.75, 3);
  expect(g.start).toBeCloseTo(0.15, 3);
  expect(g.tail).toBeCloseTo(0.15, 2);
  await page.screenshot({ path: 'artifacts/special-hold-flight-1920.png' });
  await page
    .getByTestId('lane-punch')
    .screenshot({ path: 'artifacts/special-hold-flight-detail.png' });
  await seek(4.9);
  g = await geometry('first');
  expect(g.length).toBeCloseTo(0.3, 3);
  expect(g.start + g.length).toBeCloseTo(1, 3);
  await expect(page.getByTestId('special-burst')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/special-hold-sustain-1920.png' });
  const frozen = await effects('first').first().innerHTML();
  await page.waitForTimeout(150);
  expect(await effects('first').first().innerHTML()).toBe(frozen);
  await seek(5.5);
  await expect(effects('first').locator('.special-hold-strip, .special-hold-tail')).toHaveCount(0);
  await expect(effects('first').locator('.special-burst[data-kind="release"]')).toHaveCount(5);
  await seek(8.9);
  await expect(effects('long').locator('.special-hold-strip')).toHaveCount(5);
  await expect(effects('long').locator('.special-hold-tail').first()).toBeHidden();
  g = await geometry('long');
  expect(g.start).toBe(0);
  expect(g.length).toBeCloseTo(1, 3);
  expect(g.tail).toBeCloseTo(0, 2);
  await expect(page.getByTestId('lane-punch').locator('.player-note')).toBeVisible();
  await page.screenshot({ path: 'artifacts/special-hold-long-and-notes-1920.png' });
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => (await geometry('long')).length).toBeCloseTo(1, 3);
    await page.screenshot({ path: `artifacts/special-hold-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seek(14);
  await expect(page.locator('.special-hold-strip')).toHaveCount(10);
  await expect(effects('long').locator('.special-hold-tail').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/special-hold-overlap-1920.png' });
  await seek(19.9);
  expect((await geometry('short')).length).toBeCloseTo(0.075, 3);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seek(20.05);
  await expect(effects('short').locator('.special-hold-strip').first()).toBeVisible();
  await expect(effects('short').locator('.special-burst-sprite')).toHaveCount(0);
  expect((await geometry('short')).length).toBeCloseTo(0.05, 3);
  await seek(4.9);
  expect(await effects('first').first().innerHTML()).toBe(frozen);
  await video.evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 1.5;
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(5.55);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(effects('first').locator('.special-hold-strip')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const icon of ['star', 'sparkles']) {
    await editInStudio(page);
    await page.getByRole('button', { name: '曲目', exact: true }).click();
    await page.getByLabel('SPECIAL 图标').selectOption(icon);
    await seek(4.9);
    await expect(page.locator('.editing .special-hold-strip')).toHaveCount(5);
    await page.getByRole('button', { name: '试玩谱面', exact: true }).click();

    await expect(effects('first').locator(`.lucide-${icon}`)).toHaveCount(5);
    await page.screenshot({ path: `artifacts/special-hold-${icon}-1920.png` });
  }
  expect(errors).toEqual([]);
});
