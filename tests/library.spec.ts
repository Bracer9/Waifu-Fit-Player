import { expect, test, type Page } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Song } from '../src/library';
import { importDemo } from './helpers/project';

async function songs(page: Page): Promise<Song[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const opening = indexedDB.open('waifu-fit-player-library');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const request = db.transaction('songs').objectStore('songs').getAll();
          request.onsuccess = () => {
            resolve(request.result);
            db.close();
          };
        };
      }),
  );
}
async function publish(page: Page) {
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  if (!(await page.getByLabel('所属专辑').inputValue()))
    await page.getByLabel('所属专辑').selectOption('touhou');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: /确认(发布|更新发布)/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('真实谱面：Hard/Normal 独立发布、编辑、撤下、删除与重开', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/menu-home.png' });
  await page.getByRole('button', { name: /创作模式/ }).click();
  await expect(page.getByRole('button', { name: '新建', exact: true })).toBeVisible();
  const file = (await readdir('maps', { recursive: true })).find((f) => f.endsWith('.wfp.json'))!;
  const chart = JSON.parse(await readFile(path.join('maps', file), 'utf8'));
  await importDemo(page, chart);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await expect(page.getByLabel('草稿难度')).toHaveValue('hard');
  await expect(page.getByLabel('所属专辑')).toHaveValue('');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('曲目 → 所属专辑');
  await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Anime');
  await expect(page.getByLabel('发布专辑')).toHaveCount(0);
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const hard = (await songs(page))[0].released.hard!;
  expect(hard.albumId).toBe('anime');
  expect(hard.cover.startsWith('data:image/webp')).toBe(true);
  await page.getByLabel('草稿难度').selectOption('normal');
  await expect(page.getByLabel('草稿难度')).toHaveValue('normal');
  await page.getByLabel('作品名称').fill('Sunlight NORMAL');
  await page.getByLabel('所属专辑').selectOption('pop');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('流行');
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let stored = (await songs(page))[0];
  expect(stored.released.hard).toEqual(hard);
  expect(stored.released.normal!.albumId).toBe('pop');
  expect(stored.released.normal!.chart.title).toBe('Sunlight NORMAL');
  await page.getByLabel('作品名称').fill('未发布修改');
  await page.getByRole('button', { name: '音游模式', exact: true }).click();
  await expect(page.locator('.collection-album').first()).toContainText('全部曲目');
  await page.screenshot({ path: 'artifacts/menu-albums.png' });
  await page.locator('.collection-album').first().click();
  await expect(page.getByRole('button', { name: 'HARD 已发布' })).toBeEnabled();
  await page.getByRole('button', { name: 'NORMAL 已发布' }).click();
  await expect(page.locator('.selection-title h2')).toHaveText('Sunlight NORMAL');
  await page.screenshot({ path: 'artifacts/menu-songs.png' });
  await page.getByRole('button', { name: 'HARD 已发布' }).click();
  await page.getByRole('button', { name: /开始 LET'S MOVE/ }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await expect(page.locator('.play-lane')).toHaveCount(5);
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'SELECT MUSIC', exact: true }).click();
  await expect(page.getByRole('button', { name: 'HARD 已发布' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '编辑此谱面', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeEnabled();
  expect((await songs(page))[0].released.hard).toEqual(hard);
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  const hardRow = page.locator('.managed-edition').filter({ has: page.locator('b.hard') });
  await hardRow.getByRole('button', { name: '撤下发布' }).click();
  await expect(hardRow).toContainText('未发布');
  stored = (await songs(page))[0];
  expect(stored.drafts.hard).toBeTruthy();
  expect(stored.released.hard).toBeUndefined();
  expect(stored.released.normal).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: /创作模式/ }).click();
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  await page.getByRole('button', { name: '从 WAIFU 删除' }).click();
  await expect(page.locator('.managed-song')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭本地作品' }).click();
  await page.getByRole('button', { name: '音游模式', exact: true }).click();
  await page.locator('.collection-album').first().click();
  await expect(page.getByRole('heading', { name: '这张专辑还没有歌曲' })).toBeVisible();
  await page.reload();
  expect(await songs(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('自定义专辑封面、分组与曲绘保存', async ({ page }) => {
  await page.goto('/');
  await importDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByRole('button', { name: '管理专辑与封面' }).click();
  await page.getByRole('button', { name: '新建专辑' }).click();
  await page.getByLabel('专辑名称').fill('自定义专辑');
  await page.getByLabel('选择专辑封面').setInputFiles('public/art/special/star.png');
  await expect(page.locator('.album-cover-preview img')).toBeVisible();
  await page.getByRole('button', { name: '保存专辑' }).click();
  await expect(page.getByRole('button', { name: '自定义专辑', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭专辑设置' }).click();
  await page.getByLabel('所属专辑').selectOption({ label: '自定义专辑' });
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByLabel('发布难度').selectOption('normal');
  await expect(page.getByLabel('发布难度')).toHaveValue('normal');
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await songs(page))[0].released.normal).toBeTruthy();
  await page.getByRole('button', { name: '音游模式', exact: true }).click();
  const album = page.locator('.collection-album').filter({ hasText: '自定义专辑' });
  await expect(album.locator('img')).toHaveAttribute('src', /^data:image\/webp/);
  await album.click();
  await expect(page.locator('.record-card')).toHaveCount(1);
});

test('多首歌曲滚动选择居中，返回保留专辑和曲目', async ({ page }) => {
  await page.goto('/');
  await importDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await publish(page);
  const base = (await songs(page))[0];
  await page.evaluate(
    (base) =>
      new Promise<void>((resolve) => {
        const opening = indexedDB.open('waifu-fit-player-library');
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction('songs', 'readwrite');
          for (let i = 1; i <= 4; i++) {
            const song = structuredClone(base);
            song.id = crypto.randomUUID();
            song.released.hard!.chart.songId = song.id;
            song.released.hard!.chart.title = `Test song ${i}`;
            song.released.hard!.updatedAt += i;
            tx.objectStore('songs').put(song);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
    base,
  );
  await page.reload();
  await page.getByRole('button', { name: /音游模式/ }).click();
  await page.locator('.collection-album').filter({ hasText: '东方' }).click();
  await expect(page.locator('.record-card')).toHaveCount(5);
  await page.getByRole('button', { name: '下一首' }).click();
  await expect(page.locator('.record-card[aria-current="true"]')).toContainText('Test song 3');
  await expect
    .poll(() =>
      page.locator('.record-card[aria-current="true"]').evaluate((el) => {
        const card = el.getBoundingClientRect(),
          area = el.parentElement!.getBoundingClientRect();
        return Math.abs(card.x + card.width / 2 - area.x - area.width / 2);
      }),
    )
    .toBeLessThan(3);
  await page.getByRole('button', { name: '选择专辑', exact: true }).click();
  await expect(page.locator('.collection-album[aria-current="true"]')).toContainText('东方');
  await page.locator('.collection-album[aria-current="true"]').click();
  await expect(page.locator('.record-card[aria-current="true"]')).toContainText('Test song 3');
  await page.screenshot({ path: 'artifacts/menu-carousel.png' });
});
