import { test, expect, emptyEditor, draw, exportChart, seek } from './helpers/editor';

test('CLAP TAP and HOLD draw, record, save and show matching ribbon heads', async ({ page }) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '2 手臂', exact: true }).click();
  const clap = page.getByRole('button', { name: '绘制手臂动作 CLAP', exact: true });
  await clap.click();
  await expect(clap).toHaveAttribute('aria-pressed', 'true');
  const clapBox = (await clap.boundingBox())!;
  const palmBox = (await page
    .getByRole('button', { name: '绘制手臂动作 FWD BOTH', exact: true })
    .boundingBox())!;
  expect(clapBox.y + clapBox.height).toBeLessThanOrEqual(palmBox.y);
  expect(Math.abs(clapBox.x - palmBox.x)).toBeLessThan(2);
  await expect(page.getByLabel('绘制类型').locator('option')).toHaveText(['TAP', 'HOLD']);
  await page.getByRole('button', { name: '1 蹲起', exact: true }).click();
  await page.getByLabel('绘制类型').selectOption('hold');
  await page.getByRole('button', { name: '2 手臂', exact: true }).click();
  await expect(page.getByLabel('绘制类型')).toHaveValue('hold');
  await page.getByLabel('绘制类型').selectOption('tap');
  await page
    .getByRole('group', { name: '绘制手臂动作', exact: true })
    .screenshot({ path: 'artifacts/clap-picker.png' });
  await draw(page, 1000, 'punch');
  await expect(page.getByLabel('选中事件类型')).toBeEnabled();
  await expect(page.getByLabel('选中手臂用手')).toHaveCount(0);
  await expect(page.getByTestId('extend-note')).toHaveCount(1);
  await expect(page.getByTestId('editor-note').first().locator('.glyph--clap')).toBeVisible();
  await expect(page.getByRole('button', { name: '反转方向', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '选中手臂动作 FWD BOTH', exact: true }).click();
  await page.getByLabel('选中事件类型').selectOption('hold');
  await expect(page.getByLabel('结束 / ms')).toBeVisible();
  await page.getByRole('button', { name: '选中手臂动作 CLAP', exact: true }).click();
  await expect(page.getByLabel('结束 / ms')).toBeVisible();
  await page.getByLabel('选中事件类型').selectOption('tap');
  await expect(page.getByLabel('结束 / ms')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByLabel('结束 / ms')).toBeVisible();
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await draw(page, 3000, 'punch', 4500);
  await expect(page.getByLabel('选中事件类型')).toHaveValue('hold');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await seek(page, 5);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await seek(page, 7);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('Control');
  await page.keyboard.down('p');
  await page.waitForTimeout(350);
  await page.keyboard.up('p');
  await page.keyboard.up('Control');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  for (const note of chart.notes) {
    expect(note).toMatchObject({
      lane: 'punch',
      direction: 'forward',
      armAction: 'clap',
      hand: 'both',
    });
  }
  expect(chart.notes.map((note) => note.kind)).toEqual(['tap', 'hold', 'tap', 'hold']);
  expect(chart.notes[1]).toMatchObject({ endTimeMs: 4500, modifier: 'none' });
  expect(chart.notes[3]).toMatchObject({ modifier: 'none' });
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'clap.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  // A clap exactly at another action's release must retain its own silhouette.
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'clap-junction.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...chart,
        notes: [
          {
            id: 'clap-lead-in',
            lane: 'punch',
            direction: 'forward',
            armAction: 'forward',
            hand: 'both',
            kind: 'hold',
            modifier: 'none',
            timeMs: 0,
            endTimeMs: 1000,
          },
          ...chart.notes,
        ],
      }),
    ),
  });
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await seek(page, 0.2);
  const note = page.getByTestId('lane-punch').locator(`[data-note-id="${chart.notes[0].id}"]`);
  await expect(note).toHaveAttribute('data-action', 'CLAP');
  await expect(note.locator('.glyph--clap')).toHaveAttribute('data-symbol', 'CLAP');
  await expect(note).toHaveCSS('color', 'rgb(181, 138, 238)');
  await expect(
    page.locator('[data-note-id="clap-lead-in"] .ribbon-release-shape .clap-hands'),
  ).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/clap-game.png' });
  await seek(page, 3.1);
  const held = page.locator(`.player-hold[data-note-id="${chart.notes[1].id}"]`);
  await expect(held.locator('.hold-head .glyph--clap')).toBeVisible();
  await expect(held.locator('.ribbon-head-shape .clap-hands')).toHaveCount(1);
  await expect(page.getByTestId('target-punch')).toHaveAttribute('data-state', 'holding');
  await page.screenshot({ path: 'artifacts/clap-hold-game.png' });
});
