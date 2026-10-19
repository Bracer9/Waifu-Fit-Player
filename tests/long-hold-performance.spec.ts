import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { importDemo } from './helpers/project';
import { demoChart } from '../src/demo';
import { LANES } from '../src/model';

// Screenshot tracing adds video readbacks to every frame and distorts this measurement.
test.use({ trace: 'off', video: 'off', viewport: { width: 1920, height: 1080 } });

test('long HOLD/SWAY geometry stays bounded and follows the media clock through playback and seeks', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const chart = demoChart('demo.mp4');
  chart.specialMove = null;
  chart.specialEvents = [];
  chart.notes = LANES.map((lane, index) => ({
    id: lane.id,
    lane: lane.id,
    direction: lane.directions[0],
    timeMs: 1000,
    endTimeMs: 40000,
    kind: 'hold',
    modifier: index % 2 ? 'sway' : 'none',
  }));
  await importDemo(page, chart);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  const video = page.locator('video');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const seek = async (time: number) => {
    await video.evaluate((v: HTMLVideoElement, time) => {
      v.currentTime = time;
    }, time);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  };
  for (const time of [0.5, 10, 25, 39.8]) {
    await seek(time);
    const widths = await page.locator('.hold-ribbon svg').evaluateAll((nodes) =>
      nodes.map((node) => {
        const svg = node as SVGSVGElement;
        const highway = svg.closest<HTMLElement>('.note-highway')!;
        const marker = parseFloat(getComputedStyle(highway).getPropertyValue('--note-size'));
        return {
          width: svg.viewBox.baseVal.width,
          limit: highway.clientWidth + marker + 6,
          filterWidth: Number(svg.querySelector('filter')!.getAttribute('width')),
          filterLimit: highway.clientWidth + marker * 3 + 6,
        };
      }),
    );
    expect(widths).toHaveLength(5);
    for (const bounds of widths) {
      expect(bounds.width).toBeLessThan(bounds.limit);
      expect(bounds.filterWidth).toBeLessThan(bounds.filterLimit);
    }
  }
  await seek(10);
  const path = page.locator('[data-note-id="calf_raise"] .ribbon-color');
  const originalPath = await path.getAttribute('d');
  await seek(25);
  await seek(10);
  await expect(path).toHaveAttribute('d', originalPath!);
  await page.screenshot({ path: 'artifacts/long-holds-1080p.png' });
  await video.evaluate(async (v: HTMLVideoElement) => {
    await v.play();
  });
  await page.waitForTimeout(1200);
  const result = await page.evaluate(async () => {
    const video = document.querySelector('video')!;
    const before = video.getVideoPlaybackQuality();
    const frames: number[] = [],
      lag: number[] = [];
    await new Promise<void>((resolve) => {
      const end = performance.now() + 8000;
      let last = 0;
      const tick = (now: number) => {
        if (last) frames.push(now - last);
        lag.push(
          Math.abs(
            video.currentTime * 1000 -
              Number(document.querySelector<HTMLInputElement>('.seek')!.value),
          ),
        );
        last = now;
        if (now < end) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const after = video.getVideoPlaybackQuality();
    const p95 = (values: number[]) =>
      values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)];
    return {
      frames: after.totalVideoFrames - before.totalVideoFrames,
      dropped: after.droppedVideoFrames - before.droppedVideoFrames,
      frameP95: p95(frames),
      renderLagP95: p95(lag),
    };
  });
  console.log('Long hold playback:', result);
  await writeFile('artifacts/long-hold-playback-performance.json', JSON.stringify(result, null, 2));
  expect(result.frames).toBeGreaterThan(100);
  expect(result.dropped / result.frames).toBeLessThan(0.08);
  expect(result.frameP95).toBeLessThan(34);
  expect(result.renderLagP95).toBeLessThan(25);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  await seek(40.5);
  await expect(page.locator('.player-hold')).toHaveCount(0);
  expect(errors).toEqual([]);
});
