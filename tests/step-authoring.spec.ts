import { test, expect, stepChoice, seek, exportChart, emptyEditor, draw } from './helpers/editor';
import { lastDraft } from './helpers/project';

test('LEG RAISE draws and records single lifts, saves to disk and reloads with the HOLD icon', async ({
  page,
}) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  await stepChoice(page, 'draw', 'left-leg-raise');
  await expect(page.getByLabel('绘制踏步跨度')).toHaveCount(0);
  await draw(page, 1000, 'step', 1800);
  await stepChoice(page, 'draw', 'right-leg-raise');
  await draw(page, 3000, 'step');
  const selected = page.getByLabel('选中事件类型');
  for (const type of ['hold', 'follow', 'follow-sway', 'free-sway', 'tap', 'leg-raise']) {
    await selected.selectOption(type);
    expect((await exportChart(page)).notes[1].stepAction).toBe(
      type === 'leg-raise' ? 'raise' : undefined,
    );
  }
  const glyphs = page.locator('.timeline-event .note-glyph[data-symbol="LEG RAISE"]');
  await expect(glyphs).toHaveCount(2);
  for (const glyph of await glyphs.all())
    await expect(glyph.locator('g')).toHaveAttribute('transform', 'rotate(0 20 20)');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await seek(page, 6);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const chart = await exportChart(page);
  expect(chart.notes).toHaveLength(3);
  for (const note of chart.notes) {
    expect(note).toMatchObject({ kind: 'tap', stepAction: 'raise' });
    expect(note).not.toHaveProperty('endTimeMs');
    expect(note).not.toHaveProperty('distance');
  }
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect.poll(async () => (await lastDraft(page))?.notes).toEqual(chart.notes);
  await page.reload();
  await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
  await page.locator('.create-mode').click();
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.screenshot({ path: 'artifacts/leg-raise-editor.png' });
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  for (const [index, time, color] of [
    [0, 0.7, 'rgb(53, 201, 219)'],
    [1, 2.7, 'rgb(246, 78, 147)'],
  ] as const) {
    await seek(page, time);
    const tap = page.locator(`.player-note[data-note-id="${chart.notes[index].id}"]`);
    await expect(tap).toHaveAttribute('data-action', 'LEG RAISE');
    await expect(tap.locator('.note-glyph')).toHaveAttribute('data-symbol', 'LEG RAISE');
    await expect(tap.locator('.note-glyph > g')).toHaveAttribute('transform', 'rotate(0 20 20)');
    await expect(tap).toHaveCSS('color', color);
    await page.screenshot({ path: `artifacts/leg-raise-${index}-player.png` });
  }
});

test('SPIN direction survives drawing, editing, recording and reload and matches both game heads', async ({
  page,
}) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  await page.getByLabel('绘制类型').selectOption('free-sway');
  await page.getByLabel('绘制 SPIN 旋转方向').selectOption('counterclockwise');
  await draw(page, 1000, 'step', 2500);
  await expect(page.getByLabel('选中 SPIN 旋转方向')).toHaveValue('counterclockwise');
  await expect(page.getByTestId('editor-note').first().locator('.glyph-body')).toHaveAttribute(
    'transform',
    'translate(40 0) scale(-1 1)',
  );
  await page.getByLabel('选中 SPIN 旋转方向').selectOption('clockwise');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByLabel('选中 SPIN 旋转方向')).toHaveValue('counterclockwise');
  await page.getByLabel('绘制 SPIN 旋转方向').selectOption('clockwise');
  await draw(page, 3500, 'step', 5000);
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.getByLabel('绘制 SPIN 旋转方向').selectOption('counterclockwise');
  await seek(page, 6);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const chart = await exportChart(page);
  expect(chart.notes.map((n) => n.spinDirection)).toEqual([
    'counterclockwise',
    'clockwise',
    'counterclockwise',
  ]);
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'spin-directions.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.getByTestId('editor-note').first().click();
  await page.screenshot({ path: 'artifacts/spin-direction-editor.png' });
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  for (const [index, time, direction, transform] of [
    [0, 1.1, 'counterclockwise', 'translate(40 0) scale(-1 1)'],
    [1, 3.6, 'clockwise', 'rotate(0 20 20)'],
  ] as const) {
    await seek(page, time);
    const note = page.locator(`.player-hold[data-note-id="${chart.notes[index].id}"]`);
    await expect(note.locator('.hold-head .note-glyph')).toHaveAttribute(
      'data-spin-direction',
      direction,
    );
    await expect(note.locator('.ribbon-head-shape > path')).toHaveAttribute('transform', transform);
    await page.screenshot({ path: `artifacts/spin-direction-${direction}.png` });
  }
});

test('STEP LEG HOLD uses upward arrows for both legs without changing other step symbols or chart data', async ({
  page,
}) => {
  const chart = await emptyEditor(page);
  chart.notes = [
    {
      id: 'leg-left',
      lane: 'step',
      direction: 'left',
      foot: 'left',
      kind: 'hold',
      modifier: 'none',
      timeMs: 1000,
      endTimeMs: 2500,
    },
    {
      id: 'leg-right',
      lane: 'step',
      direction: 'right',
      foot: 'right',
      distance: 2,
      kind: 'hold',
      modifier: 'none',
      timeMs: 3500,
      endTimeMs: 5000,
    },
    { id: 'tap-right', lane: 'step', direction: 'right', kind: 'tap', timeMs: 6000 },
    {
      id: 'sway-left',
      lane: 'step',
      direction: 'left',
      kind: 'hold',
      modifier: 'sway',
      timeMs: 7000,
      endTimeMs: 8000,
    },
  ];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'leg-hold.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  const editorHolds = page.locator(
    '.timeline-event[data-lane="step"] .note-glyph[data-symbol="LEG HOLD"]',
  );
  await expect(editorHolds).toHaveCount(2);
  await expect(page.locator('.timeline-event[data-lane="step"] .leg-up-cue')).toHaveCount(2);
  for (const glyph of await editorHolds.all())
    await expect(glyph.locator('g')).toHaveAttribute('transform', 'rotate(0 20 20)');
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  for (const [id, time, color] of [
    ['leg-left', 1.1, 'rgb(53, 201, 219)'],
    ['leg-right', 3.6, 'rgb(246, 78, 147)'],
  ] as const) {
    await seek(page, time);
    const note = page.locator(`.player-hold[data-note-id="${id}"]`);
    await expect(note).toHaveAttribute('data-action', 'LEG HOLD');
    await expect(note.locator('.hold-head .note-glyph')).toHaveAttribute('data-symbol', 'LEG HOLD');
    await expect(note.locator('.hold-head .note-glyph > g')).toHaveAttribute(
      'transform',
      'rotate(0 20 20)',
    );
    await expect(note.locator('.ribbon-head-shape > path')).toHaveAttribute(
      'transform',
      'rotate(0 20 20)',
    );
    await expect(page.getByTestId('target-step')).toHaveCSS('color', color);
    await expect(note.locator('.ribbon-slide-cue .leg-up-cue')).toHaveAttribute(
      'transform',
      'rotate(180 20 20)',
    );
    await expect(note.locator('.leg-up-cue path')).toHaveCSS('fill', 'none');
    await page.screenshot({ path: `artifacts/${id}-hold-1920.png` });
  }
  await seek(page, 5.5);
  await expect(page.locator('[data-note-id="tap-right"] .note-glyph > g')).toHaveAttribute(
    'transform',
    'rotate(90 20 20)',
  );
  await expect(
    page.locator('[data-note-id="sway-left"] .hold-head .note-glyph > g'),
  ).toHaveAttribute('transform', 'rotate(270 20 20)');
});

test('STEP 鼠标做谱、反向与跨轨、保存重开、五轨配色和消失反馈', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  await stepChoice(page, 'draw', 'left-tap');
  await draw(page, 1000, 'step');
  await stepChoice(page, 'draw', 'right-tap');
  await draw(page, 2000, 'step', 3000);
  await stepChoice(page, 'draw', 'left-tap');
  await draw(page, 4000, 'step', 5000);
  await stepChoice(page, 'selected', 'left-sway');
  await page.getByRole('button', { name: '反转方向', exact: true }).click();
  expect((await exportChart(page)).notes[2]).toMatchObject({
    lane: 'step',
    direction: 'right',
    modifier: 'sway',
  });
  await page.keyboard.press('Control+z');
  let chart = await exportChart(page);
  expect(chart.notes).toMatchObject([
    { lane: 'step', direction: 'left', kind: 'tap', timeMs: 1000 },
    {
      lane: 'step',
      direction: 'right',
      kind: 'hold',
      timeMs: 2000,
      endTimeMs: 3000,
      modifier: 'none',
    },
    {
      lane: 'step',
      direction: 'left',
      kind: 'hold',
      timeMs: 4000,
      endTimeMs: 5000,
      modifier: 'sway',
    },
  ]);
  // STEP ↔ side crunch ↔ punch preserves a long note, including SWAY.
  const longNote = page.getByTestId('editor-note').last();
  for (const [rows, lane] of [
    [2, 'side_crunch'],
    [-3, 'punch'],
    [1, 'step'],
  ] as const) {
    const box = (await longNote.boundingBox())!;
    await page.mouse.move(box.x + 15, box.y + 14);
    await page.mouse.down();
    await page.mouse.move(box.x + 15, box.y + 14 + rows * 54, { steps: 6 });
    await page.mouse.up();
    expect((await exportChart(page)).notes[2]).toMatchObject({
      lane,
      direction: 'left',
      modifier: 'sway',
      timeMs: 4000,
      endTimeMs: 5000,
    });
  }
  chart = await exportChart(page);
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'step.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: '浏览器测试作品' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect(await exportChart(page)).toEqual(chart);
  await expect(
    page.locator('.timeline-event[data-lane="step"][data-direction="right"] .event-glyph'),
  ).toHaveCSS('background-color', 'rgb(246, 78, 147)');
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  const lanes = page.locator('.play-lane');
  expect(
    await lanes.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-lane'))),
  ).toEqual(['squat', 'punch', 'step', 'calf_raise', 'side_crunch']);
  const pink = await page
    .locator('.play-button')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  for (const lane of ['squat', 'punch'])
    await expect(page.getByTestId(`lane-${lane}`).locator('.lane-label')).toHaveCSS(
      'background-color',
      pink,
    );
  for (const lane of ['calf_raise', 'side_crunch'])
    await expect(page.getByTestId(`lane-${lane}`).locator('.lane-label')).toHaveCSS(
      'background-color',
      'rgb(57, 197, 187)',
    );
  await seek(page, 0.5);
  await expect(page.getByTestId('lane-step').locator('.player-note .note-glyph')).toHaveAttribute(
    'data-symbol',
    'L',
  );
  await expect(page.getByTestId('lane-step').locator('.player-note')).toHaveCSS(
    'color',
    'rgb(53, 201, 219)',
  );
  await expect(
    page.getByTestId('lane-step').locator('.hold-head .note-glyph').first(),
  ).toHaveAttribute('data-symbol', 'LEG HOLD');
  await expect(page.getByTestId('lane-step').locator('.hold-head').first()).toHaveCSS(
    'color',
    pink,
  );
  await seek(page, 1.08);
  const impact = page.getByTestId('impact-step');
  await expect(impact).toHaveClass(/arrival/);
  await expect(impact.locator('.impact-particle')).toHaveCount(0);
  await expect(impact.locator('.impact-sprite')).toBeVisible();
  const frozen = await impact.getAttribute('style');
  const ringTransform = await impact.locator('.impact-sprite').getAttribute('style');
  await page.waitForTimeout(150);
  expect(await impact.getAttribute('style')).toBe(frozen);
  expect(await impact.locator('.impact-sprite').getAttribute('style')).toBe(ringTransform);
  for (const viewport of [{ width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    for (const target of await page.locator('.hit-target').all()) {
      const bounds = (await target.boundingBox())!;
      const row = (await target.locator('..').boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(row.y - 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(row.y + row.height + 1);
    }
  }
  await seek(page, 1.6);
  await expect(impact).toHaveCount(0);
  await seek(page, 2.5);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'holding');
  await expect(
    page.locator(`[data-note-id="${chart.notes[1].id}"] .hold-head .note-glyph`),
  ).toHaveAttribute('data-symbol', 'LEG HOLD');
  await expect(page.getByTestId('target-step')).toHaveCSS('color', pink);
  await seek(page, 4.5);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'sway');
  await expect(
    page.locator(`[data-note-id="${chart.notes[2].id}"] .hold-head .note-glyph`),
  ).toHaveAttribute('data-symbol', 'L');
  await expect(page.getByTestId('target-step')).toHaveCSS('color', 'rgb(53, 201, 219)');
  await seek(page, 5.08);
  await expect(impact).toHaveClass(/release/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(impact.locator('.impact-particle').first()).not.toBeVisible();
  await expect(impact.locator('.impact-halo')).not.toBeVisible();
  await seek(page, 5.6);
  await expect(impact).toHaveCount(0);
  await seek(page, 0.5);
  await expect(impact).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await expect(lanes).toHaveCount(5);
  await expect(page.getByLabel('Video', { exact: true })).toBeVisible();
});

test('STEP 单菜单动作互换、左右 HOLD 转 SWAY、跨度和撤销重做', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  const drawing = page.getByLabel('绘制类型');
  const selected = page.getByLabel('选中事件类型');
  await expect(drawing.locator('option')).toHaveText([
    'TAP',
    'LEG RAISE',
    'FOLLOW',
    'FOLLOW SWAY',
    'LEG HOLD',
    'SWAY',
    'SPIN',
  ]);
  await stepChoice(page, 'draw', 'right-hold');
  await page.getByLabel('绘制踏步跨度').selectOption('2');
  await draw(page, 1000, 'step', 3000);
  const original = (await exportChart(page)).notes[0];
  await expect(page.getByLabel('选中音符方向')).toHaveCount(0);
  for (const value of ['left-hold', 'right-sway', 'left-sway', 'free-sway', 'right-hold']) {
    await stepChoice(page, 'selected', value);
    const note = (await exportChart(page)).notes[0];
    expect(note).toMatchObject({
      id: original.id,
      timeMs: 1000,
      endTimeMs: 3000,
      kind: 'hold',
      direction: value.split('-')[0],
      modifier: value.endsWith('sway') ? 'sway' : 'none',
    });
    if (value === 'free-sway') expect(note.distance).toBeUndefined();
  }
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(selected).toHaveValue('sway');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(selected).toHaveValue('hold');
  for (const value of ['left-tap', 'right-tap']) {
    await stepChoice(page, 'selected', value);
    const note = (await exportChart(page)).notes[0];
    expect(note).toMatchObject({
      id: original.id,
      kind: 'tap',
      direction: value.split('-')[0],
      timeMs: 1000,
    });
    expect(note).not.toHaveProperty('endTimeMs');
    expect(note).not.toHaveProperty('modifier');
  }
  await selected.selectOption('free-sway');
  await expect(page.getByLabel('结束 / ms')).toHaveValue('1500');
  await drawing.selectOption('free-sway');
  await expect(page.getByLabel('绘制踏步跨度')).toHaveCount(0);
  await draw(page, 4000, 'step', 6000);
  const chart = await exportChart(page);
  expect(chart.notes[1]).toMatchObject({
    direction: 'free',
    kind: 'hold',
    modifier: 'sway',
    timeMs: 4000,
    endTimeMs: 6000,
  });
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'unified-step.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect(await exportChart(page)).toEqual(chart);
  if (await page.getByRole('button', { name: '关闭提示', exact: true }).isVisible())
    await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await page.getByTestId('editor-note').last().click();
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seek(page, 4.5);
  const target = page.getByTestId('target-step');
  await expect(target).toHaveAttribute('data-state', 'sway');
  await expect(target).toHaveAttribute('data-action', 'SPIN');
  await expect(
    page
      .getByTestId('lane-step')
      .locator('.player-hold[data-direction="free"] .hold-head .note-glyph'),
  ).toHaveAttribute('data-symbol', 'SPIN');
  await expect(
    page
      .getByTestId('lane-step')
      .locator('.player-hold[data-direction="free"] .hold-head .glyph--spin'),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/step-spin-1920.png' });
  await expect(target).toHaveCSS('color', 'rgb(246, 78, 147)');
  await seek(page, 6.1);
  await expect(page.getByTestId('lane-step').locator('.release-label')).toHaveText('RELEASE');
});

test('FOLLOW SWAY 紧接 FOLLOW，支持绘制、转换、录谱和持续并步箭头', async ({ page }) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  await stepChoice(page, 'draw', 'left-follow-sway');
  await expect(page.getByLabel('绘制类型').locator('option')).toHaveText([
    'TAP',
    'LEG RAISE',
    'FOLLOW',
    'FOLLOW SWAY',
    'LEG HOLD',
    'SWAY',
    'SPIN',
  ]);
  await expect(page.getByLabel('绘制踏步跨度')).toHaveCount(0);
  await draw(page, 1000, 'step', 3000);
  await expect(page.getByLabel('结束 / ms')).toHaveValue('3000');
  await page.getByRole('button', { name: '选中踏步用脚 BOTH', exact: true }).click();
  await page.keyboard.press('f');
  const selected = page.getByLabel('选中事件类型');
  await selected.selectOption('sway');
  await selected.selectOption('follow-sway');
  await expect(page.getByLabel('结束 / ms')).toHaveValue('3000');
  await expect(page.getByLabel('选中踏步跨度', { exact: true })).toHaveCount(0);
  let chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({
    kind: 'hold',
    modifier: 'sway',
    follow: true,
    direction: 'right',
    foot: 'both',
    timeMs: 1000,
    endTimeMs: 3000,
  });
  await stepChoice(page, 'draw', 'left-follow-sway');
  await draw(page, 4000, 'step');
  chart = await exportChart(page);
  expect(chart.notes[1]).toMatchObject({
    kind: 'hold',
    modifier: 'sway',
    follow: true,
    timeMs: 4000,
  });
  expect(chart.notes[1].kind === 'hold' && chart.notes[1].endTimeMs).toBeGreaterThan(4000);
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await seek(page, 6);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes.at(-1)).toMatchObject({
    kind: 'hold',
    modifier: 'sway',
    follow: true,
    direction: 'right',
  });
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'follow-sway.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  const lane = page.getByTestId('lane-step');
  await seek(page, 0.5);
  const sustain = lane.locator('[data-note-id="' + chart.notes[0].id + '"]');
  await expect(sustain).toHaveAttribute('data-action', 'FOLLOW SWAY');
  await expect(sustain.locator('.hold-head .follow-color')).toHaveCSS('fill', 'none');
  await expect(sustain.locator('.hold-head .follow-color')).toHaveCSS(
    'stroke',
    'rgb(181, 138, 238)',
  );
  await expect(sustain.locator('.ribbon-head-shape')).toHaveCount(0);
  await expect(sustain.locator('.ribbon-color')).toHaveCSS('fill', 'rgb(181, 138, 238)');
  await seek(page, 1.7);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-action', 'FOLLOW SWAY');
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'sway');
  await page.screenshot({ path: 'artifacts/step-follow-sway-game.png' });
  await seek(page, 3.1);
  await expect(lane.locator('.release-label')).toHaveText('RELEASE');
});

test('FOLLOW 自由放置、类型互换、Alt 录谱和保存重开，游戏显示虚线箭头', async ({ page }) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  const selected = page.getByLabel('选中事件类型');
  await stepChoice(page, 'draw', 'left-follow');
  await expect(page.getByLabel('绘制踏步跨度')).toHaveCount(0);
  await draw(page, 500, 'step', 1800);
  await expect(page.getByTestId('extend-note')).toHaveCount(0);
  await expect(page.getByLabel('结束 / ms')).toHaveCount(0);
  await page.getByRole('button', { name: '反转方向', exact: true }).click();
  await expect(selected).toHaveValue('follow');
  await stepChoice(page, 'selected', 'left-tap');
  await expect(page.getByTestId('extend-note')).toBeVisible();
  await stepChoice(page, 'selected', 'left-follow');
  for (const [type, time] of [
    ['left-tap', 2500],
    ['left-follow', 3000],
    ['right-tap', 4000],
    ['right-follow', 4500],
  ] as const) {
    await stepChoice(page, 'draw', type);
    await draw(page, time, 'step');
  }
  let chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({
    timeMs: 500,
    kind: 'tap',
    direction: 'left',
    follow: true,
  });
  expect(chart.notes.filter((n) => n.follow)).toHaveLength(3);
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await seek(page, 6);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('Alt');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Alt');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes.at(-1)).toMatchObject({ kind: 'tap', direction: 'right', follow: true });
  for (const note of chart.notes.filter((n) => n.follow)) {
    expect(note).not.toHaveProperty('endTimeMs');
    expect(note).not.toHaveProperty('distance');
  }
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'follow.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });

  await seek(page, 1.2);
  const follows = page.getByTestId('lane-step').locator('.player-note .glyph--follow');
  await expect(follows).toHaveCount(2);
  await expect(follows.first().locator('.follow-color')).toHaveCSS('fill', 'none');
  await expect(follows.first().locator('.follow-color')).toHaveCSS('stroke', 'rgb(53, 201, 219)');
  await expect(follows.last().locator('.follow-color')).toHaveCSS('stroke', 'rgb(246, 78, 147)');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(1.4);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});

test('导入旧谱彻底删除 C 三种形式，独立 SPIN 和左右不受影响', async ({ page }) => {
  const chart = await emptyEditor(page);
  const kept = [
    { id: 'l', lane: 'step', direction: 'left', kind: 'tap', timeMs: 1000 },
    {
      id: 'r',
      lane: 'step',
      direction: 'right',
      kind: 'hold',
      modifier: 'none',
      timeMs: 5000,
      endTimeMs: 6000,
    },
    {
      id: 'free',
      lane: 'step',
      direction: 'free',
      kind: 'hold',
      modifier: 'sway',
      timeMs: 7000,
      endTimeMs: 8000,
    },
  ];
  const legacy = {
    ...chart,
    notes: [
      ...kept,
      { id: 'c', lane: 'step', direction: 'close', kind: 'tap', timeMs: 2000 },
      {
        id: 'ch',
        lane: 'step',
        direction: 'close',
        kind: 'hold',
        modifier: 'none',
        timeMs: 3000,
        endTimeMs: 3500,
      },
      {
        id: 'cs',
        lane: 'step',
        direction: 'close',
        kind: 'hold',
        modifier: 'sway',
        timeMs: 4000,
        endTimeMs: 4500,
      },
    ],
  };
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'legacy-step.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.getByTestId('editor-note')).toHaveCount(3);
  const saved = await exportChart(page);
  expect(saved.notes).toEqual(kept);
  expect(JSON.stringify(saved)).not.toContain('close');
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  await expect(page.getByLabel('绘制类型').locator('option')).not.toContainText(['CLOSE']);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  for (const time of [2, 3.2, 4.2]) {
    await seek(page, time);
    await expect(page.locator('[data-direction="close"], .glyph--close')).toHaveCount(0);
    await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'idle');
  }
});

test('STEP 独立自由 SWAY、Shift 两格、Ctrl+Shift 摇摆，组合键与切轨不改变正在录的音符', async ({
  page,
}) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.keyboard.press('3');
  const start = async (seconds: number) => {
    await seek(page, seconds);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
  };
  const stop = () => page.getByRole('button', { name: 'Pause', exact: true }).click();
  await start(1);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await stop();
  await start(2);
  await page.keyboard.press('ArrowDown');
  await stop();
  await start(3);
  await page.keyboard.press('Shift+ArrowRight');
  await stop();
  await start(4);
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('Control');
  await stop();
  await start(5);
  await page.keyboard.down('Shift');
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await page.keyboard.press('5');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowLeft');
  await stop();
  await page.keyboard.press('3');
  await start(6);
  await page.keyboard.press('ArrowDown');
  await stop();
  await start(7);
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  await stop();
  await page.keyboard.press('2');
  await start(8);
  await page.keyboard.press('Shift+ArrowLeft');
  await stop();
  const chart = await exportChart(page);
  expect(chart.notes).toMatchObject([
    { lane: 'step', direction: 'left', kind: 'tap', stepAction: 'raise' },
    { lane: 'step', direction: 'left', kind: 'tap' },
    { lane: 'step', direction: 'free', kind: 'hold', modifier: 'sway' },
    { lane: 'step', direction: 'right', kind: 'tap', distance: 2 },
    { lane: 'step', direction: 'free', kind: 'hold', modifier: 'sway' },
    { lane: 'step', direction: 'left', kind: 'hold', modifier: 'sway', distance: 2 },
    { lane: 'step', direction: 'free', kind: 'hold', modifier: 'sway' },
    { lane: 'step', direction: 'right', kind: 'hold', modifier: 'none', distance: 2 },
    { lane: 'punch', direction: 'up_left', kind: 'tap' },
  ]);
  for (const i of [0, 1, 2, 4, 6, 8]) expect(chart.notes[i].distance).toBeUndefined();
  for (const i of [4, 5, 7]) {
    const note = chart.notes[i];
    expect(note.kind === 'hold' && note.endTimeMs - note.timeMs).toBeGreaterThan(250);
  }
});
