import { test, expect, stepChoice, seek, exportChart, emptyEditor, draw } from './helpers/editor';
import { lastDraft } from './helpers/project';
import type { Page } from '@playwright/test';

test('鼠标做谱、长条属性、拖动缩放、撤销、复制和 JSON 往返', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '2 手臂', exact: true }).click();
  await page.getByRole('button', { name: '绘制手臂动作 →', exact: true }).click();
  await draw(page, 3000, 'punch');
  await expect(page.getByTestId('editor-note')).toHaveCount(1);
  let chart = await exportChart(page);
  expect(chart.notes[0].direction).toBe('right');
  expect(chart.notes[0].timeMs).toBe(3000);
  await draw(page, 1000, 'squat', 2500);
  await expect(page.getByTestId('editor-note')).toHaveCount(2);
  await page.getByLabel('选中事件类型').selectOption('sway');
  chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({
    kind: 'hold',
    timeMs: 1000,
    endTimeMs: 2500,
    modifier: 'sway',
  });
  const hold = page.locator('.timeline-event.long');
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 14);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 14, { steps: 5 });
  await page.mouse.up();
  chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({ timeMs: 1500, endTimeMs: 3000 });
  const endBox = (await hold.locator('[data-handle="end"]').boundingBox())!;
  await page.mouse.move(endBox.x + 3, endBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(endBox.x + 53, endBox.y + 10, { steps: 5 });
  await page.mouse.up();
  chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({ timeMs: 1500, endTimeMs: 3500 });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByLabel('结束 / ms')).toHaveValue('3000');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByLabel('结束 / ms')).toHaveValue('3500');
  await page.getByRole('button', { name: '复制到后面', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(3);
  await page.getByRole('button', { name: '删除选中', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'roundtrip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect(await exportChart(page)).toEqual(chart);
});

test('选中单个 TAP 直接拉长为 HOLD，支持 STEP、吸附、取消和一次撤销', async ({ page }) => {
  await emptyEditor(page);
  await draw(page, 1000, 'squat');
  const tap = (await exportChart(page)).notes[0];
  const handle = page.getByTestId('extend-note');
  await expect(handle).toBeVisible();
  await handle.click();
  expect((await exportChart(page)).notes).toEqual([tap]);
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  const surface = page.locator('.timeline-surface');
  const handleBox = (await handle.boundingBox())!;
  const surfaceBox = (await surface.boundingBox())!;
  await page.mouse.move(handleBox.x + 6, handleBox.y + 10);
  await page.mouse.down();
  // 2470 ms snaps to 2500 ms, while the original 1000 ms start remains fixed.
  await page.mouse.move(surfaceBox.x + 124 + 247, handleBox.y + 10, { steps: 8 });
  await expect(page.getByTestId('editor-note')).toHaveClass(/long/);
  await page.mouse.up();
  const extended = { ...tap, kind: 'hold', endTimeMs: 2500, modifier: 'none' };
  expect((await exportChart(page)).notes).toEqual([extended]);
  await expect(page.getByLabel('开始 / ms')).toHaveValue('1000');
  await expect(page.getByLabel('结束 / ms')).toHaveValue('2500');
  await expect(handle).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual([tap]);
  await expect(handle).toBeVisible();
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual([extended]);
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  await stepChoice(page, 'draw', 'right-tap');
  await draw(page, 4000, 'step');
  const step = (await exportChart(page)).notes[1];
  await expect(handle).toBeVisible();
  const stepBox = (await handle.boundingBox())!;
  // Moving vertically or returning to the original grip keeps a TAP.
  await page.mouse.move(stepBox.x + 6, stepBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(stepBox.x + 6, stepBox.y + 30, { steps: 3 });
  await page.mouse.up();
  expect((await exportChart(page)).notes[1]).toEqual(step);
  await page.mouse.move(stepBox.x + 6, stepBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(stepBox.x + 100, stepBox.y + 10, { steps: 4 });
  await page.mouse.move(stepBox.x + 6, stepBox.y + 10, { steps: 4 });
  await page.mouse.up();
  expect((await exportChart(page)).notes[1]).toEqual(step);
  // Native pointer cancellation must also discard the conversion preview.
  await page.mouse.move(stepBox.x + 6, stepBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(stepBox.x + 100, stepBox.y + 10, { steps: 4 });
  await surface.dispatchEvent('pointercancel');
  await page.mouse.up();
  expect((await exportChart(page)).notes[1]).toEqual(step);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.mouse.move(stepBox.x + 6, stepBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(surfaceBox.x + 124 + 583, stepBox.y + 10, { steps: 6 });
  await page.mouse.up();
  let chart = await exportChart(page);
  expect(chart.notes[1]).toEqual({ ...step, kind: 'hold', endTimeMs: 5830, modifier: 'none' });
  await stepChoice(page, 'selected', 'right-sway');
  chart = await exportChart(page);
  expect(chart.notes[1]).toMatchObject({ lane: 'step', direction: 'right', modifier: 'sway' });
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'extended.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect(await exportChart(page)).toEqual(chart);
  await draw(page, 6500, 'calf_raise');
  await page.keyboard.down('Shift');
  await page
    .getByTestId('editor-note')
    .first()
    .click({ position: { x: 15, y: 14 } });
  await page.keyboard.up('Shift');
  await expect(page.locator('.timeline-event.selected')).toHaveCount(2);
  await expect(handle).toHaveCount(0);
});

test('分段节拍、唯一 SPECIAL 重复事件、网格修改不移动音符', async ({ page }) => {
  await emptyEditor(page);
  await draw(page, 2000, 'calf_raise');
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  await page.getByLabel('BPM', { exact: true }).fill('150');
  await page.getByLabel('BPM', { exact: true }).press('Tab');
  await seek(page, 34);
  await page.getByRole('button', { name: '当前位置新增段', exact: true }).click();
  await page.getByLabel('拍号').selectOption('3/4');
  await expect(page.getByLabel('本段 Offset / ms')).toHaveValue('34000');
  let chart = await exportChart(page);
  expect(chart.tempoSegments).toHaveLength(2);
  expect(chart.notes[0].timeMs).toBe(2000);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('启用本曲 SPECIAL').check();
  await page.getByLabel('招牌动作名称').fill('HEART POSE');
  await page.getByLabel('招牌动作名称').press('Tab');
  await draw(page, 4000, 'special', 4800);
  await page.getByRole('button', { name: '复制到后面', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.specialMove?.name).toBe('HEART POSE');
  expect(chart.specialEvents).toHaveLength(2);
  expect(chart.specialEvents.every((e) => e.endTimeMs! > e.timeMs)).toBe(true);
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'special.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect(await exportChart(page)).toEqual(chart);
});

test('方向翻转按钮和 F、多选撤销、同轴跨轨拖动与长条属性保留', async ({ page }) => {
  await emptyEditor(page);
  await draw(page, 1000, 'squat', 2000);
  await page.getByLabel('选中事件类型').selectOption('sway');
  await page.getByRole('button', { name: '反转方向', exact: true }).click();
  expect((await exportChart(page)).notes[0]).toMatchObject({ direction: 'up', modifier: 'sway' });
  await page.keyboard.press('f');
  expect((await exportChart(page)).notes[0].direction).toBe('down');
  const dragLane = async (note: ReturnType<Page['getByTestId']>, rows: number) => {
    const box = (await note.boundingBox())!;
    await page.mouse.move(box.x + 15, box.y + 14);
    await page.mouse.down();
    await page.mouse.move(box.x + 15, box.y + 14 + rows * 54, { steps: 6 });
    await page.mouse.up();
  };
  await dragLane(page.getByTestId('editor-note').first(), 3);
  let chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({
    lane: 'calf_raise',
    direction: 'down',
    timeMs: 1000,
    endTimeMs: 2000,
    modifier: 'sway',
  });
  await page.keyboard.press('Control+z');
  expect((await exportChart(page)).notes[0].lane).toBe('squat');
  await page.keyboard.press('Control+Shift+z');
  await dragLane(page.getByTestId('editor-note').first(), -3);
  expect((await exportChart(page)).notes[0].lane).toBe('squat');
  await dragLane(page.getByTestId('editor-note').first(), 1);
  expect((await exportChart(page)).notes[0]).toMatchObject({ lane: 'punch', armAction: 'reach' });
  await dragLane(page.getByTestId('editor-note').first(), -1);
  await page.locator('.lane-picks [data-lane="punch"]').click();
  await page.getByRole('button', { name: '绘制手臂动作 ←', exact: true }).click();
  await draw(page, 3000, 'punch');
  await dragLane(page.getByTestId('editor-note').last(), 3);
  expect((await exportChart(page)).notes[1].lane).toBe('side_crunch');
  await dragLane(page.getByTestId('editor-note').last(), -3);
  expect((await exportChart(page)).notes[1].lane).toBe('punch');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('f');
  chart = await exportChart(page);
  expect(chart.notes.map((n) => n.direction)).toEqual(['up', 'right']);
  await page.keyboard.press('Control+z');
  expect((await exportChart(page)).notes.map((n) => n.direction)).toEqual(['down', 'left']);
});

test('跟随默认锁定，编辑与空格暂停不取消，解锁后可手动关闭', async ({ page }) => {
  await emptyEditor(page);
  const lock = page.getByRole('button', { name: '锁定跟随', exact: true });
  const follow = page.getByRole('checkbox', { name: '跟随', exact: true });
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(follow).toBeChecked();
  await expect(follow).toBeDisabled();
  await draw(page, 1000, 'squat');
  await expect(follow).toBeChecked();
  await seek(page, 30);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('.timeline-scroll').evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(2000);
  await lock.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(follow).toBeChecked();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await lock.click();
  await follow.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(follow).toBeChecked();
  await follow.uncheck();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(follow).not.toBeChecked();
  await lock.click();
  await expect(follow).toBeChecked();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  for (const [key, label] of [
    ['1', '1 蹲起'],
    ['4', '4 提踵'],
    ['2', '2 手臂'],
    ['3', '3 踏步'],
    ['5', '5 侧收腹'],
  ]) {
    await page.keyboard.press(key);
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
});

test('非法谱面不丢编辑、未保存保护、自动草稿、720p 和 1080p 布局', async ({ page }) => {
  await emptyEditor(page);
  await draw(page, 2000, 'squat');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByTestId('editor-note')).toHaveCount(1);
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":999}'),
  });
  await expect(page.getByRole('status')).toContainText('不支持此谱面版本');
  await expect(page.getByTestId('editor-note')).toHaveCount(1);
  await expect.poll(async () => (await lastDraft(page))?.notes.length).toBe(1);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await expect(page.locator('.timeline-scroll')).toBeVisible();
  }
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.getByRole('status')).not.toBeVisible();
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
  }
});

test('框选、键盘粘贴、输入框隔离和浏览器草稿恢复', async ({ page }) => {
  await emptyEditor(page);
  await draw(page, 1000, 'calf_raise');
  await draw(page, 1500, 'side_crunch');
  await page.getByRole('button', { name: '选择工具', exact: true }).click();
  const box = (await page.locator('.timeline-surface').boundingBox())!;
  await page.mouse.move(box.x + 195, box.y + 196);
  await page.mouse.down();
  await page.mouse.move(box.x + 315, box.y + 297, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.timeline-event.selected')).toHaveCount(2);
  await page.keyboard.press('Control+c');
  await seek(page, 5);
  await page.keyboard.press('Control+v');
  let chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  expect(chart.notes.slice(2).map((n) => n.timeMs)).toEqual([5000, 5500]);
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('BPM', { exact: true }).focus();
  await page.keyboard.press('ArrowUp');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  await page.getByLabel('BPM', { exact: true }).fill('133');
  await page.getByLabel('BPM', { exact: true }).press('Tab');
  await expect.poll(async () => (await lastDraft(page))?.tempoSegments[0]?.bpm).toBe(133);
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: /创作模式/ }).click();
  await expect(page.getByRole('heading', { name: '浏览器测试作品' })).toBeVisible();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  expect(chart.tempoSegments[0].bpm).toBe(133);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});
