import { test, expect, seek, exportChart, emptyEditor, draw } from './helpers/editor';
import { LANES } from '../src/model';

test('自动 TAP / HOLD / Ctrl+SWAY、12345 切轨、慢放时长与未完成录入取消', async ({ page }) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 0.5;
  });
  await seek(page, 10);
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('2');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(60);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  let chart = await exportChart(page);
  expect(chart.notes).toHaveLength(1);
  expect(chart.notes[0]).toMatchObject({ lane: 'punch', kind: 'tap', direction: 'left' });
  expect(chart.notes[0].timeMs).toBeGreaterThanOrEqual(10000);
  expect(chart.notes[0].timeMs).toBeLessThan(12000);
  await seek(page, 12);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('1');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.press('4');
  await page.waitForTimeout(650);
  await page.keyboard.up('ArrowDown');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(2);
  expect(chart.notes[1]).toMatchObject({ lane: 'squat', kind: 'hold', modifier: 'none' });
  expect((chart.notes[1] as any).endTimeMs - chart.notes[1].timeMs).toBeGreaterThan(200);
  expect((chart.notes[1] as any).endTimeMs - chart.notes[1].timeMs).toBeLessThan(1000);
  await expect(page.getByRole('button', { name: '4 提踵', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await seek(page, 14);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.up('Control');
  await page.waitForTimeout(650);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('5');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  expect(chart.notes[2]).toMatchObject({
    lane: 'calf_raise',
    kind: 'hold',
    modifier: 'sway',
    direction: 'up',
  });
  expect(chart.notes[3]).toMatchObject({ lane: 'side_crunch', kind: 'tap', direction: 'right' });
  await page.getByLabel('吸附', { exact: true }).selectOption('1');
  await seek(page, 18);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(310);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(5);
  expect(chart.notes[4]).toMatchObject({
    kind: 'hold',
    modifier: 'none',
    timeMs: 18000,
    endTimeMs: 18500,
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('ArrowLeft');
  await seek(page, 50);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect((await exportChart(page)).notes).toHaveLength(5);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.keyboard.up('ArrowLeft');
  expect((await exportChart(page)).notes).toHaveLength(5);
});

test('五轨录谱方向键不被下拉框或滑块吞掉，保留点按长按与 Ctrl 摇摆 @smoke', async ({ page }) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await draw(page, 500, 'squat');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await seek(page, 1);
  await page.getByLabel('吸附', { exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.locator('video').evaluate((video) => {
    video.dataset.seekCount = '0';
    video.addEventListener('seeking', () => {
      video.dataset.seekCount = String(Number(video.dataset.seekCount) + 1);
    });
  });
  let count = 1;
  for (const [index, lane] of LANES.entries()) {
    await page.getByLabel('吸附', { exact: true }).focus();
    await page.keyboard.press(String(index + 1));
    await expect(page.locator(`.lane-picks [data-lane="${lane.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const keys =
      lane.id === 'squat' || lane.id === 'calf_raise'
        ? ['ArrowUp', 'ArrowDown']
        : ['ArrowLeft', 'ArrowRight'];
    await page.getByLabel('选中事件类型').focus();
    await page.keyboard.press(keys[0]);
    await page.getByLabel('Playback position').focus();
    await page.keyboard.press(keys[1]);
    await page.getByLabel('Volume', { exact: true }).focus();
    await page.keyboard.down(keys[0]);
    await page.waitForTimeout(320);
    await page.keyboard.up(keys[0]);
    await page.getByLabel('吸附', { exact: true }).focus();
    await page.keyboard.down('Control');
    await page.keyboard.down(keys[1]);
    await page.waitForTimeout(320);
    await page.keyboard.up(keys[1]);
    await page.keyboard.up('Control');
    count += 4;
    await expect(page.locator('.timeline-footer')).toContainText(`${count} 音符`);
  }
  await expect(page.getByLabel('吸附', { exact: true })).toHaveValue('0');
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1);
  await expect(page.locator('video')).toHaveAttribute('data-seek-count', '0');
  await page.getByLabel('开始 / ms').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.timeline-footer')).toContainText(`${count} 音符`);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const chart = await exportChart(page);
  for (const lane of LANES) {
    const notes = chart.notes.filter((n) => n.lane === lane.id && n.timeMs > 500);
    expect(notes).toHaveLength(4);
    expect(notes.map((n) => n.kind)).toEqual(['tap', 'tap', 'hold', 'hold']);
    expect(notes[2]).toMatchObject({ modifier: 'none' });
    expect(notes[3]).toMatchObject({ modifier: 'sway' });
    const dirs =
      lane.id === 'squat' || lane.id === 'calf_raise' ? ['up', 'down'] : ['left', 'right'];
    expect(notes.map((n) => n.direction)).toEqual([dirs[0], dirs[1], dirs[0], dirs[1]]);
  }
});
