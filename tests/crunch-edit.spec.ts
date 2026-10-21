import { readSongs } from './helpers/library';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blankChart, type Chart } from '../src/model';
import { importDemo, insertAlbum, holdStart, lastDraft } from './helpers/project';

async function exported(page: Page): Promise<Chart> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}

test('SIDE CRUNCH direction, leg colour, note type, H and recording are independent', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }),
  );
  await page.goto('/');
  const chart = blankChart('Cross-body crunch');
  chart.notes = [
    { id: 'legacy', lane: 'side_crunch', direction: 'left', kind: 'tap', timeMs: 1000 },
  ];
  await importDemo(page, chart);
  await page.locator('[data-event="legacy"]').click();
  await page.getByRole('button', { name: '选中侧收腹方向 →', exact: true }).click();
  let saved = await exported(page);
  expect(saved.notes[0]).toMatchObject({ direction: 'right', foot: 'left' });
  await page.getByRole('button', { name: '选中侧收腹用腿 R', exact: true }).click();
  await page.getByRole('button', { name: '选中侧收腹方向 ←', exact: true }).click();
  await page.getByLabel('选中事件类型').selectOption('sway');
  await page.keyboard.press('h');
  saved = await exported(page);
  expect(saved.notes[0]).toMatchObject({
    direction: 'left',
    foot: 'left',
    kind: 'hold',
    modifier: 'sway',
  });
  await page.keyboard.press('Control+z');
  saved = await exported(page);
  expect(saved.notes[0]).toMatchObject({
    direction: 'left',
    foot: 'right',
    kind: 'hold',
    modifier: 'sway',
  });
  expect(
    await page
      .locator('[data-event="legacy"]')
      .evaluate((n) => (n as HTMLElement).style.getPropertyValue('--lane')),
  ).toBe('var(--pink)');

  await page.locator('.lane-picks [data-lane="side_crunch"]').click();
  await page.getByRole('button', { name: '录入用腿 L', exact: true }).click();
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('6000');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('h');
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  saved = await exported(page);
  expect(saved.notes.slice(1)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ lane: 'side_crunch', direction: 'right', foot: 'left' }),
      expect.objectContaining({ lane: 'side_crunch', direction: 'left', foot: 'right' }),
    ]),
  );

  const video = page.locator('video');
  const originalVideo = (await video.elementHandle())!;
  const position = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停游戏', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: 'PAUSED', exact: true });
  await expect(pause).toBeVisible();
  await expect(pause.locator('.pause-option')).toHaveText([
    'BACK TO SELECT',
    'RESTART',
    'EDIT IN STUDIO',
  ]);
  await page.keyboard.press('ArrowUp');
  await expect(pause.getByRole('button', { name: 'EDIT IN STUDIO', exact: true })).toHaveAttribute(
    'data-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '试玩谱面', exact: true })).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    position,
    true,
  ]);
  expect(await originalVideo.evaluate((v) => v.isConnected)).toBe(true);
  expect((await exported(page)).notes).toEqual(saved.notes);
});

test('editing a published song from pause protects its draft and keeps the video position', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }),
  );
  await page.goto('/');
  const chart = blankChart('Published crunch');
  chart.notes = [
    { id: 'crunch', lane: 'side_crunch', direction: 'left', kind: 'tap', timeMs: 1000 },
  ];
  await importDemo(page, chart);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const published = await exported(page);
  await page.locator('[data-event="crunch"]').click();
  await page.getByRole('button', { name: '选中侧收腹用腿 R', exact: true }).click();
  const draft = await exported(page);
  await page.getByRole('button', { name: '音游模式', exact: true }).click();
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await page.locator('.record-select').click();
  await holdStart(page);
  await expect(page.locator('.ready-countdown')).toHaveCount(0, { timeout: 15000 });
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('12500');
  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: 'PAUSED', exact: true });
  await expect(pause).toBeVisible();
  const video = page.locator('video');
  const originalVideo = (await video.elementHandle())!;
  const position = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  page.once('dialog', (dialog) => dialog.dismiss());
  await pause.getByRole('button', { name: 'EDIT IN STUDIO', exact: true }).click();
  await page.waitForTimeout(200);
  await expect(pause).toBeVisible();
  expect((await lastDraft(page))?.notes).toEqual(draft.notes);
  page.once('dialog', (dialog) => dialog.accept());
  await pause.getByRole('button', { name: 'EDIT IN STUDIO', exact: true }).click();
  await expect(page.getByRole('button', { name: '试玩谱面', exact: true })).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    position,
    true,
  ]);
  expect(await originalVideo.evaluate((v) => v.isConnected)).toBe(true);
  expect((await exported(page)).notes).toEqual(published.notes);
  const release = (await readSongs(page)).find((song) => song.id === published.songId)!.released
    .dance!.chart;
  expect(release.notes).toEqual(published.notes);
});
