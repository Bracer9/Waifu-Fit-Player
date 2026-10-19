import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function albums(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
}

test('album originals occupy a full 7:2 picture area; only neighbouring cards have depth blur', async ({
  page,
}) => {
  await albums(page);
  const cards = page.locator('.collection-album');
  await expect(cards).toHaveCount(5);
  const blur = (index: number) =>
    cards
      .nth(index)
      .locator('img')
      .evaluate((image) => {
        return Number(getComputedStyle(image).filter.match(/blur\(([\d.]+)/)?.[1] ?? 0);
      });
  await expect.poll(() => blur(0)).toBeLessThan(0.05);
  await expect.poll(() => blur(1)).toBeGreaterThan(0.5);
  for (const id of ['all', 'touhou', 'anime', 'vocaloid', 'pop']) {
    const filename = id === 'anime' ? 'animie' : id === 'vocaloid' ? 'Vocaloid' : id;
    const original = readFileSync(`src/assets/albums-illustrations/${filename}_album.png`);
    const dimensions = [original.readUInt32BE(16), original.readUInt32BE(20)];
    const card = page.locator(`.collection-album[data-id="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    const image = card.locator('img');
    await expect
      .poll(() =>
        image.evaluate((node: HTMLImageElement) => [node.naturalWidth, node.naturalHeight]),
      )
      .toEqual(dimensions);
    await expect(image).toHaveCSS('object-fit', 'contain');
    const picture = (await card.locator('.collection-art').boundingBox())!;
    const title = (await card.locator('.collection-label').boundingBox())!;
    expect(picture.width / picture.height).toBeCloseTo(7 / 2, 2);
    expect(title.y).toBeGreaterThanOrEqual(picture.y + picture.height - 1);
  }
  await cards.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/album-artwork-full-originals-1080p.png' });
});

test('exact legacy square crops recover their supplied original; unrelated custom art and stored data stay intact', async ({
  page,
}) => {
  await albums(page);
  const source = (await page.locator('.collection-album[data-id="all"] img').getAttribute('src'))!;
  const saved = await page.evaluate(async (source) => {
    const bitmap = await createImageBitmap(await (await fetch(source)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const edge = Math.min(bitmap.width, bitmap.height);
    canvas
      .getContext('2d')!
      .drawImage(
        bitmap,
        (bitmap.width - edge) / 2,
        (bitmap.height - edge) / 2,
        edge,
        edge,
        0,
        0,
        512,
        512,
      );
    bitmap.close();
    const cover = canvas.toDataURL('image/webp', 0.85);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('waifu-fit-player-library');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('albums', 'readwrite');
        const store = transaction.objectStore('albums');
        store.put({ id: 'all', name: '全部曲目', cover });
        store.put({ id: 'custom-cover', name: 'Custom square', cover });
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
    return cover;
  }, source);
  await albums(page);
  await expect(page.locator('.collection-album[data-id="all"] img')).toHaveAttribute('src', source);
  await expect(page.locator('.collection-album[data-id="custom-cover"] img')).toHaveAttribute(
    'src',
    saved,
  );
  const stored = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('waifu-fit-player-library');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('albums').objectStore('albums').get('all');
          read.onsuccess = () => {
            db.close();
            resolve(read.result.cover);
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
  );
  expect(stored).toBe(saved);
});
