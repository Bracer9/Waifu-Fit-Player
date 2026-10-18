import { openDemo } from './helpers/project';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { LANES, type Chart, type Note } from '../src/model';

test('HOLD 结束点上的 TAP 与光带连成一体，间隔或重叠的 TAP 保持独立', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await openDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const chart: Chart = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  chart.title = 'HOLD AND RETURN';
  chart.specialEvents = [];
  chart.notes = LANES.flatMap((lane) =>
    [0, 200, -200, 1, -1].flatMap((gap, group) => {
      const start = 3000 + group * 10000;
      return [
        {
          id: `${lane.id}-${group}-hold`,
          lane: lane.id,
          direction: lane.directions[0],
          timeMs: start,
          endTimeMs: start + 2000,
          kind: 'hold',
          modifier: lane.id === 'punch' || lane.id === 'side_crunch' ? 'sway' : 'none',
        },
        {
          id: `${lane.id}-${group}-return`,
          lane: lane.id,
          direction: lane.directions[1],
          timeMs: start + 2000 + gap,
          kind: 'tap',
        },
      ] satisfies Note[];
    }),
  );
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'hold-and-return.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title })).toBeVisible();
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();

  const video = page.locator('video');
  const seek = async (seconds: number) => {
    await video.evaluate((v: HTMLVideoElement, time) => {
      v.currentTime = time;
    }, seconds);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  };
  const holds = (group: number) =>
    page.locator(`.practice .player-hold[data-note-id$="-${group}-hold"]`);
  const taps = (group: number) =>
    page.locator(`.practice .player-note[data-note-id$="-${group}-return"]`);
  await seek(2.75);
  await page.screenshot({ path: 'artifacts/hold-return-fullscreen-1920.png' });
  await page.getByTestId('lane-squat').screenshot({ path: 'artifacts/hold-return-squat-1920.png' });
  await expect(holds(0).locator('.ribbon-release-shape')).toHaveCount(5);
  await expect(holds(0).locator('mask ellipse')).toHaveCount(0);
  await expect(holds(0).locator('.hold-tail')).toHaveCount(0);
  await expect(taps(0).locator('.glyph--joined')).toHaveCount(5);
  await expect(taps(0).locator('.glyph-edge')).toHaveCount(0);
  const step = page.getByTestId('lane-step');
  await expect(step.locator('.ribbon-color')).toHaveCSS('fill', 'rgb(53, 201, 219)');
  await expect(step.locator('.ribbon-release-shape path')).toHaveCSS('fill', 'rgb(246, 78, 147)');
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 2560, height: 1440 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const arrow of await taps(0).all()) await expect(arrow).toBeVisible();
    await page.screenshot({ path: `artifacts/hold-return-${viewport.width}.png` });
  }
  await seek(4.7);
  await expect(holds(0).locator('.ribbon-release-shape')).toHaveCount(5);
  await page.screenshot({ path: 'artifacts/hold-return-before-release.png' });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(5.05);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(holds(0)).toHaveCount(0);
  await expect(taps(0)).toHaveCount(0);
  for (const [group, seconds] of [
    [1, 12.75],
    [2, 22.75],
  ]) {
    await seek(seconds);
    await expect(holds(group).locator('.hold-tail')).toHaveCount(5);
    await expect(holds(group).locator('.ribbon-release-shape')).toHaveCount(0);
    await expect(taps(group).locator('.glyph-edge')).toHaveCount(5);
  }
  for (const [group, seconds] of [
    [3, 32.75],
    [4, 42.75],
  ]) {
    await seek(seconds);
    await expect(holds(group).locator('.ribbon-release-shape')).toHaveCount(5);
    await expect(holds(group).locator('.hold-tail')).toHaveCount(0);
    await expect(taps(group).locator('.glyph--joined')).toHaveCount(5);
  }
  await seek(2.75);
  await expect(holds(0).locator('.ribbon-release-shape')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('有间隔的相邻 HOLD / SWAY 保留各自尾圆，只有精确首尾相接才共用连接点', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await openDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const chart: Chart = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  chart.title = 'ADJACENT SUSTAINS';
  chart.specialEvents = [];
  chart.notes = LANES.flatMap((lane) =>
    // Reproduce the same-direction PUNCH SWAY pair from the report, plus HOLD
    // and reversed/free STEP actions. Also cover an upward ARMS SWAY -> HOLD:
    // its narrower head exposes any artificial gap at the shared endpoint.
    [200, -200, 0, 0].flatMap((gap, group) => {
      const start = 3000 + group * 10000;
      const direction = lane.id === 'punch' && group === 3 ? 'up' : lane.directions[0];
      const modifier = lane.id === 'squat' || lane.id === 'calf_raise' ? 'none' : 'sway';
      return [
        {
          id: `${lane.id}-${group}-first`,
          lane: lane.id,
          direction,
          timeMs: start,
          endTimeMs: start + 1300,
          kind: 'hold',
          modifier,
        },
        {
          id: `${lane.id}-${group}-next`,
          lane: lane.id,
          direction:
            lane.id === 'punch' ? direction : lane.id === 'step' ? 'free' : lane.directions[1],
          timeMs: start + 1300 + gap,
          endTimeMs: start + 2600 + gap,
          kind: 'hold',
          modifier: lane.id === 'punch' && group === 3 ? 'none' : modifier,
        },
      ] satisfies Note[];
    }),
  );
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'adjacent-sustains.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title })).toBeVisible();
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();

  const seek = async (seconds: number) => {
    await page.locator('video').evaluate((v: HTMLVideoElement, time) => {
      v.currentTime = time;
    }, seconds);
    await expect
      .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.seeking))
      .toBe(false);
  };
  const firstNotes = (group: number) =>
    page.locator(`.practice .player-hold[data-note-id$="-${group}-first"]`);
  const expectStableOrder = async () => {
    for (const first of await firstNotes(0).all()) {
      await expect(first).toHaveCSS('z-index', '1');
      const id = (await first.getAttribute('data-note-id'))!;
      const next = page.locator(`.player-hold[data-note-id="${id.replace('-first', '-next')}"]`);
      await expect(next).toHaveCSS('z-index', '1');
      expect(
        await first.evaluate(
          (element, nextId) => {
            const next = element.parentElement!.querySelector(`[data-note-id="${nextId}"]`)!;
            return !!(element.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING);
          },
          id.replace('-first', '-next'),
        ),
      ).toBe(true);
      // The body and contour are painted once in the note's own layer.
      await expect(first.locator('.ribbon-outline')).toHaveCount(1);
      await expect(first.locator('.ribbon-color')).toHaveCount(1);
      await expect(first.locator('.hold-marker-outline, .ribbon-marker-join')).toHaveCount(0);
    }
  };
  await seek(2.85);
  await expectStableOrder();
  await page.screenshot({ path: 'artifacts/adjacent-sway-fullscreen-1920.png' });
  await page
    .getByTestId('lane-punch')
    .screenshot({ path: 'artifacts/adjacent-sway-punch-1920.png' });
  await expect(firstNotes(0).locator('.hold-tail')).toHaveCount(5);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 2560, height: 1440 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const tail of await firstNotes(0).locator('.hold-tail').all()) {
      await expect(tail).toBeVisible();
      await expect(tail).toHaveCSS('opacity', '1');
    }
  }
  await seek(3.5);
  await expectStableOrder();
  await expect(firstNotes(0).locator('.hold-tail')).toHaveCount(5);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(3.7);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(firstNotes(0).locator('.hold-tail')).toHaveCount(5);
  // Even in the final 50 ms, the endpoint stays alive on the same layer below arrows.
  await seek(4.25);
  await expectStableOrder();
  for (const tail of await firstNotes(0).locator('.hold-tail').all()) {
    await expect(tail).toHaveCSS('opacity', '1');
    await expect(tail).toHaveCSS('z-index', '2');
  }
  await page.screenshot({ path: 'artifacts/sustain-tails-before-judgment.png' });
  await seek(4.3);
  for (const tail of await firstNotes(0).locator('.hold-tail').all())
    expect(await tail.evaluate((el) => parseFloat(el.parentElement!.style.left))).toBeCloseTo(88);
  await seek(4.35);
  await expect(firstNotes(0)).toHaveCount(0);
  await expect(
    page.locator('.practice .player-hold[data-note-id$="-0-next"] .hold-tail'),
  ).toHaveCount(5);
  await seek(12.85);
  await expect(firstNotes(1).locator('.hold-tail')).toHaveCount(5);
  await page.screenshot({ path: 'artifacts/overlapping-sway-tails-1920.png' });
  await seek(22.85);
  await expect(firstNotes(2).locator('.hold-tail')).toHaveCount(0);
  await expect(
    page.locator('.practice .player-hold[data-note-id$="-2-next"] .hold-head'),
  ).toHaveCount(5);
  for (const seconds of [32.85, 33.9, 34.25]) {
    await seek(seconds);
    const sway = page.locator('.practice .player-hold[data-note-id="punch-3-first"]');
    await expect(sway.locator('.hold-tail')).toHaveCount(0);
    expect(
      await sway.locator('.ribbon-color').evaluate((path: SVGGraphicsElement) => path.getBBox().x),
      'The SWAY body must reach the following HOLD head without a marker-sized gap',
    ).toBe(0);
    await page.screenshot({ path: `artifacts/arms-sway-hold-${seconds}.png` });
  }
  await seek(2.85);
  await expect(firstNotes(0).locator('.hold-tail')).toHaveCount(5);
});

test('真实全屏：音符保持单中心线和大尺寸，连续与重叠长条不覆盖动作标记', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await openDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const video = page.locator('video');
  const seek = async (seconds: number) => {
    await video.evaluate((v: HTMLVideoElement, time) => {
      v.currentTime = time;
    }, seconds);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  };

  await seek(29.3);
  await page.screenshot({ path: 'artifacts/notes-demo-fullscreen-1920.png' });
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const chart: Chart = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  const hold = (
    id: string,
    lane: Note['lane'],
    direction: Note['direction'],
    timeMs: number,
    endTimeMs: number,
    modifier: 'none' | 'sway' = 'none',
  ): Note => ({ id, lane, direction, timeMs, endTimeMs, kind: 'hold', modifier });
  chart.title = 'DENSE NOTE CHECK';
  chart.specialEvents = [];
  chart.notes = [
    hold('squat-hold', 'squat', 'down', 2800, 7600),
    { id: 'squat-tap-1', lane: 'squat', direction: 'up', timeMs: 4000, kind: 'tap' },
    { id: 'squat-tap-2', lane: 'squat', direction: 'down', timeMs: 4600, kind: 'tap' },
    hold('calf-first', 'calf_raise', 'up', 3000, 5000),
    hold('calf-next', 'calf_raise', 'down', 5000, 7000),
    hold('punch-first', 'punch', 'left', 3000, 6500),
    hold('punch-overlap', 'punch', 'right', 4500, 7600),
    hold('step-first', 'step', 'right', 3000, 5000),
    hold('step-free', 'step', 'free', 5000, 7000, 'sway'),
    { id: 'step-next', lane: 'step', direction: 'left', timeMs: 7000, kind: 'tap' },
    hold('side-first', 'side_crunch', 'right', 3000, 5000, 'sway'),
    hold('side-next', 'side_crunch', 'left', 5000, 7000, 'sway'),
    hold('short', 'step', 'left', 8000, 8125),
    hold('free-sway', 'step', 'free', 9500, 12500, 'sway'),
  ];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'overlap.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title })).toBeVisible();
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();

  await seek(3.35);
  const heads = page.locator('.practice .hold-head, .practice .player-note');
  for (const item of await heads.all()) {
    await expect(item).toHaveCSS('width', '78px');
    const position = await item.evaluate((el) => {
      const parent = el.parentElement!;
      return Math.abs(parseFloat(getComputedStyle(el).top) - parent.clientHeight / 2);
    });
    expect(position).toBeLessThan(1);
  }
  const first = page.locator('.player-hold[data-note-id="step-first"]');
  await expect(first.locator('.hold-tail')).toHaveCount(0);
  await expect(page.locator('.player-hold[data-note-id="step-free"] .hold-head')).toBeVisible();
  await expect(page.locator('.player-hold[data-note-id="squat-hold"] mask')).toHaveCount(0);
  await expect(page.locator('.practice .note-impact .note-glyph')).toHaveCount(0);
  const tail = page.locator('.player-hold[data-note-id="punch-overlap"] .hold-tail');
  await expect(tail).toHaveCSS('background-color', 'rgb(246, 78, 147)');
  expect(await tail.evaluate((el) => getComputedStyle(el, '::after').backgroundColor)).toBe(
    'rgb(250, 255, 255)',
  );
  await page.screenshot({ path: 'artifacts/notes-overlap-fullscreen-1920.png' });
  // Inspect rendered pixels: DOM styles on an SVG source do not prove that a
  // referenced/shadow contour inherited its paint correctly.
  const ribbonPixels = await page.locator('[data-note-id="squat-hold"].player-hold').screenshot();
  const blackPixels = await page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${base64}`)).blob(),
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let black = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] < 10 && pixels[i + 1] < 10 && pixels[i + 2] < 10 && pixels[i + 3] > 240)
        black++;
    bitmap.close();
    return black;
  }, ribbonPixels.toString('base64'));
  expect(blackPixels, 'The colored sustain must not contain default-black SVG patches').toBe(0);
  await page
    .locator('.lanes-stack')
    .screenshot({ path: 'artifacts/notes-overlap-tracks-1920.png' });
  await seek(4.4);
  for (const lane of ['punch', 'squat']) {
    await expect(page.getByTestId(`target-${lane}`)).toHaveCSS('opacity', '1');
    await expect(
      page.getByTestId(`lane-${lane}`).locator('.player-hold.active .hold-head'),
    ).toHaveCSS('opacity', '0');
    await expect(page.getByTestId(`lane-${lane}`).locator('.judgement-ring')).toHaveCSS(
      'opacity',
      '1',
    );
    await expect(page.getByTestId(`lane-${lane}`).locator('.judgement-ring')).toHaveCSS(
      'z-index',
      '0',
    );
    await expect(page.getByTestId(`lane-${lane}`).locator('.judgement-ring')).toHaveCSS(
      'border-top-width',
      '1px',
    );
  }
  await expect(tail).toHaveCSS('z-index', '2');
  await page.screenshot({ path: 'artifacts/notes-junction-fullscreen-1920.png' });
  await seek(5.04);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-direction', 'free');
  await expect(
    page.locator('.player-hold[data-note-id="step-free"] .holding-cue .note-glyph'),
  ).toHaveCount(1);
  await expect(page.getByTestId('target-step').locator('.note-glyph')).toHaveCount(0);
  await expect(page.getByTestId('impact-step').locator('.note-glyph')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/notes-handoff-fullscreen-1920.png' });
  await seek(7.7);
  await page.screenshot({ path: 'artifacts/notes-short-fullscreen-1920.png' });
  await seek(10.2);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-action', 'FREE SWAY');
  await page.screenshot({ path: 'artifacts/notes-free-sway-fullscreen-1920.png' });
  await seek(3.35);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await expect(heads.first()).toHaveCSS('width', '102px');
  await page.screenshot({ path: 'artifacts/notes-overlap-fullscreen-2560.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: 'artifacts/notes-overlap-fullscreen-1280.png' });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(4.2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(errors).toEqual([]);
});
