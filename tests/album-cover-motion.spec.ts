import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { putAlbums } from './helpers/library';
import { importDemo } from './helpers/project';

test('replacement anime artwork retains the lens flare after a disk save and reload', async ({
  page,
}) => {
  await page.goto('/');
  const original = `data:image/png;base64,${readFileSync('src/assets/albums-illustrations/anime_album2.png').toString('base64')}`;
  const replacement = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  }, original);
  // Re-encoding breaks the original fingerprint, as Photoshop exports do.
  await page.route('**/replacement-anime.jpg', (route) =>
    route.fulfill({
      contentType: 'image/jpeg',
      body: Buffer.from(replacement.split(',')[1], 'base64'),
    }),
  );
  for (let visit = 0; visit < 2; visit++) {
    const cover = visit === 0 ? replacement : '/replacement-anime.jpg';
    await putAlbums(page, [{ id: 'anime', name: '动漫', cover, coverEffect: 'anime-lens' }]);
    await page.reload();
    await page.getByRole('button', { name: /音游模式/ }).click();
    await expect(page.locator('.menu-curtain')).toHaveCount(0);
    await page.mouse.move(10, 10);
    await page.keyboard.press('ArrowDown');
    const anime = page.locator('.collection-album[data-id="anime"]');
    await expect(anime).toHaveAttribute('aria-current', 'true');
    await expect(anime.locator('.album-cover-detail.sunset-window')).toHaveCSS('opacity', '1');
    await expect(anime.locator('.album-sun-lens')).toHaveAttribute(
      'transform',
      'translate(1347 405)',
    );
    await expect(anime.locator('.album-cover-scene')).toHaveCSS('transform', 'none');
    await expect(anime.locator('.album-lens-source')).toHaveCSS('animation-play-state', 'running');
    const image = anime.locator('.album-cover-scene > img');
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBe(2048);
    const src = await image.getAttribute('src');
    expect(src === cover).toBe(true);
    await anime
      .locator('.collection-art')
      .screenshot({ path: `artifacts/anime-replacement-${visit}.png` });
    await page.keyboard.press('ArrowDown');
    await expect(anime.locator('.album-lens-source')).toHaveCSS('animation-play-state', 'paused');
  }
  await importDemo(page);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByRole('button', { name: '管理专辑与封面', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '专辑与封面', exact: true });
  await dialog.getByRole('button', { name: '动漫', exact: true }).click();
  const option = dialog.getByRole('checkbox', { name: /沿用光斑特效/ });
  await expect(option).toBeChecked();
  await dialog.getByRole('button', { name: '流行', exact: true }).click();
  await expect(option).toHaveCount(0);
  await dialog.getByRole('button', { name: '动漫', exact: true }).click();
  await option.uncheck();
  await dialog.getByRole('button', { name: '保存专辑', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '保存专辑', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/anime-cover-effect-option.png' });
  await dialog.getByRole('button', { name: '关闭专辑设置', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.collection-album[data-id="anime"] .album-cover-detail')).toHaveCount(
    0,
  );
  const stored = await (await page.request.get('/__wfp/maps')).json();
  expect(stored.albums.find((a: { id: string }) => a.id === 'anime').coverEffect).toBe('none');
});

async function openAuthoredCovers(page: Page) {
  await page.addInitScript(() => {
    const tracks: HTMLAudioElement[] = [];
    Object.assign(window, { albumAudio: tracks });
    const Native = window.Audio;
    window.Audio = class extends Native {
      constructor() {
        super();
        tracks.push(this);
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const covers = [
    { id: 'anime', name: '动漫', file: 'anime_album2.png' },
    { id: 'vocaloid', name: '虚拟歌姬', file: 'vocaloid_album2.png' },
  ].map(({ file, ...album }) => ({
    ...album,
    cover: `data:image/png;base64,${readFileSync(`src/assets/albums-illustrations/${file}`).toString('base64')}`,
  }));
  await page.evaluate(async (covers) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('waifu-fit-player-library');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('albums', 'readwrite');
        for (const album of covers) transaction.objectStore('albums').put(album);
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
  }, covers);
  await page.reload();
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.mouse.move(10, 10);
}

test('anime and pop insertion copies keep the clear idle picture and return cleanly', async ({
  page,
}) => {
  await openAuthoredCovers(page);
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains('album-flight-card') && !this.hasAttribute('data-returning')) {
        animation.pause();
        animation.currentTime = 0;
      }
      return animation;
    };
  });
  for (const id of ['anime', 'pop']) {
    const card = page.locator(`.collection-album[data-id="${id}"]`);
    await card.click();
    await expect(page.locator('.album-deck')).toHaveAttribute('data-ready');
    await expect(card).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Enter');
    const flight = page.locator('.album-flight-card');
    await expect(flight).toBeVisible();
    await expect(flight.locator('.collection-art')).not.toHaveAttribute('data-cover-motion');
    await expect(flight.locator('.album-cover-scene')).toHaveCSS('transform', 'none');
    await expect(flight.locator('.album-cover-detail')).toHaveCSS('opacity', '0');
    if (id === 'pop')
      await expect(flight.locator('.album-cover-defocus')).toHaveCSS('display', 'none');
    await flight
      .locator('.collection-art')
      .screenshot({ path: `artifacts/${id}-effect-insertion.png` });
    await page.keyboard.press('Escape');
    await expect(flight).toHaveCount(0);
    await expect(card).toHaveCSS('visibility', 'visible');
    await expect(card.locator('.collection-art')).toHaveAttribute('data-cover-motion');
  }
});

test('anime sunset lens flare stays anchored to the right-hand sun without focus or zoom', async ({
  page,
}) => {
  await openAuthoredCovers(page);
  await expect(page.locator('.collection-art[data-cover-motion]')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  const anime = page.locator('.collection-album[data-id="anime"]');
  await expect(anime).toHaveAttribute('aria-current', 'true');
  await expect(anime.locator('.album-cover-detail.sunset-window')).toBeVisible();
  await expect(page.locator('.album-curtain-sway')).toHaveCount(0);
  await expect
    .poll(() =>
      anime.evaluate((card: HTMLElement) => {
        const shelf = card.parentElement!;
        return Math.abs(
          card.offsetTop + card.offsetHeight / 2 - shelf.scrollTop - shelf.clientHeight / 2,
        );
      }),
    )
    .toBeLessThan(5);
  const titleWidth = await anime
    .locator('.collection-label')
    .evaluate((label: HTMLElement) => label.offsetWidth);
  await expect(anime.locator('.album-cover-defocus')).toHaveCount(0);
  await expect(anime.locator('.album-cover-scene')).toHaveCSS('transform', 'none');
  expect(
    await anime
      .locator('.album-cover-scene')
      .evaluate(
        (scene) =>
          scene.getAnimations().filter((animation) => animation.id === 'album-cover-drift').length,
      ),
  ).toBe(0);
  await expect(anime.locator('.album-sun-lens')).toHaveAttribute(
    'transform',
    'translate(1347 405)',
  );
  expect(
    await anime.locator('.collection-label').evaluate((label: HTMLElement) => label.offsetWidth),
  ).toBe(titleWidth);
  await anime.locator('.album-lens-source').evaluate((glow) => {
    const animation = glow.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
  });
  await expect(anime.locator('.album-lens-source')).toHaveCSS('opacity', '0.588');
  await expect(anime.locator('.album-sun-lens polygon, .album-sun-lens [stroke]')).toHaveCount(0);
  await expect(anime.locator('.album-cover-detail')).toHaveCSS('mix-blend-mode', 'screen');
  await anime.locator('.collection-art').screenshot({ path: 'artifacts/anime-lens-rest.png' });
  await anime.locator('.album-lens-source, .album-lens-ghost').evaluateAll((lights) => {
    for (const light of lights) {
      const animation = light.getAnimations()[0];
      animation.pause();
      animation.currentTime = 900;
    }
  });
  await expect(anime.locator('.album-lens-source')).toHaveCSS('opacity', '0.84');
  await anime.locator('.collection-art').screenshot({ path: 'artifacts/anime-lens-sunlight.png' });
  await page.screenshot({ path: 'artifacts/album-cover-anime-1080p.png' });

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const vinyl = page.locator('.collection-album[data-id="vocaloid"]');
  await expect(vinyl).toHaveAttribute('aria-current', 'true');
  await expect
    .poll(() =>
      vinyl.evaluate((card: HTMLElement) => {
        const shelf = card.parentElement!;
        return Math.abs(
          card.offsetTop + card.offsetHeight / 2 - shelf.scrollTop - shelf.clientHeight / 2,
        );
      }),
    )
    .toBeLessThan(5);
  await expect(vinyl.locator('.album-cover-detail.vinyl')).toBeVisible();
  await expect(vinyl.locator('.album-vinyl-spin')).toHaveCount(1);
  await expect(vinyl.locator('.album-vinyl-spin .album-vinyl-disc')).toHaveCount(1);
  await expect(
    vinyl.locator('.album-vinyl-reflection, .album-vinyl-grooves, .album-vinyl-label-mark'),
  ).toHaveCount(0);
  await expect(anime.locator('.album-cover-detail')).toHaveCSS('opacity', '0');
  await expect(anime.locator('.album-lens-source')).toHaveCSS('animation-play-state', 'paused');
  await expect(vinyl.locator('.album-vinyl-spin').first()).toHaveCSS(
    'animation-play-state',
    'running',
  );
  await vinyl.locator('.album-vinyl-spin').evaluateAll((elements) => {
    for (const element of elements) {
      const animation = element.getAnimations()[0];
      animation.pause();
      animation.currentTime = 3500;
    }
  });
  await expect(vinyl.locator('.album-vinyl-foreground')).toHaveCSS('transform', 'none');
  await page.screenshot({ path: 'artifacts/album-cover-vinyl-1080p.png' });
  await page.evaluate(() =>
    (window as unknown as { albumAudio: HTMLAudioElement[] }).albumAudio[0].pause(),
  );
  await expect(vinyl.locator('.album-cover-detail')).not.toHaveAttribute('data-playing');
  await expect(vinyl.locator('.album-vinyl-spin').first()).toHaveCSS(
    'animation-play-state',
    'paused',
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.collection-art[data-cover-motion]')).toHaveCount(0);
  await expect(vinyl.locator('.album-cover-detail')).toHaveCSS('display', 'block');
  await expect(vinyl.locator('.album-cover-detail')).toHaveCSS('opacity', '1');
  await expect(vinyl.locator('.album-vinyl-spin')).toHaveCSS('animation-name', 'none');
  expect(
    await vinyl.locator('.album-cover-scene').evaluate((scene) => scene.getAnimations().length),
  ).toBe(0);
});

test('album-specific scenes keep their static layers, animate only the selection and share live BGM spectrum', async ({
  page,
}) => {
  await openAuthoredCovers(page);
  const all = page.locator('.collection-album[data-id="all"]');
  const vinyl = page.locator('.collection-album[data-id="vocaloid"]');
  const pop = page.locator('.collection-album[data-id="pop"]');
  await expect(vinyl.locator('.album-cover-detail')).toHaveAttribute('data-persistent', 'true');
  await expect(vinyl.locator('.album-cover-detail')).toHaveCSS('opacity', '1');
  await expect(vinyl.locator('.album-vinyl-spin')).toHaveCSS('animation-play-state', 'paused');
  const idleFace = await vinyl.locator('.album-vinyl-disc').getAttribute('href');
  await expect(all.locator('.album-vinyl-spin')).toHaveCSS('animation-play-state', 'running');
  await expect
    .poll(() =>
      all
        .locator('.album-wave-bar')
        .evaluateAll(
          (bars) =>
            bars.filter((bar) => (bar as SVGElement).style.getPropertyValue('--spectrum')).length,
        ),
    )
    .toBe(18);
  const levels = await all
    .locator('.album-wave-bar')
    .evaluateAll((bars) =>
      bars.map((bar) => Number((bar as SVGElement).style.getPropertyValue('--spectrum'))),
    );
  expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.01);
  await all.locator('.album-vinyl-spin').evaluate((node) => {
    const animation = node.getAnimations()[0];
    animation.pause();
    animation.currentTime = 1750;
  });
  await page.screenshot({ path: 'artifacts/album-cover-all-1080p.png' });

  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(vinyl).toHaveAttribute('aria-current', 'true');
  await expect(vinyl.locator('.album-vinyl-disc')).toHaveAttribute('href', idleFace!);
  await expect(vinyl.locator('.album-cover-detail')).toHaveCSS('opacity', '1');

  await page.keyboard.press('ArrowUp');
  await expect(pop).toHaveAttribute('aria-current', 'true');
  await expect(pop.locator('.album-cover-defocus')).toHaveCount(1);
  await expect(pop.locator('.album-stage-light')).toHaveCount(2);
  await expect(pop.locator('.album-glowsticks')).toHaveCount(2);
  await expect
    .poll(() =>
      pop
        .locator('.album-cover-scene')
        .evaluate(
          (scene) =>
            scene
              .getAnimations({ subtree: true })
              .filter((animation) =>
                ['album-cover-drift', 'album-cover-focus', 'album-cover-glint'].includes(
                  animation.id,
                ),
              ).length,
        ),
    )
    .toBe(3);
  const startTimes = await pop.locator('.album-cover-scene').evaluate((scene) =>
    scene
      .getAnimations({ subtree: true })
      .filter((animation) =>
        ['album-cover-drift', 'album-cover-focus', 'album-cover-glint'].includes(animation.id),
      )
      .map((animation) => animation.startTime),
  );
  expect(new Set(startTimes).size).toBe(1);
  const setFocusTime = async (time: number) =>
    pop.locator('.album-cover-scene').evaluate((scene, time) => {
      for (const animation of scene.getAnimations({ subtree: true })) {
        if (!['album-cover-drift', 'album-cover-focus', 'album-cover-glint'].includes(animation.id))
          continue;
        animation.pause();
        animation.currentTime = time;
      }
    }, time);
  await setFocusTime(0);
  await expect(pop.locator('.album-cover-defocus')).toHaveCSS('opacity', '0');
  await expect(pop.locator('.album-cover-scene')).toHaveCSS('transform', 'none');
  await expect(pop.locator('.album-earring-glint')).toHaveCSS('opacity', '0');
  const focusDuration = await pop.locator('.album-cover-scene').evaluate(
    (scene) =>
      scene
        .getAnimations()
        .find((animation) => animation.id === 'album-cover-drift')!
        .effect!.getTiming().duration,
  );
  expect(focusDuration).toBe(3000);
  await setFocusTime(1500);
  await expect(pop.locator('.album-cover-defocus')).toHaveCSS('opacity', '0.9');
  await expect(pop.locator('.album-earring-glint')).toHaveCSS('opacity', '0');
  expect(
    await pop
      .locator('.album-cover-scene')
      .evaluate((scene) => new DOMMatrix(getComputedStyle(scene).transform).a),
  ).toBeCloseTo(1.02, 3);
  await pop.locator('.collection-art').screenshot({ path: 'artifacts/pop-focus-near.png' });
  for (const time of [750, 2250, 2499]) {
    await setFocusTime(time);
    await expect(pop.locator('.album-earring-glint')).toHaveCSS('opacity', '0');
  }
  await setFocusTime(2500);
  await expect(pop.locator('.album-earring-glint')).toHaveCSS('opacity', '0');
  await setFocusTime(2625);
  await expect(pop.locator('.album-earring-glint')).toHaveCSS('opacity', '0.5');
  await setFocusTime(2750);
  await expect(pop.locator('.album-cover-defocus')).toHaveCSS('opacity', '0');
  await expect(pop.locator('.album-earring-glint')).toHaveCSS('opacity', '1');
  await pop.locator('.collection-art').screenshot({ path: 'artifacts/pop-focus-clear.png' });
  await setFocusTime(2875);
  await expect(pop.locator('.album-earring-glint')).toHaveCSS('opacity', '0.5');
  await setFocusTime(3000);
  await expect(pop.locator('.album-cover-defocus')).toHaveCSS('opacity', '0');
  expect(
    await pop
      .locator('.album-earring-glint')
      .evaluate((node) => Number(getComputedStyle(node).opacity)),
  ).toBeCloseTo(0, 6);
  await expect(vinyl.locator('.album-cover-detail')).toHaveCSS('opacity', '1');
  await expect(vinyl.locator('.album-vinyl-spin')).toHaveCSS('animation-play-state', 'paused');
  await expect
    .poll(() =>
      pop.evaluate((card: HTMLElement) => {
        const shelf = card.parentElement!;
        return Math.abs(
          card.offsetTop + card.offsetHeight / 2 - shelf.scrollTop - shelf.clientHeight / 2,
        );
      }),
    )
    .toBeLessThan(5);
  await pop
    .locator('.album-cover-detail')
    .evaluate((node) => (node as SVGElement).style.setProperty('--music-beat', '.7'));
  await setFocusTime(2750);
  await page.screenshot({ path: 'artifacts/album-cover-pop-1080p.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(pop.locator('.album-cover-detail')).toHaveCSS('display', 'none');
  await expect(pop.locator('.album-cover-defocus')).toHaveCSS('display', 'none');
});
