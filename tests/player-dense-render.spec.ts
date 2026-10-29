import { expect, test } from '@playwright/test';
import { demoChart } from '../src/demo';
import { blankChart, LANES, type Note } from '../src/model';
import { importDemo, insertAlbum } from './helpers/project';

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

test('follow-step playback keeps the full track height without forced layout reads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1470, height: 956 });
  await page.addInitScript(() => localStorage.setItem('waifu-fit-player-note-speed', '5'));
  await page.goto('/');
  const chart = blankChart('Track height regression');
  chart.tempoSegments = [{ id: 'tempo', anchorMs: 1000, bpm: 131, meter: '4/4' }];
  chart.notes = Array.from({ length: 8 }, (_, phrase) =>
    Array.from({ length: 8 }, (_, beat): Note[] => {
      const timeMs = Math.round(1000 + (phrase * 8 + beat) * (60000 / 131));
      const id = `${phrase}-${beat}`;
      if (beat >= 6)
        return [
          { id, timeMs, lane: 'calf_raise', kind: 'tap', direction: beat === 6 ? 'up' : 'down' },
        ];
      const leftFoot = beat < 2 || beat >= 4;
      const follow = beat % 2 === 1;
      return [
        {
          id,
          timeMs,
          lane: 'step',
          kind: 'tap',
          direction: leftFoot !== follow ? 'right' : 'left',
          foot: leftFoot ? 'left' : 'right',
          ...(follow ? { follow: true } : {}),
        },
        ...(beat < 4
          ? [
              {
                id: `${id}-arm`,
                timeMs,
                lane: 'punch',
                kind: 'tap',
                armAction: 'reach',
                direction: beat === 0 || beat === 3 ? 'down_right' : 'down_left',
                hand: leftFoot ? 'left' : 'right',
              } as Note,
            ]
          : []),
      ];
    }).flat(),
  ).flat();
  await importDemo(page, chart);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByRole('button', { name: '用当前视频画面', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '返回主页', exact: true }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.collection-album[data-id="anime"]').click();
  await insertAlbum(page);
  await page.getByRole('button', { name: `选择 ${chart.title}`, exact: true }).click();
  await expect(page.locator('.start-briefing')).toHaveAttribute('data-motion', 'ready');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.practice .player-lanes')).toBeVisible();
  await expect(page.locator('.ready-countdown')).toHaveCount(0, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  // Reading clientHeight/getBoundingClientRect each frame can repair the stale
  // subgrid layout before it paints. Observe the browser's natural layouts only.
  const layout = await page.evaluate(async () => {
    const video = document.querySelector('video')!;
    video.muted = true;
    const reference = new Map<Element, number>();
    const changes: { element: string; time: number; before: number; after: number }[] = [];
    let ready!: () => void;
    const initialized = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const observer = new ResizeObserver((entries) => {
      for (const { target, contentRect } of entries) {
        const before = reference.get(target);
        if (before === undefined) reference.set(target, contentRect.height);
        else if (Math.abs(contentRect.height - before) > 1)
          changes.push({
            element: target.className,
            time: video.currentTime,
            before,
            after: contentRect.height,
          });
      }
      ready();
    });
    document
      .querySelectorAll(
        '.practice .stage-left, .practice .player-lanes, .practice .lanes-stack, .practice .play-lane',
      )
      .forEach((element) => observer.observe(element));
    await initialized;
    const deadline = performance.now() + 26000;
    let frames = 0;
    await video.play();
    await new Promise<void>((resolve) => {
      const tick = () => {
        frames++;
        if (video.currentTime >= 23 || performance.now() >= deadline) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    video.pause();
    observer.disconnect();
    return { changes, frames, time: video.currentTime, observed: reference.size };
  });
  await page.screenshot({ path: 'artifacts/follow-step-layout-retina.png' });
  expect(layout.time).toBeGreaterThanOrEqual(23);
  expect(layout.frames).toBeGreaterThan(60);
  expect(layout.observed).toBe(8);
  expect(layout.changes).toEqual([]);
});
