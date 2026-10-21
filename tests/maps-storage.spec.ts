import { expect, test } from '@playwright/test';
import { readFile, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { blankChart } from '../src/model';
import { importDemo, lastDraft } from './helpers/project';

test('maps keeps drafts in a fresh browser context without any browser projects', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await importDemo(page, blankChart('Disk authoring'));
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('作品名称').fill('Saved on disk');
  await page.getByLabel('作品名称').press('Enter');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect.poll(async () => (await lastDraft(page))?.title).toBe('Saved on disk');
  const library = await (await page.request.get('/__wfp/maps')).json();
  const song = library.songs[0];
  expect(song.drafts.dance.chart.videoHint.assetId).toMatch(/^pack-/);
  expect(library.locations[song.id].workspace).toBe(true);
  const video = await page.request.get(library.videos[0].url, {
    headers: { Range: 'bytes=10-29' },
  });
  expect(video.status()).toBe(206);
  expect((await video.body()).length).toBe(20);
  const originalId = song.id;
  // Only the test server's routing cookie is shared. This context has no browser projects/preferences.
  const fresh = await browser.newContext({ reducedMotion: 'reduce' });
  await fresh.addCookies(await page.context().cookies());
  const other = await fresh.newPage();
  try {
    await other.goto('http://127.0.0.1:4180/');
    await other.locator('.create-mode').click();
    await expect(other.getByRole('heading', { name: 'Saved on disk', exact: true })).toBeVisible();
    expect((await lastDraft(other))?.songId).toBe(originalId);
    const count = await other.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const open = indexedDB.open('waifu-fit-player-library', 2);
          open.onsuccess = () => {
            const db = open.result;
            const request = db.transaction('songs').objectStore('songs').count();
            request.onsuccess = () => {
              resolve(request.result);
              db.close();
            };
          };
        }),
    );
    expect(count).toBe(0);
  } finally {
    await fresh.close();
  }
});

test('copies an old browser draft beside a renamed MP4 and retains browser originals for user review', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const id = '77777777-8888-4999-aaaa-bbbbbbbbbbbb';
  const assetId = 'aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee';
  const attached = await page.request.post('/__wfp/workspace/attach', {
    headers: { 'X-WFP-Workspace': '1' },
    data: { id, assetId, title: 'Migration', source: '/demo.mp4' },
  });
  expect(attached.ok()).toBe(true);
  const data = await attached.json();
  const cookie = (await page.context().cookies()).find((c) => c.name === 'wfp-test-workspace')!;
  const root = path.resolve(
    'artifacts/test-maps',
    testInfo.config.metadata.testServerToken,
    cookie.value,
  );
  const folder = path.join(root, data.location.folder);
  const original = path.join(folder, data.video.fileName);
  const info = await stat(original);
  await rename(original, path.join(folder, 'new-name.mp4'));
  await page.evaluate(
    async ({ id, assetId, size, lastModified, base }) => {
      const store = (name: string, version: number, table: string, value: unknown) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open(name, version);
          open.onupgradeneeded = () => {
            if (!open.result.objectStoreNames.contains(table))
              open.result.createObjectStore(table, { keyPath: 'id' });
          };
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(table, 'readwrite');
            tx.objectStore(table).put(value);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
      await store('waifu-fit-player-media', 1, 'videos', {
        id: assetId,
        fileName: 'old-name.mp4',
        size,
        lastModified,
        file: new File(['unused old cache'], 'old-name.mp4', { lastModified }),
      });
      const chart = {
        ...base,
        schemaVersion: 1,
        title: 'Browser original',
        songId: id,
        chartType: 'dance',
        videoHint: { assetId, fileName: 'old-name.mp4', durationMs: 60000 },
        videoOffsetMs: 0,
        tempoSegments: [{ id: 't', anchorMs: 0, bpm: 120, meter: '4/4' }],
        notes: [{ id: 'note', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 }],
        specialEvents: [],
      };
      await store('waifu-fit-player-library', 2, 'songs', {
        id,
        drafts: { dance: { chart, cover: '', albumId: 'pop', updatedAt: 123 } },
        released: {},
      });
    },
    {
      id,
      assetId,
      size: info.size,
      lastModified: Math.trunc(info.mtimeMs),
      base: blankChart('Browser original'),
    },
  );
  await page.reload();
  await page.locator('.create-mode').click();
  await expect(page.getByRole('heading', { name: 'Browser original', exact: true })).toBeVisible();
  expect((await lastDraft(page))?.videoHint.fileName).toBe('new-name.mp4');
  const raw = JSON.parse(await readFile(path.join(folder, 'wfp-dance-draft.json'), 'utf8'));
  expect(raw.notes).toHaveLength(1);
  expect(raw.videoHint.fileName).toBe('new-name.mp4');
  expect(
    (await readdir(path.join(folder, '.wfp-backup'))).some((name) =>
      /^browser-.*\.json$/.test(name),
    ),
  ).toBe(true);
  const counts = await page.evaluate(async () =>
    Promise.all(
      ['waifu-fit-player-library', 'waifu-fit-player-media'].map(
        (name) =>
          new Promise<number>((resolve) => {
            const open = indexedDB.open(name);
            open.onsuccess = () => {
              const db = open.result;
              const request = db
                .transaction(name.endsWith('library') ? 'songs' : 'videos')
                .objectStore(name.endsWith('library') ? 'songs' : 'videos')
                .count();
              request.onsuccess = () => {
                resolve(request.result);
                db.close();
              };
            };
          }),
      ),
    ),
  );
  expect(counts).toEqual([1, 1]);
  // Reopening must keep originals too, and must not replace the newer disk project.
  await page.reload();
  const retained = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('waifu-fit-player-library');
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction('songs')
            .objectStore('songs')
            .get('77777777-8888-4999-aaaa-bbbbbbbbbbbb');
          request.onsuccess = () => {
            resolve(request.result.drafts.dance.chart.videoHint.fileName);
            db.close();
          };
        };
      }),
  );
  expect(retained).toBe('old-name.mp4');
});
