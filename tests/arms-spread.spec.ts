import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blankChart, type Chart } from '../src/model';
import { importDemo } from './helpers/project';

async function exported(page: Page): Promise<Chart> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}

test('centre spread preset stays one purple symbol while editing two matching arm notes', async ({
  page,
}) => {
  await page.goto('/');
  const chart = blankChart('Two-arm spread');
  chart.notes = [
    {
      id: 'arms',
      lane: 'punch',
      direction: 'down',
      armAction: 'reach',
      hand: 'both',
      kind: 'hold',
      modifier: 'sway',
      timeMs: 1000,
      endTimeMs: 3000,
    },
  ];
  await importDemo(page, chart);
  await page.locator('[data-event="arms"]').click();
  const centre = page.getByRole('button', { name: '选中手臂动作 双臂展开', exact: true });
  await centre.click();
  await expect(centre).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '选中手臂用手 BOTH', exact: true })).toBeDisabled();
  const event = page.locator('.timeline-event[data-lane="punch"]');
  await expect(event).toHaveCount(1);
  await expect(event.locator('[data-symbol="↔"]')).toHaveCount(1);
  expect(await event.evaluate((n) => (n as HTMLElement).style.getPropertyValue('--lane'))).toBe(
    'var(--arms-both)',
  );
  await page.screenshot({ path: 'artifacts/arms-spread-inspector-1080p.png' });
  await page.getByLabel('结束 / ms', { exact: true }).fill('4000');
  await page.getByLabel('结束 / ms', { exact: true }).press('Enter');
  let saved = await exported(page);
  expect(saved.notes).toHaveLength(2);
  expect(saved.notes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ direction: 'left', hand: 'left', endTimeMs: 4000 }),
      expect.objectContaining({ direction: 'right', hand: 'right', endTimeMs: 4000 }),
    ]),
  );
  await page.getByLabel('选中事件类型').selectOption('tap');
  saved = await exported(page);
  expect(saved.notes.every((n) => n.kind === 'tap')).toBe(true);
  await expect(event).toHaveCount(1);
  await expect(page.getByTestId('extend-note')).toBeVisible();
  await page.keyboard.press('Control+c');
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('6000');
  await page.keyboard.press('Control+v');
  await expect(event).toHaveCount(2);
  saved = await exported(page);
  expect(saved.notes).toHaveLength(4);
  await page.keyboard.press('Delete');
  expect((await exported(page)).notes).toHaveLength(2);
  await page.keyboard.press('Control+z');
  expect((await exported(page)).notes).toHaveLength(4);
  await event.last().click();
  await page.getByRole('button', { name: '选中手臂动作 ↑', exact: true }).click();
  saved = await exported(page);
  expect(saved.notes).toHaveLength(3);
  expect(saved.notes.at(-1)).toMatchObject({ direction: 'up', hand: 'both' });
});

test('drawing from the centre creates a linked spread with the same game glyph', async ({
  page,
}) => {
  await page.goto('/');
  await importDemo(page, blankChart('Draw a spread'));
  await page.locator('.lane-picks [data-lane="punch"]').click();
  await page.getByRole('button', { name: '绘制手臂动作 双臂展开', exact: true }).click();
  await expect(page.locator('.lane-picks > button')).toHaveText([
    '1手臂',
    '2踏步',
    '3侧收腹',
    '4蹲起',
    '5提踵',
  ]);
  await page.locator('.timeline-surface').click({ position: { x: 324, y: 57 } });
  const saved = await exported(page);
  expect(saved.notes).toHaveLength(2);
  expect(saved.notes[0].timeMs).toBe(saved.notes[1].timeMs);
  await expect(page.locator('.timeline-event .reach-pair')).toHaveCount(1);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.locator('.practice .lane-label strong')).toHaveText([
    'ARMS',
    'STEP',
    'SIDE CRUNCH',
    'SQUAT',
    'CALF RAISE',
  ]);
  const note = page.locator('.practice .play-lane[data-lane="punch"] .player-note');
  await expect(note).toHaveCount(1);
  await expect(note.locator('[data-symbol="↔"]')).toHaveCount(1);
  expect(await note.evaluate((n) => (n as HTMLElement).style.getPropertyValue('--lane'))).toBe(
    'var(--arms-both)',
  );
  await page.screenshot({ path: 'artifacts/arms-spread-stage-1080p.png' });
});
