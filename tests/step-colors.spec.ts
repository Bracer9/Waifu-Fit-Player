import { openDemo, editInStudio } from './helpers/project';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Chart } from '../src/model';
import { draw } from './helpers/editor';

test('STEP separates type, direction and foot color in editing, recording and gameplay', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined, configurable: true }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await openDemo(page);
  await editInStudio(page);
  const save = async (): Promise<Chart> => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
    return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  };
  const load = async (chart: Chart) => {
    await page.getByLabel('导入谱面文件').setInputFiles({
      name: 'step-colors.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(chart)),
    });
    await expect(page.getByRole('heading', { name: chart.title, exact: true })).toBeVisible();
  };
  const seek = async (seconds: number) => {
    await page.locator('video').evaluate((v: HTMLVideoElement, time) => {
      v.currentTime = time;
    }, seconds);
    await expect
      .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.seeking))
      .toBe(false);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  const chart = await save();
  chart.title = 'STEP COLORS';
  chart.specialEvents = [];
  chart.notes = [
    { id: 'tap', lane: 'step', direction: 'left', foot: 'right', timeMs: 3000, kind: 'tap' },
    {
      id: 'follow',
      lane: 'step',
      direction: 'right',
      foot: 'left',
      timeMs: 4000,
      kind: 'tap',
      follow: true,
    },
    {
      id: 'hold',
      lane: 'step',
      direction: 'left',
      foot: 'right',
      timeMs: 5000,
      endTimeMs: 6500,
      kind: 'hold',
      modifier: 'none',
    },
    {
      id: 'sway',
      lane: 'step',
      direction: 'left',
      foot: 'left',
      timeMs: 7000,
      endTimeMs: 8500,
      kind: 'hold',
      modifier: 'sway',
    },
    {
      id: 'free',
      lane: 'step',
      direction: 'free',
      foot: 'both',
      timeMs: 9000,
      endTimeMs: 10500,
      kind: 'hold',
      modifier: 'sway',
    },
  ];
  await load(chart);
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  await expect(page.getByLabel('绘制类型').locator('option')).toHaveText([
    'TAP',
    'LEG RAISE',
    'FOLLOW',
    'FOLLOW SWAY',
    'LEG HOLD',
    'SWAY',
    'SPIN',
  ]);
  await expect(
    page.getByRole('group', { name: '录入用脚', exact: true }).getByRole('button'),
  ).toHaveText(['L', 'R', 'BOTH']);
  await page.getByTestId('editor-note').first().click();
  await page.getByRole('button', { name: '选中踏步用脚 L', exact: true }).click();
  await page.keyboard.press('f');
  expect((await save()).notes[0]).toMatchObject({ direction: 'right', foot: 'left' });
  await page.keyboard.press('h');
  for (const type of ['hold', 'sway', 'free-sway', 'follow', 'follow-sway', 'tap']) {
    await page.getByLabel('选中事件类型').selectOption(type);
    expect((await save()).notes[0].foot).toBe('right');
  }
  await page.getByRole('button', { name: '选中踏步用脚 BOTH', exact: true }).click();
  for (const type of ['free-sway', 'follow', 'follow-sway', 'hold', 'sway', 'tap']) {
    await page.getByLabel('选中事件类型').selectOption(type);
    expect((await save()).notes[0].foot).toBe('both');
  }
  await page.getByRole('button', { name: '选中踏步用脚 R', exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: '选中踏步用脚 R', exact: true }).click();
  expect((await save()).notes.every((n) => n.foot === 'right')).toBe(true);
  await page.keyboard.press('h');
  expect((await save()).notes.every((n) => n.foot === 'both')).toBe(true);
  await page.keyboard.press('h');
  expect((await save()).notes.every((n) => n.foot === 'left')).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '录入用脚 BOTH', exact: true }).click();
  await page.getByLabel('绘制类型').selectOption('free-sway');
  await draw(page, 15000, 'step', 16000);
  expect((await save()).notes.find((n) => n.timeMs === 15000)).toMatchObject({
    direction: 'free',
    foot: 'both',
    kind: 'hold',
    modifier: 'sway',
    endTimeMs: 16000,
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '5 侧收腹', exact: true }).click();
  await expect(
    page.getByRole('group', { name: '录入用腿', exact: true }).getByRole('button'),
  ).toHaveText(['L', 'R']);
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  await page.getByRole('button', { name: '录入用脚 R', exact: true }).click();
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await seek(20);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('h');
  await page.keyboard.press('Alt+ArrowRight');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.press('h');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Control');
  await page.getByRole('button', { name: '录入用脚 BOTH', exact: true }).click();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const recorded = (await save()).notes.filter((n) => n.timeMs >= 20000);
  expect(recorded).toMatchObject([
    { direction: 'left', kind: 'tap', foot: 'right' },
    { direction: 'right', kind: 'tap', follow: true, foot: 'both' },
    { direction: 'left', kind: 'hold', modifier: 'none', foot: 'both' },
    { direction: 'right', kind: 'hold', modifier: 'sway', foot: 'left' },
    { direction: 'free', kind: 'hold', modifier: 'sway', foot: 'both' },
  ]);
  await load(chart);
  expect((await save()).notes).toEqual(chart.notes);
  await page.getByRole('button', { name: '3 踏步', exact: true }).click();
  await page.getByTestId('editor-note').first().click();
  await page.screenshot({ path: 'artifacts/step-colors-editor.png', fullPage: true });
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();

  const lane = page.getByTestId('lane-step');
  await seek(2.5);
  await expect(lane.locator('[data-note-id="tap"] .glyph-body')).toHaveCSS(
    'stroke',
    'rgb(246, 78, 147)',
  );
  await expect(lane.locator('[data-note-id="follow"] .follow-color')).toHaveCSS(
    'stroke',
    'rgb(53, 201, 219)',
  );
  await page.screenshot({ path: 'artifacts/step-colors-tap-follow-game.png' });
  await seek(5.8);
  await expect(lane.locator('[data-note-id="hold"] .ribbon-color')).toHaveCSS(
    'fill',
    'rgb(246, 78, 147)',
  );
  await expect(lane.locator('[data-note-id="sway"] .ribbon-color')).toHaveCSS(
    'fill',
    'rgb(53, 201, 219)',
  );
  await page.screenshot({ path: 'artifacts/step-colors-sustains-game.png' });
  await seek(9.5);
  await expect(page.getByTestId('target-step')).toHaveCSS('color', 'rgb(181, 138, 238)');
  await expect(lane.locator('[data-note-id="free"] .ribbon-color')).toHaveCSS(
    'fill',
    'rgb(181, 138, 238)',
  );
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-action', 'SPIN');
  expect(errors).toEqual([]);
});
