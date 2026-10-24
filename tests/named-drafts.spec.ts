import { test, expect, draw, exportChart } from './helpers/editor';
import { importDemo } from './helpers/project';
import { blankChart } from '../src/model';
import type { Song } from '../src/library';

async function nameDraft(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: '保存选项', exact: true }).click();
  await page.getByRole('menuitem', { name: '另存为…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '另存为草稿', exact: true });
  await dialog.getByLabel('草稿名称', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function stored(page: import('@playwright/test').Page): Promise<Song> {
  return (await (await page.request.get('/__wfp/maps')).json()).songs[0];
}
test('named drafts survive reload, save-as preserves the first version, and selecting a version loads its actual notes', async ({
  page,
  browser,
}) => {
  const chart = blankChart('命名草稿检查');
  chart.chartType = 'fitness';
  chart.tempoSegments = [{ id: 't', anchorMs: 0, bpm: 120, meter: '4/4' }];
  chart.notes = [{ id: 'original', lane: 'squat', kind: 'tap', direction: 'down', timeMs: 1000 }];
  await importDemo(page, chart);
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '另存为草稿', exact: true })).toHaveCount(0);
  expect((await stored(page)).namedDrafts ?? []).toHaveLength(0);
  await nameDraft(page, '初版');
  const first = (await stored(page)).namedDrafts!.find((d) => d.name === '初版')!;
  await draw(page, 4000, 'calf_raise');
  await expect.poll(async () => (await stored(page)).drafts.fitness!.chart.notes.length).toBe(2);
  expect((await stored(page)).namedDrafts!.find((d) => d.name === '初版')!.chart).toEqual(
    first.chart,
  );
  await nameDraft(page, '换段修订版');
  let song = await stored(page);
  const second = song.namedDrafts!.find((d) => d.name === '换段修订版')!;
  expect(song.namedDrafts).toHaveLength(2);
  expect(second.chart.notes).toHaveLength(2);
  expect(song.namedDrafts!.find((d) => d.id === first.id)!.chart).toEqual(first.chart);
  await page.reload();
  await page.locator('.create-mode').click();
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  let manager = page.getByRole('dialog', { name: '本地作品', exact: true });
  let row = manager
    .locator('.managed-edition')
    .filter({ has: page.locator('b', { hasText: 'FITNESS' }) });
  await row.getByRole('combobox').selectOption({ label: '初版' });
  await page.screenshot({ path: 'artifacts/named-drafts-2026-10-23/manager-1920.png' });
  await row.getByRole('button', { name: '继续草稿', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual(first.chart.notes);
  await draw(page, 6000, 'punch');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '另存为草稿', exact: true })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await stored(page)).namedDrafts!.find((d) => d.id === first.id)!.chart.notes.length,
    )
    .toBe(2);
  song = await stored(page);
  expect(song.namedDrafts).toHaveLength(2);
  expect(song.namedDrafts!.find((d) => d.id === first.id)!.chart.notes).toHaveLength(2);
  expect(song.namedDrafts!.find((d) => d.id === second.id)!.chart).toEqual(second.chart);
  await draw(page, 8000, 'calf_raise');
  await page.keyboard.press('Control+s');
  await expect
    .poll(
      async () =>
        (await stored(page)).namedDrafts!.find((d) => d.id === first.id)!.chart.notes.length,
    )
    .toBe(3);
  await expect(page.getByRole('dialog', { name: '另存为草稿', exact: true })).toHaveCount(0);
  expect((await stored(page)).namedDrafts).toHaveLength(2);
  const fresh = await browser.newContext();
  await fresh.addCookies(await page.context().cookies());
  const other = await fresh.newPage();
  try {
    await other.goto('http://127.0.0.1:4180/');
    await expect(other.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
    await other.locator('.create-mode').click();
    await other.getByRole('button', { name: '本地作品', exact: true }).click();
    const row = other
      .getByRole('dialog', { name: '本地作品', exact: true })
      .locator('.managed-edition')
      .filter({ has: other.locator('b', { hasText: 'FITNESS' }) });
    await row.getByRole('combobox').selectOption({ label: '换段修订版' });
    await row.getByRole('button', { name: '继续草稿', exact: true }).click();
    expect((await exportChart(other)).notes).toEqual(second.chart.notes);
    await other.getByRole('button', { name: '保存选项', exact: true }).click();
    await other.screenshot({ path: 'artifacts/named-drafts-2026-10-23/save-menu-1920.png' });
    await other.keyboard.press('Escape');
    await expect(other.getByRole('menu')).toHaveCount(0);
    await expect(other.locator('.editor-toolbar')).toBeVisible();
    await other.getByRole('button', { name: '保存选项', exact: true }).click();
    await other.getByRole('menuitem', { name: '另存为…', exact: true }).click();
    await other
      .getByRole('dialog', { name: '另存为草稿', exact: true })
      .getByLabel('草稿名称', { exact: true })
      .fill('第三份');
    await other.screenshot({ path: 'artifacts/named-drafts-2026-10-23/save-dialog-1920.png' });
    await other.setViewportSize({ width: 1280, height: 720 });
    await other.screenshot({ path: 'artifacts/named-drafts-2026-10-23/save-dialog-1280.png' });
  } finally {
    await fresh.close();
  }
});

test('reopening disk-updated notes refreshes the revision without a video relocation prompt or overwriting with old notes', async ({
  page,
}) => {
  const chart = blankChart('磁盘更新检查');
  chart.chartType = 'fitness';
  chart.notes = [{ id: 'old', lane: 'punch', kind: 'tap', direction: 'left', timeMs: 1000 }];
  await importDemo(page, chart);
  await nameDraft(page, '更新前');
  const library = await (await page.request.get('/__wfp/maps')).json();
  const song = library.songs[0] as Song;
  song.drafts.fitness!.chart.notes.push({
    id: 'external',
    lane: 'squat',
    kind: 'tap',
    direction: 'down',
    timeMs: 3000,
  });
  const saved = await page.request.post('/__wfp/workspace/song', {
    headers: { 'X-WFP-Workspace': '1' },
    data: {
      song,
      revision: library.locations[song.id].revision,
      folder: library.locations[song.id].folder,
    },
  });
  expect(saved.ok()).toBe(true);
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  const manager = page.getByRole('dialog', { name: '本地作品', exact: true });
  const row = manager
    .locator('.managed-edition')
    .filter({ has: page.locator('b', { hasText: 'FITNESS' }) });
  await row.getByRole('combobox').selectOption('');
  await row.getByRole('button', { name: '继续草稿', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog', { name: '定位作品的视频', exact: true })).toHaveCount(0);
  expect((await exportChart(page)).notes).toEqual(song.drafts.fitness!.chart.notes);
  expect((await stored(page)).drafts.fitness!.chart.notes).toEqual(
    song.drafts.fitness!.chart.notes,
  );
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime), {
      timeout: 20000,
    })
    .toBeGreaterThan(1);
});
