import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function albums(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
}

test('centred albums show the next caption with its bottom beside the footer controls at 1080p', async ({
  page,
}) => {
  await albums(page);
  await page.mouse.move(10, 10);
  for (const id of ['all', 'anime', 'pop']) {
    const current = page.locator(`.collection-album[data-id="${id}"]`);
    await expect(current).toHaveAttribute('aria-current', 'true');
    await expect
      .poll(() =>
        current.evaluate((card: HTMLElement) => {
          const shelf = card.parentElement!;
          return Math.abs(
            card.offsetTop + card.offsetHeight / 2 - shelf.scrollTop - shelf.clientHeight / 2,
          );
        }),
      )
      .toBeLessThan(6);
    await expect
      .poll(() =>
        current.evaluate((card) => {
          const shelf = card.parentElement!.getBoundingClientRect();
          const next = card
            .nextElementSibling!.querySelector('.collection-label')!
            .getBoundingClientRect();
          return shelf.bottom - next.bottom;
        }),
      )
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(() =>
        current.evaluate((card) => {
          const next = card.nextElementSibling!;
          const bounds = next.getBoundingClientRect();
          const footer = document.querySelector('.menu-controls-actions')!.getBoundingClientRect();
          return Math.abs(bounds.bottom - footer.bottom);
        }),
      )
      .toBeLessThan(12);
    expect(
      await current.evaluate((card) => {
        const next = card.nextElementSibling!;
        const label = next.querySelector('.collection-label')!.getBoundingClientRect();
        return (
          document
            .elementFromPoint(label.x + label.width / 2, label.bottom - 8)
            ?.closest('.collection-album') === next
        );
      }),
    ).toBe(true);
    await page.keyboard.press('ArrowDown');
  }
  await expect(page.locator('.collection-album[data-id="vocaloid"]')).toHaveAttribute(
    'aria-current',
    'true',
  );
  await page.screenshot({ path: 'artifacts/album-focus-1080p.png' });
});

test('album originals occupy a full 7:2 picture area; only neighbouring cards have depth blur', async ({
  page,
}) => {
  await albums(page);
  const cards = page.locator('.collection-album');
  await expect(cards).toHaveCount(4);
  const blur = (index: number) =>
    cards
      .nth(index)
      .locator('.album-cover-scene')
      .evaluate((image) => {
        return Number(getComputedStyle(image).filter.match(/blur\(([\d.]+)/)?.[1] ?? 0);
      });
  await expect.poll(() => blur(0)).toBeLessThan(0.05);
  await expect.poll(() => blur(1)).toBeGreaterThan(0.5);
  for (const id of ['all', 'anime', 'pop', 'vocaloid']) {
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

test('verified legacy crops recover even when canvas encoding changes; custom art and stored data stay intact', async ({
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
  // Model a different browser encoder: visually equivalent output need not have
  // the same data URL. The verified historical bytes must still recover.
  await page.addInitScript(() => {
    const encode = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const result = encode.apply(this, args);
      return args[0] === 'image/webp' ? `${result}\n` : result;
    };
  });
  await albums(page);
  await expect(page.locator('.collection-album[data-id="all"] img')).toHaveAttribute('src', source);
  await expect(page.locator('.collection-album[data-id="all"] .all-record')).toHaveCount(1);
  await expect(page.locator('.collection-album[data-id="all"] .album-vinyl-spin')).toHaveCSS(
    'animation-play-state',
    'running',
  );
  await expect(page.locator('.collection-album[data-id="custom-cover"] img')).toHaveAttribute(
    'src',
    saved,
  );
  const stored = (await (await page.request.get('/__wfp/maps')).json()).albums.find(
    (album: { id: string }) => album.id === 'all',
  ).cover;
  expect(stored).toBe(saved);
});
