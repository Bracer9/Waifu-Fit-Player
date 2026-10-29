import { expect, test } from '@playwright/test';
import { demoChart } from '../src/demo';
import { LANES } from '../src/model';
import { importDemo } from './helpers/project';

// Retina-like raster workload; this does not emulate macOS's graphics backend.
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, trace: 'off' });

test('dense notes retain their geometry through backward seeks, playback and simultaneous effects', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('waifu-fit-player-note-speed', '5'));
  await page.goto('/');
  const chart = demoChart('demo.mp4');
  chart.notes = LANES.flatMap((lane) => [
    ...Array.from({ length: 36 }, (_, index) => ({
      id: `${lane.id}-${index}`,
      lane: lane.id,
      direction: lane.directions.filter((direction) => direction !== 'free')[index % 2],
      kind: 'tap' as const,
      timeMs: 1000 + index * 180,
    })),
    {
      id: `${lane.id}-hold`,
      lane: lane.id,
      direction: lane.directions[0],
      kind: 'hold' as const,
      modifier: 'sway' as const,
      timeMs: 8000,
      endTimeMs: 16000,
    },
  ]);
  chart.specialMove = { name: 'HEART POSE', icon: 'heart', previewBeats: 4 };
  chart.specialEvents = [
    { id: 'burst', timeMs: 3000 },
    { id: 'sustain', timeMs: 8500, endTimeMs: 11000 },
  ];
  await importDemo(page, chart);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const video = page.locator('video');
  const seek = async (seconds: number) => {
    await video.evaluate((v: HTMLVideoElement, time) => {
      v.pause();
      v.currentTime = time;
    }, seconds);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
    await expect.poll(() => page.locator('.seek').inputValue()).toBe(String(seconds * 1000));
  };
  const geometry = () =>
    page.locator('.practice .player-lanes').evaluate((root) =>
      [...root.querySelectorAll('.player-note, .player-hold')].map((node) => ({
        id: node.getAttribute('data-note-id'),
        style: Object.fromEntries(
          [...(node as HTMLElement).style]
            .sort()
            .map((key) => [key, (node as HTMLElement).style.getPropertyValue(key)]),
        ),
        paths: [...node.querySelectorAll('path')].map((path) => path.getAttribute('d')),
      })),
    );
  for (const seconds of [2.2, 9.2]) {
    await seek(seconds);
    const before = await geometry();
    expect(before.length).toBeGreaterThan(seconds < 3 ? 20 : 4);
    await seek(18);
    await seek(seconds);
    expect(await geometry()).toEqual(before);
    await page.screenshot({ path: `artifacts/dense-retina-${seconds}.png` });
  }
  await seek(1);
  // Watch the actual wall/track sizes through dense, empty, sustain and release
  // frames. A single collapsed frame is visible as the large black gap on Mac.
  const layout = await page.evaluate(async () => {
    const video = document.querySelector('video')!;
    const elements = [
      ...document.querySelectorAll<HTMLElement>(
        '.practice .stage-left, .practice .practice-heading, .practice .player-lanes, .practice .lanes-stack, .practice .play-lane',
      ),
    ];
    const sizes = () =>
      elements.flatMap((element) => [element.clientWidth, element.clientHeight, element.offsetTop]);
    const reference = sizes();
    let samples = 0,
      maxDrift = 0;
    const deadline = performance.now() + 20000;
    await video.play();
    await new Promise<void>((resolve) => {
      const sample = () => {
        const current = sizes();
        maxDrift = Math.max(
          maxDrift,
          ...current.map((value, index) => Math.abs(value - reference[index])),
        );
        samples++;
        if (video.currentTime >= 17 || performance.now() >= deadline) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    video.pause();
    return { samples, maxDrift, time: video.currentTime };
  });
  expect(layout.time).toBeGreaterThanOrEqual(17);
  expect(layout.samples).toBeGreaterThan(60);
  expect(layout.maxDrift).toBe(0);
  expect(await video.evaluate((v: HTMLVideoElement) => v.error?.message ?? '')).toBe('');
  expect(errors).toEqual([]);
});
