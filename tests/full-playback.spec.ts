import { openDemo } from './helpers/project';
import { test, expect } from '@playwright/test';
import { demoChart } from '../src/demo';
import { LANES } from '../src/model';
import { writeFile } from 'node:fs/promises';

test.use({ trace: 'off', video: 'off' });

test('整首合成视频 1x 播放，五轨状态与媒体时间保持一致 @endurance', async ({ page }) => {
  test.setTimeout(310000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await openDemo(page, demoChart('demo.mp4'));
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Mute', exact: true }).click();

  const monitoring = page.evaluate(async () => {
    const video = document.querySelector('video')!;
    const frames: { interval: number; renderLag: number; videoLag: number; special: boolean }[] =
      [];
    let last = 0,
      presented: number | undefined,
      raf = 0,
      vf = 0;
    const videoFrame = (_: number, metadata: VideoFrameCallbackMetadata) => {
      presented = metadata.mediaTime;
      vf = video.requestVideoFrameCallback(videoFrame);
    };
    vf = video.requestVideoFrameCallback(videoFrame);
    const tick = (now: number) => {
      if (!video.paused && video.currentTime > 2 && last && presented !== undefined)
        frames.push({
          interval: now - last,
          renderLag:
            video.currentTime * 1000 -
            Number(document.querySelector<HTMLInputElement>('.seek')!.value),
          videoLag: (video.currentTime - presented) * 1000,
          special: !!document.querySelector('.special-lane-effect'),
        });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    await new Promise<void>((resolve) =>
      video.addEventListener('ended', () => resolve(), { once: true }),
    );
    cancelAnimationFrame(raf);
    video.cancelVideoFrameCallback(vf);
    const quality = video.getVideoPlaybackQuality();
    return { frames, dropped: quality.droppedVideoFrames, total: quality.totalVideoFrames };
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const chart = demoChart('');
  let samples = 0;
  await expect
    .poll(
      async () => {
        const frame = await page.evaluate(() => {
          const v = document.querySelector('video')!;
          return {
            time: v.currentTime * 1000,
            ended: v.ended,
            states: Array.from(document.querySelectorAll('.hit-target')).map((el) =>
              el.getAttribute('data-state'),
            ),
          };
        });
        if (
          !chart.notes.some(
            (n) =>
              Math.abs(n.timeMs - frame.time) < 100 ||
              (n.kind === 'hold' && Math.abs(n.endTimeMs - frame.time) < 100),
          )
        ) {
          const expected = LANES.map(({ id: lane }) => {
            const n = chart.notes.find(
              (n) =>
                n.lane === lane &&
                n.kind === 'hold' &&
                n.timeMs <= frame.time &&
                n.endTimeMs > frame.time,
            );
            return n?.kind === 'hold' ? (n.modifier === 'sway' ? 'sway' : 'holding') : 'idle';
          });
          expect(frame.states).toEqual(expected);
          samples++;
        }
        return frame.ended;
      },
      { timeout: 295000, intervals: [2000] },
    )
    .toBe(true);
  expect(samples).toBeGreaterThan(60);
  await expect(page.locator('.after-show')).toBeVisible();
  await expect(page.getByRole('button', { name: /ENCORE/ })).toBeVisible();
  const measured = await monitoring;
  const p95 = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];
  const specialFrames = measured.frames.filter((f) => f.special);
  const result = {
    samples,
    totalFrames: measured.total,
    droppedFrames: measured.dropped,
    specialSamples: specialFrames.length,
    specialFrameP95: p95(specialFrames.map((f) => f.interval)),
    specialVideoLagP95: p95(specialFrames.map((f) => f.videoLag)),
    renderLagP95: p95(measured.frames.map((f) => f.renderLag)),
  };
  console.log('Full song 1080p:', result);
  await writeFile('artifacts/full-song-special-performance.json', JSON.stringify(result, null, 2));
  expect(specialFrames.length).toBeGreaterThan(500);
  expect(result.specialFrameP95).toBeLessThan(34);
  expect(result.specialVideoLagP95).toBeLessThan(80);
  expect(result.renderLagP95).toBeLessThan(25);
  expect(result.droppedFrames / result.totalFrames).toBeLessThan(0.05);
});
