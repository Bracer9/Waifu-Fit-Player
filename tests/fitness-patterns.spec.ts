import { test, expect, exportChart, seek } from './helpers/editor';
import { importDemo } from './helpers/project';
import { blankChart } from '../src/model';

test('Fitness bricks insert, advance, undo and drag without replacing authored actions or resizing the workspace', async ({
  page,
}) => {
  const chart = blankChart('Fitness 积木检查');
  chart.chartType = 'fitness';
  chart.tempoSegments = [{ id: 'tempo', anchorMs: 0, bpm: 120, meter: '4/4' }];
  chart.notes = [{ id: 'authored', lane: 'step', kind: 'tap', direction: 'left', timeMs: 1000 }];
  await importDemo(page, chart);
  const before = await page.locator('.editor-body').boundingBox();
  await page.locator('.inspector-tabs').getByRole('button', { name: '积木', exact: true }).click();
  const panel = page.locator('.fitness-patterns');
  await expect(panel.getByRole('button', { name: '插入并前进' })).toBeVisible();
  await panel.getByRole('button', { name: '插入并前进' }).click();
  let generated = await exportChart(page);
  expect(generated.notes.find((n) => n.id === 'authored')).toEqual(chart.notes[0]);
  expect(generated.notes.length).toBeGreaterThan(1);
  expect(Math.min(...generated.notes.filter((n) => n.id !== 'authored').map((n) => n.timeMs))).toBe(
    0,
  );
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBe(4);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual(generated.notes);
  await seek(page, 0);
  await panel.getByRole('button', { name: '插入并前进' }).click();
  await expect(
    page.getByText('涉及轨道已有动作，未覆盖。请换到空白位置。', { exact: true }),
  ).toBeVisible();
  expect((await exportChart(page)).notes).toEqual(generated.notes);
  const surface = page.locator('.timeline-surface');
  await panel
    .locator('[data-pattern-id]')
    .first()
    .dragTo(surface, { targetPosition: { x: 124 + 1000, y: 60 } });
  await expect
    .poll(async () => (await exportChart(page)).notes.length)
    .toBeGreaterThan(generated.notes.length);
  generated = await exportChart(page);
  expect(generated.notes.some((n) => n.timeMs === 10000)).toBe(true);
  await expect(page.locator('.fitness-drop-preview')).toHaveCount(0);
  const after = await page.locator('.editor-body').boundingBox();
  expect(after!.width).toBe(before!.width);
  expect(after!.height).toBe(before!.height);
  await page.screenshot({ path: 'artifacts/fitness-v2-2026-10-23/patterns-1920.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(panel.getByRole('button', { name: '插入并前进' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'artifacts/fitness-v2-2026-10-23/patterns-1280.png' });
  const dance = { ...generated, chartType: 'dance' as const };
  await page
    .getByLabel('导入谱面文件')
    .setInputFiles({
      name: 'dance.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(dance)),
    });
  await expect(
    page.locator('.inspector-tabs').getByRole('button', { name: '积木', exact: true }),
  ).toHaveCount(0);
});
