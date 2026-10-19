import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Chart } from '../src/model';
import { playableChart } from '../src/play-range';
import { createCalorieIndex } from '../src/calories';
import { comboAt, createComboIndex } from '../src/combo';

async function exported(page: Page): Promise<Chart> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}

async function prepare(page: Page, crossing = false) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
    const Audio = window.Audio;
    Object.assign(window, { rangeAudio: [] });
    window.Audio = class extends Audio {
      constructor() {
        super();
        (window as unknown as { rangeAudio: HTMLAudioElement[] }).rangeAudio.push(this);
      }
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /创作模式/ }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await chooser).setFiles('tests/fixtures/bpm-148.mp4');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const chart = await exported(page);
  chart.title = 'Selected video range';
  chart.videoOffsetMs = crossing ? 0 : 500;
  chart.notes = crossing
    ? [
        {
          id: 'cross-hold',
          lane: 'squat',
          direction: 'down',
          kind: 'hold',
          modifier: 'none',
          timeMs: 2000,
          endTimeMs: 6000,
        },
        { id: 'inside-tap', lane: 'squat', direction: 'up', kind: 'tap', timeMs: 7000 },
      ]
    : [
        { id: 'outside-before', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1500 },
        { id: 'inside-tap', lane: 'squat', direction: 'up', kind: 'tap', timeMs: 4500 },
        {
          id: 'inside-hold',
          lane: 'calf_raise',
          direction: 'up',
          kind: 'hold',
          modifier: 'none',
          timeMs: 6500,
          endTimeMs: 9500,
        },
        { id: 'at-end', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 10500 },
        {
          id: 'outside-after',
          lane: 'squat',
          direction: 'down',
          kind: 'hold',
          modifier: 'sway',
          timeMs: 12500,
          endTimeMs: 14500,
        },
      ];
  chart.specialMove = { name: 'STAR', icon: 'star', previewBeats: 2 };
  chart.specialEvents = crossing
    ? [{ id: 'cross-special', timeMs: 9000, endTimeMs: 12000 }]
    : [{ id: 'inside-special', timeMs: 7500, endTimeMs: 8500 }];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'range.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  const end = page.getByRole('textbox', { name: '游玩结束', exact: true });
  await end.fill('00:10');
  await end.press('Enter');
  const start = page.getByRole('textbox', { name: '游玩开始', exact: true });
  await start.fill('00:03');
  await start.press('Enter');
  await page.getByLabel('所属专辑').selectOption('touhou');
  return chart;
}

test('保存游玩范围，终点红线跟随偏移，发布、试听和音游仅使用该区间', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const original = await prepare(page);
  const range = page.getByRole('region', { name: '游玩区间', exact: true });
  await expect(range).toContainText('游玩 00:07');
  const line = page.getByRole('img', { name: '游玩终点 00:10.000' });
  await expect(line).toBeVisible();
  await expect(line).toHaveCSS('background-color', 'rgb(255, 59, 79)');
  // The timeline uses chart time: a +500 ms offset moves the marker, not the video cut.
  const lineTime = await line.evaluate((node) => {
    const atEnd = document.querySelector<HTMLElement>('[data-event="at-end"]')!;
    return {
      left: parseFloat((node as HTMLElement).style.left),
      noteLeft: parseFloat(atEnd.style.left),
    };
  });
  expect(lineTime.left).toBeCloseTo(lineTime.noteLeft, 5);
  const saved = await exported(page);
  expect(saved.playRange).toEqual({ startMs: 3000, endMs: 10000 });
  expect(saved.notes).toEqual(original.notes);
  const video = page.locator('video');
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('17000');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(17, 2);
  await page.getByRole('button', { name: '切换日夜主题', exact: true }).click();
  await range.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/play-range-editor-1080p.png' });
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('00:03–00:10');
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A later draft change must leave the released range intact.
  await page.getByRole('textbox', { name: '游玩结束', exact: true }).fill('00:09');
  await page.getByRole('textbox', { name: '游玩结束', exact: true }).press('Enter');
  await page.getByRole('button', { name: '音游模式', exact: true }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.collection-album').first().click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const card = page.locator('.record-card[aria-current="true"]');
  await expect(card.locator('.record-timing')).toContainText('00:07');
  const playable = playableChart(saved);
  const calories = (createCalorieIndex(playable.notes).at(-1)?.kcal ?? 0).toFixed(1);
  await expect(card.locator('.record-overline')).toContainText(calories);
  const previewTime = () =>
    page.evaluate(
      () => (window as unknown as { rangeAudio: HTMLAudioElement[] }).rangeAudio[1].currentTime,
    );
  await expect.poll(previewTime).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => {
    (window as unknown as { rangeAudio: HTMLAudioElement[] }).rangeAudio[1].currentTime = 9.99;
  });
  await expect.poll(previewTime).toBeLessThan(4);
  await card.locator('.record-select').click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '开始倒计时' })).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(3, 2);
  await expect(page.getByRole('dialog', { name: '开始倒计时' })).toBeHidden();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  const seek = page.getByRole('slider', { name: 'Playback position', exact: true });
  await expect(seek).toHaveAttribute('min', '3000');
  await expect(seek).toHaveAttribute('max', '10000');
  await seek.fill('9800');
  await expect(page.locator('[data-note-id="outside-after"]')).toHaveCount(0);
  await expect(page.locator('[data-note-id="at-end"]')).toHaveCount(0);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(10, 2);
  await expect(page.locator('.time-readout.total')).toHaveText('00:07');
  await expect(page.getByTestId('current-time')).toHaveText('00:07');
  await expect(page.locator('.combo-stat strong')).toHaveText(
    String(comboAt(createComboIndex(playable), 10500)).padStart(3, '0'),
  );
  await expect(page.locator('.calorie-stat')).toContainText(calories);
  await page.screenshot({ path: 'artifacts/play-range-game-end-1080p.png' });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(4);
  await page.reload();
  await page.getByRole('button', { name: /创作模式/ }).click();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '游玩结束', exact: true })).toHaveValue(
    '00:09.000',
  );
  await expect(
    page.getByRole('slider', { name: 'Playback position', exact: true }),
  ).toHaveAttribute('max', '20000');
  expect((await exported(page)).notes).toEqual(original.notes);
  expect(errors).toEqual([]);
});

test('拒绝无效区间，跨边界的 HOLD 和 SPECIAL 发布前可定位，恢复完整视频可撤销', async ({
  page,
}) => {
  await prepare(page, true);
  const end = page.getByRole('textbox', { name: '游玩结束', exact: true });
  await end.fill('00:21');
  await end.press('Enter');
  await expect(end).toHaveValue('00:10.000');
  await expect(page.getByRole('status')).toContainText('不能超出视频');
  await end.fill('00:02');
  await end.press('Enter');
  await expect(end).toHaveValue('00:10.000');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled();
  await expect(dialog.locator('.play-range-issue-list button')).toHaveCount(2);
  await page.screenshot({ path: 'artifacts/play-range-publish-crossing-1080p.png' });
  await dialog.getByRole('button', { name: '定位 HOLD 00:02.000', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: '开始 / ms', exact: true })).toHaveValue(
    '2000',
  );
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(
    2,
    2,
  );
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByRole('button', { name: '完整视频', exact: true }).click();
  await expect(page.locator('.play-range-end')).toHaveCount(0);
  await expect(end).toHaveValue('00:20.000');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(end).toHaveValue('00:10.000');
  const chart = await exported(page);
  expect(chart.notes.find((note) => note.id === 'cross-hold')).toMatchObject({
    timeMs: 2000,
    endTimeMs: 6000,
  });
  expect(chart.specialEvents[0]).toMatchObject({ timeMs: 9000, endTimeMs: 12000 });
  const seek = page.getByRole('slider', { name: 'Playback position', exact: true });
  await seek.fill('4500');
  await page.getByRole('button', { name: '当前位置设为游玩起点', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '游玩开始', exact: true })).toHaveValue(
    '00:04.500',
  );
  await seek.fill('9000');
  await page.getByRole('button', { name: '当前位置设为游玩终点', exact: true }).click();
  await expect(end).toHaveValue('00:09.000');
});
