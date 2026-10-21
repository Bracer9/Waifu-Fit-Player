import { expect, test } from '@playwright/test';
import { copyFile, mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { blankChart } from '../src/model';
import { PACK_FORMAT } from '../src/song-pack';
import { scanMaps } from '../scripts/maps-library';
import { insertAlbum, holdStart } from './helpers/project';

// This suite uses an isolated maps directory, never the user's songs or browser profile.
const root = path.resolve('artifacts/song-pack-qa/maps');
const songId = 'b6a28387-2bc3-4f41-a53d-62d197be272b';
test.skip(
  ({ baseURL }) => !baseURL?.endsWith(':4178'),
  'Run with npm run test:e2e:packs (isolated maps server).',
);
test.beforeEach(async () => {
  if (!root.startsWith(path.resolve('artifacts') + path.sep))
    throw new Error('Unexpected fixture directory');
  await rm(root, { recursive: true, force: true });
  const folder = path.join(root, 'Downloaded Song');
  await mkdir(folder, { recursive: true });
  await copyFile('tests/fixtures/bpm-148.mp4', path.join(folder, 'video.mp4'));
  await writeFile(
    path.join(folder, 'cover.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB2cAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  await writeFile(
    path.join(folder, 'song.json'),
    JSON.stringify({
      format: PACK_FORMAT,
      version: 1,
      id: songId,
      title: 'Downloaded Song',
      video: 'video.mp4',
      cover: 'cover.png',
      album: { id: 'anime', name: '动漫' },
      charts: { dance: 'dance.wfp.json', fitness: 'fitness.wfp.json' },
    }),
  );
  for (const chartType of ['fitness', 'dance'] as const)
    await writeFile(
      path.join(folder, `${chartType}.wfp.json`),
      JSON.stringify({
        ...blankChart('Downloaded Song'),
        songId,
        chartType,
        intensity: 'high',
        danceDifficulty: 7,
        videoHint: { fileName: 'video.mp4', durationMs: 20000 },
        videoOffsetMs: 120,
        playRange: { startMs: 2000, endMs: 18000 },
        notes: [
          { id: `${chartType}-note`, lane: 'punch', direction: 'left', kind: 'tap', timeMs: 4000 },
        ],
      }),
    );
});
test.afterAll(async () => {
  if (!root.startsWith(path.resolve('artifacts') + path.sep))
    throw new Error('Unexpected fixture directory');
  await rm(root, { recursive: true, force: true });
});

test('an unpacked folder is playable in a fresh browser, previews/seeks and supports both editions', async ({
  page,
  request,
}) => {
  const index = await (await request.get('/__wfp/maps')).json();
  expect(index.songs).toHaveLength(1);
  const videoUrl = index.videos[0].url;
  const partial = await request.get(videoUrl, { headers: { Range: 'bytes=10-29' } });
  expect(partial.status()).toBe(206);
  expect((await partial.body()).length).toBe(20);
  expect((await request.get(videoUrl, { headers: { Range: 'bytes=999999999-' } })).status()).toBe(
    416,
  );
  const forbidden = await request.get('/__wfp/map-file/%2e%2e%2f%2e%2e%2fpackage.json');
  expect(forbidden.status()).toBe(404);
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await expect(page.locator('.record-card[aria-current="true"]')).toContainText('Downloaded Song');
  await page.keyboard.press('Enter');
  await page
    .locator('.start-briefing')
    .getByRole('button', { name: 'FITNESS', exact: true })
    .click();
  await expect(page.locator('.start-briefing')).toContainText('HIGH');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.briefing-rating')).toHaveText('LV. 7');
  await holdStart(page);
  await expect(page.locator('.practice-masthead')).toContainText('Downloaded Song');
  await expect(page.locator('.ready-countdown')).toHaveCount(0);
  const video = page.locator('video');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(2.1);
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('10000');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThanOrEqual(10);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'EDIT IN STUDIO', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await expect(page.getByLabel('所属专辑')).toHaveValue('anime');
  await page.getByLabel('作品名称').fill('My local edit');
  await page.getByLabel('作品名称').press('Enter');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.reload();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.create-mode').click();
  await expect(page.getByRole('heading', { name: 'My local edit', exact: true })).toBeVisible();
  expect((await scanMaps(root)).songs[0].released.dance?.chart.title).toBe('Downloaded Song');
});

test('published editions export to a ZIP that scans unchanged on another installation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.create-mode').click();
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Downloaded Song');
  await page.screenshot({ path: 'artifacts/song-pack-qa/manager.png' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出曲包', exact: true }).click();
  const zip = await download;
  await zip.saveAs(path.resolve('artifacts/song-pack-qa/exported.wfp.zip'));
  expect(zip.suggestedFilename()).toBe('Downloaded Song.wfp.zip');
  const bytes = await readFile((await zip.path())!);
  const destination = path.resolve('artifacts/song-pack-qa/second-install');
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const length = bytes.readUInt32LE(offset + 18),
      nameSize = bytes.readUInt16LE(offset + 26);
    const extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameSize).toString();
    const target = path.resolve(destination, name);
    expect(target.startsWith(destination + path.sep)).toBe(true);
    const begin = offset + 30 + nameSize + extra;
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes.subarray(begin, begin + length));
    offset = begin + length;
  }
  const restored = await scanMaps(destination);
  expect(restored.warnings).toEqual([]);
  expect(restored.songs).toHaveLength(1);
  expect(Object.keys(restored.songs[0].released).sort()).toEqual(['dance', 'fitness']);
  for (const type of ['fitness', 'dance'] as const) {
    const chart = restored.songs[0].released[type]!.chart;
    expect(chart.videoOffsetMs).toBe(120);
    expect(chart.playRange).toEqual({ startMs: 2000, endMs: 18000 });
    expect(chart.notes[0].id).toBe(`${type}-note`);
    expect(restored.songs[0].released[type]?.albumId).toBe('anime');
  }
  expect(
    (await readdir(path.join(destination, 'Downloaded Song'))).filter((name) =>
      name.endsWith('.mp4'),
    ),
  ).toHaveLength(1);
  expect(await readFile(path.join(destination, 'Downloaded Song/video.mp4'))).toEqual(
    await readFile('tests/fixtures/bpm-148.mp4'),
  );
  await page.screenshot({ path: 'artifacts/song-pack-qa/export-complete.png' });
});

test('removing a folder song locally survives a reload and preserves its source files', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.create-mode').click();
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  await page.getByRole('button', { name: '从 WAIFU 删除', exact: true }).click();
  await expect(page.locator('.managed-song')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.create-mode').click();
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  await expect(page.locator('.managed-song')).toHaveCount(0);
  expect((await scanMaps(root)).songs).toHaveLength(1);
});

test('a missing browser file handle recovers a renamed maps video and plays with the existing chart', async ({
  page,
  request,
}) => {
  const info = await stat(path.join(root, 'Downloaded Song/video.mp4'));
  const query = `size=${info.size}&lastModified=${Math.trunc(info.mtimeMs)}`;
  const match = await request.get(`/__wfp/find-video?${query}`);
  expect(match.status()).toBe(200);
  const recovered = await match.json();
  expect(recovered.fileName).toBe('video.mp4');
  expect((await request.get('/__wfp/find-video?size=wrong&lastModified=1')).status()).toBe(400);
  const partial = await request.get(recovered.url, { headers: { Range: 'bytes=10-29' } });
  expect(partial.status()).toBe(206);
  expect((await partial.body()).length).toBe(20);
  const library = await (await request.get('/__wfp/maps')).json();
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.evaluate(
    async ({ song, size, lastModified }) => {
      const assetId = '77777777-8888-4999-aaaa-bbbbbbbbbbbb';
      // A real, structured-cloneable handle whose file disappears (the same getFile failure as rename).
      // OPFS belongs only to this isolated browser context, never to the user's maps or profile.
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle('old-name.mp4', { create: true });
      await directory.removeEntry('old-name.mp4');
      const store = (name: string, version: number, table: string, value: unknown) =>
        new Promise<void>((resolve, reject) => {
          const opening = indexedDB.open(name, version);
          opening.onupgradeneeded = () =>
            opening.result.createObjectStore(table, { keyPath: 'id' });
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const db = opening.result;
            const tx = db.transaction(table, 'readwrite');
            tx.objectStore(table).put(value);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => {
              db.close();
              reject(tx.error);
            };
          };
        });
      await store('waifu-fit-player-media', 1, 'videos', {
        id: assetId,
        fileName: 'old-name.mp4',
        size,
        lastModified,
        handle,
      });
      for (const edition of Object.values(song.released) as {
        chart: { videoHint: { assetId: string; fileName: string } };
      }[]) {
        edition.chart.videoHint.assetId = assetId;
        edition.chart.videoHint.fileName = 'old-name.mp4';
      }
      await store('waifu-fit-player-library', 2, 'songs', song);
    },
    { song: library.songs[0], size: info.size, lastModified: Math.trunc(info.mtimeMs) },
  );
  const recoveryRequest = page.waitForResponse(
    (response) => response.url().includes('/__wfp/find-video?') && response.status() === 200,
  );
  await page.reload();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await page.keyboard.press('Enter');
  await holdStart(page);
  await recoveryRequest;
  await expect(page.locator('.practice-masthead')).toContainText('Downloaded Song');
  await expect(page.locator('.ready-countdown')).toHaveCount(0);
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(2.1);
  expect(await page.locator('video').getAttribute('src')).toContain('/__wfp/map-file/');
});
