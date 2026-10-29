import { test, expect, exportChart } from './helpers/editor';
import { importDemo, lastDraft } from './helpers/project';
import { blankChart } from '../src/model';

test('multi-selection converts forms together, saves, reloads and undoes in one step', async ({
  page,
}) => {
  const chart = blankChart('批量类型');
  chart.notes = [
    {
      id: 'tap',
      lane: 'punch',
      direction: 'left',
      armAction: 'reach',
      hand: 'left',
      kind: 'tap',
      timeMs: 1000,
    },
    {
      id: 'clap',
      lane: 'punch',
      direction: 'forward',
      armAction: 'clap',
      hand: 'both',
      kind: 'hold',
      modifier: 'none',
      timeMs: 2000,
      endTimeMs: 3500,
    },
    { id: 'step', lane: 'step', direction: 'right', foot: 'right', kind: 'tap', timeMs: 4000 },
  ];
  await importDemo(page, chart);
  await page.locator('.timeline-footer').click();
  await page.keyboard.press('Control+a');
  const type = page.getByLabel('选中事件类型', { exact: true });
  await expect(type).toHaveValue('mixed');
  await expect(type.locator('option')).toHaveText(['多种类型', 'TAP', 'HOLD', 'SWAY']);
  await type.selectOption('sway');
  const changed = await exportChart(page);
  expect(changed.notes).toMatchObject([
    { id: 'tap', kind: 'hold', modifier: 'sway', direction: 'left', hand: 'left', endTimeMs: 1500 },
    { id: 'clap', kind: 'hold', modifier: 'sway', armAction: 'clap', endTimeMs: 3500 },
    {
      id: 'step',
      kind: 'hold',
      modifier: 'sway',
      direction: 'right',
      foot: 'right',
      endTimeMs: 4500,
    },
  ]);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual(changed.notes);
  await type.selectOption('tap');
  expect(
    (await exportChart(page)).notes.every((n) => n.kind === 'tap' && !('endTimeMs' in n)),
  ).toBe(true);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect.poll(async () => (await lastDraft(page))?.notes).toEqual(changed.notes);
  await page.screenshot({ path: 'artifacts/editor-batch-types.png' });
  await page.reload();
  await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
  await page.locator('.create-mode').click();
  expect((await exportChart(page)).notes).toEqual(changed.notes);
});

test('STEP and SIDE CRUNCH directions change together without altering feet or forms', async ({
  page,
}) => {
  const chart = blankChart('批量踏步方向');
  chart.notes = [
    {
      id: 'step',
      lane: 'step',
      direction: 'left',
      foot: 'right',
      kind: 'tap',
      stepAction: 'raise',
      timeMs: 1000,
    },
    {
      id: 'side',
      lane: 'side_crunch',
      direction: 'right',
      kind: 'hold',
      modifier: 'sway',
      timeMs: 2000,
      endTimeMs: 3500,
    },
  ];
  await importDemo(page, chart);
  await page.locator('.timeline-footer').click();
  await page.keyboard.press('Control+a');
  const right = page.getByRole('button', { name: '选中踏步方向 →', exact: true });
  const left = page.getByRole('button', { name: '选中踏步方向 ←', exact: true });
  await expect(right).toHaveAttribute('aria-pressed', 'false');
  await expect(left).toHaveAttribute('aria-pressed', 'false');
  await right.click();
  const changed = await exportChart(page);
  expect(changed.notes).toEqual([
    { ...chart.notes[0], direction: 'right' },
    { ...chart.notes[1], foot: 'right' },
  ]);
  await expect(right).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect.poll(async () => (await lastDraft(page))?.notes).toEqual(changed.notes);
  await page.reload();
  await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
  await page.locator('.create-mode').click();
  expect((await exportChart(page)).notes).toEqual(changed.notes);
});

test('arm compass changes all selected compatible lanes and disables incompatible directions', async ({
  page,
}) => {
  const chart = blankChart('批量手臂方向');
  chart.notes = [
    {
      id: 'arm',
      lane: 'punch',
      direction: 'left',
      armAction: 'reach',
      hand: 'left',
      kind: 'tap',
      timeMs: 1000,
    },
    {
      id: 'arm2',
      lane: 'punch',
      direction: 'right',
      armAction: 'reach',
      hand: 'right',
      kind: 'hold',
      modifier: 'sway',
      timeMs: 2000,
      endTimeMs: 3500,
    },
    { id: 'calf', lane: 'calf_raise', direction: 'down', kind: 'tap', timeMs: 4000 },
  ];
  await importDemo(page, chart);
  await page.locator('.timeline-footer').click();
  await page.keyboard.press('Control+a');
  await expect(page.getByRole('button', { name: '选中手臂动作 ↗', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '选中手臂动作 ↑', exact: true }).click();
  const changed = await exportChart(page);
  expect(changed.notes).toEqual(chart.notes.map((n) => ({ ...n, direction: 'up' })));
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect.poll(async () => (await lastDraft(page))?.notes).toEqual(changed.notes);
  await page.screenshot({ path: 'artifacts/editor-batch-directions.png' });
});

test('SPIN rotation direction changes the selected spins in one undo', async ({ page }) => {
  const chart = blankChart('批量转圈方向');
  chart.notes = [
    {
      id: 'spin1',
      lane: 'step',
      direction: 'free',
      kind: 'hold',
      modifier: 'sway',
      timeMs: 1000,
      endTimeMs: 2000,
    },
    {
      id: 'spin2',
      lane: 'step',
      direction: 'free',
      kind: 'hold',
      modifier: 'sway',
      spinDirection: 'counterclockwise',
      timeMs: 3000,
      endTimeMs: 4000,
    },
  ];
  await importDemo(page, chart);
  await page.locator('.timeline-footer').click();
  await page.keyboard.press('Control+a');
  const rotation = page.getByLabel('选中 SPIN 旋转方向', { exact: true });
  await expect(rotation).toHaveValue('mixed');
  await rotation.selectOption('counterclockwise');
  expect((await exportChart(page)).notes).toEqual(
    chart.notes.map((n) => ({ ...n, spinDirection: 'counterclockwise' })),
  );
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual(chart.notes);
});
