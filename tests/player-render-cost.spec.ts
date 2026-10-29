import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { demoChart } from '../src/demo';
import { LANES } from '../src/model';
import { importDemo } from './helpers/project';

test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  trace: 'off',
  video: 'off',
});

test('dense player rendering cost at speed 5', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('waifu-fit-player-note-speed', '5'));
  await page.goto('/');
  const chart = demoChart('demo.mp4');
  chart.specialEvents = [];
  chart.specialMove = null;
  chart.notes = LANES.flatMap((lane) =>
    Array.from({ length: 240 }, (_, i) => ({
      id: `${lane.id}-${i}`,
      lane: lane.id,
      kind: 'tap' as const,
      direction: lane.directions[i % 2],
      timeMs: 1000 + i * 180,
    })),
  );
  await importDemo(page, chart);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const video = page.locator('video');
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 2.2;
  });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  await expect.poll(() => page.locator('.seek').inputValue()).toBe('2200');
  const label = process.env.WFP_RENDER_SAMPLE === 'before' ? 'before' : 'after';
  await page.screenshot({ path: `artifacts/render-cost-${label}.png` });
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');
  const metrics = async () =>
    Object.fromEntries(
      (await client.send('Performance.getMetrics')).metrics.map((item) => [item.name, item.value]),
    );
  const before = await metrics();
  const frames = await page.evaluate(async () => {
    const video = document.querySelector('video')!;
    const intervals: number[] = [];
    const start = performance.now();
    let last = start;
    const quality = video.getVideoPlaybackQuality();
    await video.play();
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        intervals.push(now - last);
        last = now;
        if (now - start >= 6000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    video.pause();
    intervals.sort((a, b) => a - b);
    return {
      p95: intervals[Math.floor(intervals.length * 0.95)],
      frames: intervals.length,
      time: video.currentTime,
      droppedVideoFrames:
        video.getVideoPlaybackQuality().droppedVideoFrames - quality.droppedVideoFrames,
    };
  });
  const after = await metrics();
  const result = {
    ...frames,
    milliseconds: Object.fromEntries(
      ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].map((key) => [
        key,
        (after[key] - before[key]) * 1000,
      ]),
    ),
  };
  console.log('Dense render cost:', JSON.stringify(result));
  await writeFile(`artifacts/render-cost-${label}.json`, JSON.stringify(result, null, 2));
  expect(frames.time).toBeGreaterThan(7);
  expect(errors).toEqual([]);
});
