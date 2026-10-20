import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { blankChart } from '../src/model';

async function setup(page: Page) {
  await page.goto('/art/special/heart.png');
  const metadata = await (await page.request.get('/demo-media.json')).json();
  const cover = await page.evaluate(async () => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Demo cover could not load.'));
        video.src = '/demo.mp4';
      });
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = Math.min(12, video.duration / 4);
      });
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const edge = Math.min(video.videoWidth, video.videoHeight);
      canvas
        .getContext('2d')!
        .drawImage(
          video,
          (video.videoWidth - edge) / 2,
          (video.videoHeight - edge) / 2,
          edge,
          edge,
          0,
          0,
          512,
          512,
        );
      return canvas.toDataURL('image/jpeg', 0.9);
    } finally {
      video.removeAttribute('src');
      video.load();
    }
  });
  const assetId = `demo-${createHash('sha256')
    .update(JSON.stringify([metadata.fileName, metadata.size, metadata.lastModified]))
    .digest('hex')}`;
  const songs = ['Happy Halloween', 'Sunlight'].map((title, i) => {
    const chart = {
      ...blankChart(title),
      songId: `deck-song-${i}`,
      chartType: 'dance' as const,
      videoHint: { fileName: metadata.fileName, durationMs: 20000, assetId },
      playRange: { startMs: 1000 + i * 2000, endMs: 18000 },
      notes: [
        {
          id: `note-${i}`,
          lane: 'squat' as const,
          direction: 'down' as const,
          kind: 'tap' as const,
          timeMs: 5000,
        },
      ],
    };
    return {
      id: chart.songId,
      drafts: {},
      released: {
        dance: { chart, albumId: 'anime', cover, updatedAt: 10 - i },
      },
    };
  });
  await page.evaluate(
    (songs) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('waifu-fit-player-library', 2);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('songs', { keyPath: 'id' });
          request.result.createObjectStore('albums', { keyPath: 'id' });
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('songs', 'readwrite');
          songs.forEach((song) => tx.objectStore('songs').put(song));
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    songs,
  );
  await page.goto('/');
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
}

test('album deck unfolds the existing corner, plays real previews, ejects and inserts before changing pages', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const events: { name: string; progress: number | null; volume: number }[] = [];
    Object.assign(window, { deckSoundEvents: events });
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.menuSound) {
        const flight = document
          .getAnimations()
          .find(
            (a) =>
              (a.effect as KeyframeEffect)?.target instanceof Element &&
              ((a.effect as KeyframeEffect).target as Element).matches('.album-flight-card'),
          );
        events.push({
          name: this.dataset.menuSound,
          progress: flight?.effect?.getComputedTiming().progress ?? null,
          volume: this.volume,
        });
      }
      return original.call(this);
    };
  });
  await setup(page);
  await page.evaluate(() =>
    Object.assign(window, { originalPink: document.querySelector('.ambient-shape.pink') }),
  );
  const shelf = page.locator('.album-shelf');
  const before = (await shelf.boundingBox())!;
  await page.keyboard.press('Space');
  const deck = page.getByRole('complementary', { name: '专辑试听播放器' });
  await expect(deck).toHaveAttribute('data-open');
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await expect.poll(async () => (await shelf.boundingBox())!.x).toBeLessThan(before.x - 150);
  await expect(page.getByRole('button', { name: '暂停专辑试听' })).toBeEnabled();
  await expect(deck.locator('h2')).toHaveText('Happy Halloween');
  expect(
    await page.evaluate(
      () =>
        document.querySelector('.ambient-shape.pink') ===
        (window as unknown as { originalPink: Element }).originalPink,
    ),
  ).toBe(true);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '播放专辑试听' })).toBeEnabled();
  await expect(page.locator('.album-flight')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '暂停专辑试听' })).toBeEnabled();
  await page.getByRole('button', { name: '暂停专辑试听' }).click();
  // An unrelated pointer gesture must not undo a deliberate preview pause.
  await deck.locator('h2').click();
  await expect(page.getByRole('button', { name: '播放专辑试听' })).toBeEnabled();
  await page.getByRole('button', { name: '专辑试听下一首' }).click();
  await expect(deck.locator('h2')).toHaveText('Sunlight');
  await expect(page.getByRole('button', { name: '暂停专辑试听' })).toBeEnabled();
  await page.keyboard.press('ArrowLeft');
  await expect(deck.locator('h2')).toHaveText('Happy Halloween');
  await page.getByRole('slider', { name: '专辑试听进度' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '播放专辑试听' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-app')).not.toHaveAttribute('data-album-player');
  await expect
    .poll(async () => Math.abs((await shelf.boundingBox())!.x - before.x))
    .toBeLessThan(1);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.collection-album[aria-current="true"]')).toHaveAttribute(
    'data-id',
    'anime',
  );
  await page.keyboard.press('Enter');
  await expect(deck).toHaveAttribute('data-open');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/album-deck-open-1080p.png' });
  await expect(deck.locator('.album-deck-screen')).toHaveText('');
  await expect(deck.locator('.album-deck-screen img')).toHaveCount(1);
  const card = page.locator('.collection-album[aria-current="true"]');
  const cardBox = (await card.boundingBox())!;
  const slot = (await deck.locator('.album-deck-slot').boundingBox())!;
  expect(Math.abs(slot.y + slot.height / 2 - cardBox.y - cardBox.height / 2)).toBeLessThan(6);
  expect(slot.height).toBeGreaterThanOrEqual(cardBox.height);
  await page.keyboard.press('Enter');
  await expect(page.locator('.album-flight')).toHaveCount(1);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'artifacts/album-deck-inserting-1080p.png' });
  await expect(page.locator('.album-tuning')).toBeVisible();
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  await expect(page.locator('.ambient-shape.pink')).toHaveCSS('rotate', '0deg');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.album-flight')).toHaveCount(0);
  const inserted = await page.evaluate(() =>
    (
      window as unknown as {
        deckSoundEvents: { name: string; progress: number | null; volume: number }[];
      }
    ).deckSoundEvents.filter((event) => event.name === 'insert'),
  );
  expect(inserted).toHaveLength(1);
  expect(inserted[0].progress).toBe(1);
  expect(inserted[0].volume).toBe(0.5);
  expect(errors).toEqual([]);
});

test('insert hint stays at the final gap midpoint throughout the unfold', async ({ page }) => {
  await setup(page);
  for (const key of ['', 'ArrowDown']) {
    if (key) await page.keyboard.press(key);
    await page.keyboard.press('Enter');
    const positions = await page.evaluate(
      () =>
        new Promise<{ x: number; y: number }[]>((resolve) => {
          const positions: { x: number; y: number }[] = [];
          const start = performance.now();
          const tick = () => {
            const box = document.querySelector('.album-deck-insert-hint')!.getBoundingClientRect();
            positions.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
            if (performance.now() - start < 750) requestAnimationFrame(tick);
            else resolve(positions);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(
      Math.max(...positions.map((p) => p.x)) - Math.min(...positions.map((p) => p.x)),
    ).toBeLessThan(1);
    expect(
      Math.max(...positions.map((p) => p.y)) - Math.min(...positions.map((p) => p.y)),
    ).toBeLessThan(1);
    const card = (await page.locator('.collection-album[aria-current="true"]').boundingBox())!;
    const slot = (await page.locator('.album-deck-slot').boundingBox())!;
    expect(positions.at(-1)!.x).toBeCloseTo((card.x + card.width + slot.x) / 2, 0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ambient-shape.pink')).toHaveCSS('translate', '0px');
  }
});

for (const switchDelay of [100, 550])
  test(`album switch preserves the first unfold after ${switchDelay}ms with live music`, async ({
    page,
  }) => {
    await setup(page);
    for (const key of ['', 'ArrowDown', 'ArrowUp']) {
      if (key) await page.keyboard.press(key);
      await page.waitForTimeout(switchDelay);
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.keyboard.press('Enter');
        const recording = page.evaluate(
          () =>
            new Promise<
              {
                time: number;
                y: number;
                angle: number;
                slide: number | null;
                outline: number | null;
              }[]
            >((resolve) => {
              const frames: {
                time: number;
                y: number;
                angle: number;
                slide: number | null;
                outline: number | null;
              }[] = [];
              const start = performance.now();
              const tick = () => {
                const node = document.querySelector<HTMLElement>('.ambient-shape.pink')!;
                const s = getComputedStyle(node);
                const matrix = new DOMMatrix(s.transform);
                const progress = (property: string) =>
                  node
                    .getAnimations()
                    .find((a) => a instanceof CSSTransition && a.transitionProperty === property)
                    ?.effect?.getComputedTiming().progress ?? null;
                frames.push({
                  time: performance.now() - start,
                  y: parseFloat(s.translate.split(' ')[1]) || 0,
                  angle: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
                  slide: progress('translate'),
                  outline: progress('clip-path'),
                });
                if (performance.now() - start < 750) requestAnimationFrame(tick);
                else resolve(frames);
              };
              requestAnimationFrame(tick);
            }),
        );
        if (switchDelay === 100 && attempt === 0) {
          await page.waitForTimeout(120);
          await page.screenshot({ path: `artifacts/album-unfold-${key || 'initial'}-1080p.png` });
        }
        const frames = await recording;
        await test.info().attach(`motion-${key || 'all'}-${attempt}.json`, {
          body: JSON.stringify(frames),
          contentType: 'application/json',
        });
        expect(
          frames[0].slide,
          `${key || 'all'}, unfold ${attempt + 1} must slide instead of teleporting`,
        ).not.toBeNull();
        for (const frame of frames) {
          expect(frame.angle).toBeCloseTo(-33, 2);
          if (frame.outline !== null) {
            expect(frame.slide).not.toBeNull();
            expect(frame.slide!).toBeCloseTo(frame.outline, 2);
          }
        }
        for (let i = 1; i < frames.length; i++)
          expect(frames[i].y).toBeGreaterThanOrEqual(frames[i - 1].y - 1);
        expect(frames.at(-1)!.y).toBeCloseTo(1080 * 0.83, 1);
        await page.keyboard.press('Escape');
        await expect(page.locator('.ambient-shape.pink')).toHaveCSS('translate', '0px');
      }
    }
  });

test('first and repeated unfolds slide the live corner without rotating its body', async ({
  page,
}) => {
  await setup(page);
  await page.addStyleTag({ content: '.menu-app { --music-beat: 0 !important; }' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const sample = () =>
    page.evaluate(
      () =>
        new Promise<{ angle: number; rotate: number; top: number }[]>((resolve) => {
          const samples: { angle: number; rotate: number; top: number }[] = [];
          const start = performance.now();
          const tick = () => {
            const node = document.querySelector<HTMLElement>('.ambient-shape.pink')!;
            const style = getComputedStyle(node);
            const matrix = new DOMMatrix(style.transform);
            samples.push({
              angle: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
              rotate: parseFloat(style.rotate) || 0,
              top: node.getBoundingClientRect().top,
            });
            if (performance.now() - start < 700) requestAnimationFrame(tick);
            else resolve(samples);
          };
          requestAnimationFrame(tick);
        }),
    );
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Enter');
    const frames = await sample();
    expect(frames.length).toBeGreaterThan(10);
    for (const frame of frames) {
      expect(frame.rotate).toBe(0);
      expect(frame.angle).toBeCloseTo(-33, 2);
    }
    for (let j = 1; j < frames.length; j++)
      expect(frames[j].top).toBeGreaterThanOrEqual(frames[j - 1].top - 1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ambient-shape.pink')).toHaveCSS('translate', '0px');
  }
});

test('rapid open/eject, settings and reduced motion leave no flight copies or stale player state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Enter');
    await expect(page.locator('.album-deck')).toHaveAttribute('data-open');
    await page.keyboard.press('Escape');
    await expect(page.locator('.album-deck')).not.toHaveAttribute('data-open');
  }
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  await expect(page.locator('.menu-app')).not.toHaveAttribute('data-album-player');
  await expect(page.locator('.corner-settings')).toHaveAttribute('data-open');
  await page.keyboard.press('Escape');
  await page.locator('.collection-album[aria-current="true"]').click();
  await page.getByRole('button', { name: /INSERT ALBUM/ }).click();
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.album-flight')).toHaveCount(0);
  await page.getByRole('button', { name: '选择专辑', exact: true }).click();
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await expect(page.locator('.album-deck')).not.toHaveAttribute('data-open');
});

test('empty albums can be inserted; blank click and Back eject without leaving the album page', async ({
  page,
}) => {
  await setup(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.collection-album[aria-current="true"]')).toHaveAttribute(
    'data-id',
    'pop',
  );
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '播放专辑试听' })).toBeDisabled();
  await page.mouse.click(240, 210);
  await expect(page.locator('.menu-app')).not.toHaveAttribute('data-album-player');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await expect(page.locator('.menu-app')).not.toHaveAttribute('data-album-player');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /INSERT ALBUM/ }).click();
  await expect(page.locator('.library-empty')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
});
