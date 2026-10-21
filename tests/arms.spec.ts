import { openDemo, editInStudio } from './helpers/project';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ARM_DIRECTIONS, type Chart, type Note } from '../src/model';

async function exportChart(page: Page): Promise<Chart> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}
async function load(page: Page, chart: Chart) {
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'arms-check.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title, exact: true })).toBeVisible();
}
async function setup(page: Page) {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await openDemo(page);
  await editInStudio(page);
  const chart = await exportChart(page);
  chart.title = 'ARMS SESSION';
  chart.notes = [];
  chart.specialEvents = [];
  return chart;
}
async function seek(page: Page, seconds: number) {
  await page.locator('video').evaluate((v: HTMLVideoElement, time) => {
    v.currentTime = time;
  }, seconds);
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.seeking))
    .toBe(false);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

test('ARMS authoring, F/H, quick recording and save round trip', async ({ page }) => {
  const chart = await setup(page);
  await load(page, chart);
  await page.locator('.lane-picks [data-lane="punch"]').click();
  await page.getByRole('button', { name: '绘制手臂动作 ↗', exact: true }).click();
  await page.getByRole('button', { name: '录入用手 L', exact: true }).click();
  const box = (await page.locator('.timeline-surface').boundingBox())!;
  await page.mouse.move(box.x + 324, box.y + 111);
  await page.mouse.down();
  await page.mouse.move(box.x + 524, box.y + 111, { steps: 5 });
  await page.mouse.up();
  await page.getByLabel('选中事件类型').selectOption('sway');
  await page.locator('.timeline-surface').click({ position: { x: 340, y: 111 } });
  await page.keyboard.press('h');
  await page.keyboard.press('f');
  let saved = await exportChart(page);
  expect(saved.notes[0]).toMatchObject({
    lane: 'punch',
    direction: 'down_left',
    armAction: 'reach',
    hand: 'right',
    kind: 'hold',
    modifier: 'sway',
    timeMs: 2000,
    endTimeMs: 4000,
  });
  await page.getByRole('button', { name: '选中手臂动作 PUNCH L', exact: true }).click();
  await page.keyboard.press('f');
  saved = await exportChart(page);
  expect(saved.notes[0]).toMatchObject({
    armAction: 'punch',
    direction: 'right',
    modifier: 'sway',
    endTimeMs: 4000,
  });
  expect(saved.notes[0].hand).toBeUndefined();
  await page.getByRole('button', { name: '选中手臂动作 ↑', exact: true }).click();
  await page.getByRole('button', { name: '选中手臂用手 BOTH', exact: true }).click();
  saved = await exportChart(page);
  await load(page, saved);
  expect((await exportChart(page)).notes).toEqual(saved.notes);
  await page.locator('.timeline-event').first().click();
  await page.locator('.lane-picks [data-lane="punch"]').click();
  await expect(page.getByRole('button', { name: '绘制手臂动作 ↗', exact: true })).toHaveCSS(
    'color',
    'rgb(231, 237, 242)',
  );
  await expect(page.locator('.timeline-event.sway')).toHaveCSS('background-image', /181, 138, 238/);
  await page.screenshot({ path: 'artifacts/arms-editor.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.keyboard.press('2');
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await seek(page, 20);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('h');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Alt+ArrowLeft');
  await page.keyboard.press('Alt+ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('j');
  await page.keyboard.press('k');
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await page.keyboard.down('j');
  await page.waitForTimeout(300);
  await page.keyboard.up('j');
  await page.keyboard.press('3');
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  saved = await exportChart(page);
  const recorded = saved.notes.filter((n) => n.timeMs >= 20000);
  expect(recorded).toHaveLength(13);
  expect(new Set(recorded.filter((n) => n.armAction === 'reach').map((n) => n.direction))).toEqual(
    new Set(ARM_DIRECTIONS),
  );
  expect(recorded.filter((n) => n.armAction === 'reach').every((n) => n.hand === 'left')).toBe(
    true,
  );
  expect(recorded.filter((n) => n.armAction === 'punch').map((n) => n.direction)).toEqual([
    'left',
    'right',
    'left',
  ]);
  expect(recorded.find((n) => n.kind === 'hold' && n.modifier === 'sway')).toMatchObject({
    direction: 'up_right',
    hand: 'left',
    armAction: 'reach',
  });
  expect(recorded.find((n) => n.kind === 'hold' && n.modifier === 'none')).toMatchObject({
    direction: 'left',
    armAction: 'punch',
  });
  expect(recorded.at(-1)).toMatchObject({ lane: 'step', direction: 'left' });
});

test('actual chart: eight arrows, glove letters, sustain colors and judgment clipping', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const chart = await setup(page);
  chart.notes = ARM_DIRECTIONS.map((direction, i): Note => ({
    id: `arrow-${i}`,
    lane: 'punch',
    armAction: 'reach',
    direction,
    hand: (['left', 'right', 'both', 'any'] as const)[i % 4],
    kind: 'tap',
    timeMs: 3000 + i * 550,
  }));
  chart.notes.push(
    { id: 'legacy-left', lane: 'punch', direction: 'left', kind: 'tap', timeMs: 9000 },
    {
      id: 'glove-right',
      lane: 'punch',
      armAction: 'punch',
      direction: 'right',
      kind: 'tap',
      timeMs: 9550,
    },
    {
      id: 'glove-hold',
      lane: 'punch',
      armAction: 'punch',
      direction: 'left',
      kind: 'hold',
      timeMs: 11000,
      endTimeMs: 13000,
      modifier: 'none',
    },
    {
      id: 'glove-sway',
      lane: 'punch',
      armAction: 'punch',
      direction: 'right',
      kind: 'hold',
      timeMs: 13200,
      endTimeMs: 15400,
      modifier: 'sway',
    },
    {
      id: 'diagonal-hold',
      lane: 'punch',
      armAction: 'reach',
      direction: 'up_right',
      hand: 'both',
      kind: 'hold',
      timeMs: 18000,
      endTimeMs: 20500,
      modifier: 'none',
    },
    {
      id: 'release',
      lane: 'punch',
      armAction: 'reach',
      direction: 'down_left',
      hand: 'both',
      kind: 'tap',
      timeMs: 20500,
    },
    {
      id: 'diagonal-sway',
      lane: 'punch',
      armAction: 'reach',
      direction: 'down_right',
      hand: 'left',
      kind: 'hold',
      timeMs: 21000,
      endTimeMs: 23400,
      modifier: 'sway',
    },
    {
      id: 'next-sway',
      lane: 'punch',
      armAction: 'reach',
      direction: 'up_left',
      hand: 'right',
      kind: 'hold',
      timeMs: 23600,
      endTimeMs: 25800,
      modifier: 'sway',
    },
    { id: 'pair-left', lane: 'punch', direction: 'left', kind: 'tap', timeMs: 28000 },
    { id: 'pair-right', lane: 'punch', direction: 'right', kind: 'tap', timeMs: 28000 },
    {
      id: 'pair-hold-left',
      lane: 'punch',
      direction: 'left',
      kind: 'hold',
      timeMs: 30000,
      endTimeMs: 32500,
      modifier: 'none',
    },
    {
      id: 'pair-hold-right',
      lane: 'punch',
      direction: 'right',
      kind: 'hold',
      timeMs: 30000,
      endTimeMs: 32500,
      modifier: 'none',
    },
  );
  for (const lane of ['squat', 'calf_raise', 'step', 'side_crunch'] as const)
    chart.notes.push({
      id: lane,
      lane,
      direction: lane === 'squat' || lane === 'calf_raise' ? 'up' : 'right',
      kind: 'hold',
      timeMs: 18000,
      endTimeMs: 21000,
      modifier: 'sway',
    });
  await load(page, chart);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();

  await page.evaluate(() => document.fonts.ready);
  const lane = page.getByTestId('lane-punch');
  await expect(lane.locator('.lane-label strong')).toHaveText('ARMS');
  await seek(page, 2.9);
  await page.screenshot({ path: 'artifacts/arms-arrows-game.png' });
  await expect(lane.locator('.player-note[data-note-id="arrow-0"] .glyph-body')).toHaveCSS(
    'stroke',
    'rgb(53, 201, 219)',
  );
  await seek(page, 5);
  await page.screenshot({ path: 'artifacts/arms-arrows-late-game.png' });
  await seek(page, 8.1);
  await expect(lane.locator('.player-note .glove-letter')).toHaveText(['L', 'R']);
  await expect(lane.locator('.player-note[data-note-id="legacy-left"] .glove-letter')).toHaveCSS(
    'fill',
    'rgb(53, 201, 219)',
  );
  await page.screenshot({ path: 'artifacts/arms-gloves-game.png' });
  await seek(page, 12);
  await page.screenshot({ path: 'artifacts/arms-glove-sustain-game.png' });
  await expect(
    lane.locator('[data-note-id="glove-sway"] .ribbon-slide-cue .palm-print'),
  ).toHaveCount(1);
  await seek(page, 17.8);
  await page.screenshot({ path: 'artifacts/arms-sustains-game.png' });
  await expect(lane.locator('[data-note-id="diagonal-hold"] .ribbon-color')).toHaveCSS(
    'fill',
    'rgb(181, 138, 238)',
  );
  await expect(lane.locator('[data-note-id="diagonal-hold"] .ribbon-release-shape')).toHaveCount(1);
  await seek(page, 21.9);
  await page.screenshot({ path: 'artifacts/arms-nearby-sways-game.png' });
  const palm = lane.locator('[data-note-id="diagonal-sway"] .ribbon-slide-cue');
  await expect(palm).toHaveCount(1);
  const edge = () =>
    palm.evaluate((el) => {
      const group = el as SVGGElement;
      const bounds = group.getBBox(),
        transform = group.transform.baseVal.consolidate()!.matrix;
      const rect = el.closest('svg')!.querySelector('clipPath rect') as SVGRectElement;
      return {
        left: bounds.x * transform.a + transform.e,
        right: (bounds.x + bounds.width) * transform.a + transform.e,
        clip: rect.x.baseVal.value + rect.width.baseVal.value,
      };
    });
  const before = await edge();
  expect(before.right).toBeLessThan(before.clip);
  await seek(page, 22.2);
  const during = await edge();
  expect(during.left).toBeLessThan(during.clip);
  expect(during.right).toBeGreaterThan(during.clip);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(22.5);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await seek(page, 27.3);
  await expect(lane.locator('.player-note .glove-letter')).toHaveText(['L', 'R']);
  await expect(lane.locator('.player-note')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/arms-double-punch-game.png' });
  await seek(page, 30.5);
  await expect(lane.locator('.player-hold')).toHaveCount(1);
  await expect(lane.locator('.holding-cue .glove-letter')).toHaveText(['L', 'R']);
  await page.screenshot({ path: 'artifacts/arms-double-hold-game.png' });
  await seek(page, 17.8);
  await page.screenshot({ path: 'artifacts/arms-game-1280.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
