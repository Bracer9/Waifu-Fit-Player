import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { LANES, type Chart } from '../src/model';

// Trace screenshots read back the video/compositor repeatedly and distort frame measurements.
test.use({ trace: 'off', video: 'off' });

test('1080p 连续 SPECIAL 与五轨长条播放：视频帧、媒体时钟和谱面保持同步', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByRole('button', { name: '体验示例作品', exact: true }).click();
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const chart: Chart = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  chart.title = 'SPECIAL SYNC CHECK';
  chart.tempoSegments = [{ id: 'tempo', anchorMs: 0, bpm: 120, meter: '4/4' }];
  chart.notes = LANES.map((lane, index) => ({
    id: lane.id,
    lane: lane.id,
    direction: lane.directions[0],
    kind: 'hold',
    modifier: index % 2 ? 'sway' : 'none',
    timeMs: 2500,
    endTimeMs: 11500,
  }));
  chart.specialMove = { name: 'HEART POSE', icon: 'heart', previewBeats: 4 };
  chart.specialEvents = [
    { id: 'a', timeMs: 5000 },
    { id: 'b', timeMs: 5400 },
    { id: 'c', timeMs: 7000, endTimeMs: 8200 },
    { id: 'd', timeMs: 8400 },
    { id: 'e', timeMs: 10000 },
  ];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'special-sync.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();

  // Include a normal lead-in; avoid treating decoder startup as a SPECIAL regression.
  const samples = await page.evaluate(async () => {
    const video = document.querySelector('video')!;
    const samples: { delta: number; renderLag: number; videoLag: number; bursts: number }[] = [];
    let presented: number | undefined;
    let frame = 0,
      videoFrame = 0,
      last = 0;
    let before = video.getVideoPlaybackQuality();
    const onVideo = (_: number, metadata: VideoFrameCallbackMetadata) => {
      presented = metadata.mediaTime;
      videoFrame = video.requestVideoFrameCallback(onVideo);
    };
    videoFrame = video.requestVideoFrameCallback(onVideo);
    await video.play();
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (video.currentTime < 4) before = video.getVideoPlaybackQuality();
        else if (last && presented !== undefined)
          samples.push({
            delta: now - last,
            renderLag:
              video.currentTime * 1000 -
              Number(document.querySelector<HTMLInputElement>('.seek')!.value),
            videoLag: (video.currentTime - presented) * 1000,
            bursts: document.querySelectorAll('.special-burst').length,
          });
        last = now;
        if (video.currentTime >= 11) resolve();
        else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    video.pause();
    cancelAnimationFrame(frame);
    video.cancelVideoFrameCallback(videoFrame);
    const after = video.getVideoPlaybackQuality();
    return {
      samples,
      dropped: after.droppedVideoFrames - before.droppedVideoFrames,
      frames: after.totalVideoFrames - before.totalVideoFrames,
    };
  });
  const p95 = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)];
  const result = {
    frames: samples.frames,
    dropped: samples.dropped,
    frameP95: p95(samples.samples.map((s) => s.delta)),
    renderLagP95: p95(samples.samples.map((s) => s.renderLag)),
    videoLagP95: p95(samples.samples.map((s) => s.videoLag)),
    overlappingBursts: Math.max(...samples.samples.map((s) => s.bursts)),
  };
  console.log('SPECIAL real playback:', result);
  await writeFile('artifacts/special-playback-performance.json', JSON.stringify(result, null, 2));
  expect(result.overlappingBursts).toBeGreaterThanOrEqual(10);
  expect(result.dropped / result.frames).toBeLessThan(0.08);
  expect(result.frameP95).toBeLessThan(34);
  expect(result.renderLagP95).toBeLessThan(25);
  expect(result.videoLagP95).toBeLessThan(80);
  // These are media-derived effects, including when frames were missed or the rate changes.
  await page.locator('video').evaluate(async (v: HTMLVideoElement) => {
    v.currentTime = 4.8;
    await new Promise<void>((resolve) =>
      v.addEventListener('seeked', () => resolve(), { once: true }),
    );
    v.playbackRate = 1.5;
    await v.play();
    const until = performance.now() + 220;
    while (performance.now() < until) {
      /* Simulate one missed render interval. */
    }
  });
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector('video')!.currentTime * 1000 -
          Number(document.querySelector<HTMLInputElement>('.seek')!.value),
      ) < 25,
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 1;
    v.currentTime = 5.54;
  });
  await expect(page.getByTestId('special-burst')).toHaveCount(10);
  await expect(
    page.locator('.hit-target[data-state="holding"], .hit-target[data-state="sway"]'),
  ).toHaveCount(5);
  await page.screenshot({ path: 'artifacts/special-overlap-performance-1920.png' });
  expect(errors).toEqual([]);
});
