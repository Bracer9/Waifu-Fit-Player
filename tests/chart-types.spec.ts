import { insertAlbum, holdStart } from './helpers/project';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { blankChart } from '../src/model';
import type { Song } from '../src/library';

async function legacyChart(page: Page, difficulty: 'normal' | 'hard') {
  const metadata = await (await page.request.get('/demo-media.json')).json();
  const chart: Record<string, unknown> = {
    ...blankChart('Legacy workout'),
    difficulty,
    difficultyRating: 8.5,
    videoOffsetMs: 120,
    playRange: { startMs: 500, endMs: 10000 },
    videoHint: {
      fileName: metadata.fileName,
      durationMs: 20000,
      assetId: `demo-${createHash('sha256')
        .update(JSON.stringify([metadata.fileName, metadata.size, metadata.lastModified]))
        .digest('hex')}`,
    },
    notes: [{ id: 'legacy-note', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1200 }],
  };
  delete chart.chartType;
  return chart;
}

async function storedSongs(page: Page): Promise<{ version: number; songs: Song[] }> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('waifu-fit-player-library');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('songs');
          const rows = tx.objectStore('songs').getAll();
          tx.oncomplete = () => {
            resolve({ version: db.version, songs: rows.result });
            db.close();
          };
        };
      }),
  );
}

test('v1 library upgrades both types and restores the exact last draft, without changing released snapshots', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // A static same-origin page lets us create a real v1 database before app startup.
  await page.goto('/art/special/heart.png');
  const id = '8138a803-025b-4d97-9f17-886856270a85';
  const chart: Record<string, unknown> = { ...(await legacyChart(page, 'hard')), songId: id };
  const edition = (title: string, updatedAt: number, cover: string) => ({
    chart: { ...chart, title } as Record<string, unknown>,
    albumId: 'anime',
    cover,
    updatedAt,
  });
  const old = {
    id,
    // Old copied Normal drafts can still carry a Hard tag. The slot must win.
    drafts: {
      normal: edition('Fitness draft', 100, '/art/special/heart.png'),
      hard: edition('Dance draft', 200, '/art/special/star.png'),
    },
    released: {
      normal: edition('Fitness release', 300, '/art/special/heart.png'),
      hard: edition('Dance release', 400, '/art/special/star.png'),
    },
  };
  await page.evaluate(
    (song) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('waifu-fit-player-library', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('songs', { keyPath: 'id' });
          request.result.createObjectStore('albums', { keyPath: 'id' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('songs', 'readwrite');
          tx.objectStore('songs').put(song);
          tx.oncomplete = () => {
            db.close();
            localStorage.setItem(
              'waifu-last-draft',
              JSON.stringify({ id: song.id, difficulty: 'normal' }),
            );
            resolve();
          };
        };
      }),
    old,
  );
  await page.goto('/');
  await expect.poll(async () => (await storedSongs(page)).version).toBe(2);
  const migrated = (await storedSongs(page)).songs[0];
  for (const collection of ['drafts', 'released'] as const) {
    expect(Object.keys(migrated[collection])).toEqual(['fitness', 'dance']);
    for (const [beforeType, afterType] of [
      ['normal', 'fitness'],
      ['hard', 'dance'],
    ] as const) {
      const before = old[collection][beforeType];
      const after = migrated[collection][afterType]!;
      const { difficulty: _type, difficultyRating: _rating, ...unchanged } = before.chart;
      expect(after).toEqual({
        ...before,
        chart: { ...unchanged, chartType: afterType, danceDifficulty: 8.5 },
      });
    }
  }
  await page.getByRole('button', { name: /创作模式/ }).click();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await expect(page.getByLabel('作品名称')).toHaveValue('Fitness draft');
  await expect(page.getByLabel('谱面类型')).toHaveValue('fitness');
  await expect(page.getByLabel('运动强度')).toHaveValue('');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('waifu-last-draft')!))).toEqual({
    id,
    chartType: 'fitness',
  });
  await page.getByLabel('运动强度').selectOption('high');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('强度 HIGH');
  await page.getByRole('button', { name: '确认更新发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const updated = (await storedSongs(page)).songs[0];
  expect(updated.released.fitness!.chart.intensity).toBe('high');
  expect(updated.released.dance).toEqual(migrated.released.dance);
  expect(updated.drafts.dance).toEqual(migrated.drafts.dance);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(exported.chartType).toBe('fitness');
  expect(exported.intensity).toBe('high');
  expect(exported.danceDifficulty).toBe(8.5);
  expect(exported).not.toHaveProperty('difficulty');
  expect(exported).not.toHaveProperty('difficultyRating');
  expect(exported.notes).toEqual(chart.notes);
  expect(exported.playRange).toEqual(chart.playRange);
  expect(exported.videoOffsetMs).toBe(120);

  await page.getByRole('button', { name: '音游模式', exact: true }).click();
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await page.getByRole('button', { name: 'FITNESS', exact: true }).click();
  await expect(page.locator('.record-overline')).toContainText('INTENSITYHIGH');
  await expect(page.getByRole('button', { name: 'DANCE', exact: true })).toContainText('难度 8.5');
  await page.screenshot({ path: 'artifacts/chart-types-fitness-1080p.png' });
  await page.locator('.record-select').click();
  await expect(page.getByRole('dialog')).toContainText('INT. HIGH');
  await holdStart(page);
  await expect(page.locator('.practice-chart-type')).toHaveText('FITNESSINT. HIGH');
  await expect(page.locator('.ready-countdown')).toHaveCount(0, { timeout: 10000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'PAUSED' })).toContainText('FITNESS / 强度 HIGH');
  await page.getByRole('button', { name: 'BACK TO SELECT', exact: true }).click();
  await expect(page.getByRole('button', { name: 'FITNESS', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  const reloaded = (await storedSongs(page)).songs[0];
  expect(reloaded.released).toEqual(updated.released);
  expect(errors).toEqual([]);
});

test('importing legacy Normal JSON creates a fitness draft and preserves its original score and timing', async ({
  page,
}) => {
  await page.goto('/');
  const legacy = await legacyChart(page, 'normal');
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'legacy-normal.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await expect(page.getByLabel('谱面类型')).toHaveValue('fitness');
  await expect(page.getByLabel('运动强度')).toHaveValue('');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect.poll(async () => (await storedSongs(page)).songs.length).toBe(1);
  const draft = (await storedSongs(page)).songs[0].drafts.fitness!.chart;
  expect(draft.danceDifficulty).toBe(8.5);
  expect(draft.notes).toEqual(legacy.notes);
  expect(draft.playRange).toEqual(legacy.playRange);
  expect(draft.videoOffsetMs).toBe(120);
  expect(draft).not.toHaveProperty('difficulty');
});
