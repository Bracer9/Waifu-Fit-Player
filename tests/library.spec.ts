import { readSongs, putAlbums } from './helpers/library';
import { expect, test, type Page } from '@playwright/test';
import { blankChart } from '../src/model';
import { insertAlbum, importDemo, holdStart } from './helpers/project';
import { createCalorieIndex } from '../src/calories';

const songs = readSongs;

test('retired album stays absent after loading saved metadata and the four remaining albums navigate normally', async ({
  page,
}) => {
  await page.goto('/');
  await putAlbums(page, [{ id: 'touhou', name: 'Retired album', cover: '' }]);
  await page.reload();
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.collection-album')).toHaveCount(4);
  await expect(page.locator('.collection-album[data-id="touhou"]')).toHaveCount(0);
  for (const [index, id] of ['all', 'anime', 'pop', 'vocaloid'].entries()) {
    if (index) await page.keyboard.press('ArrowDown');
    await expect(page.locator('.collection-album[aria-current="true"]')).toHaveAttribute(
      'data-id',
      id,
    );
  }
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.collection-album[aria-current="true"]')).toHaveAttribute(
    'data-id',
    'vocaloid',
  );
  await page.screenshot({ path: 'artifacts/albums-four-categories.png' });
  await importDemo(page);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await expect(page.getByLabel('所属专辑').locator('option[value="touhou"]')).toHaveCount(0);
  await page.getByRole('button', { name: '管理专辑与封面', exact: true }).click();
  const tabs = page.locator('.album-edit-tabs');
  await expect(tabs.getByRole('button')).toHaveCount(5); // Four categories plus New album.
  await expect(tabs).not.toContainText('Retired album');
});
async function publish(page: Page) {
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  if (!(await page.getByLabel('所属专辑').inputValue()))
    await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: /确认(发布|更新发布)/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('健身与舞蹈谱独立发布、编辑、撤下、删除与重开', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/menu-home.png' });
  await page.getByRole('button', { name: /创作模式/ }).click();
  await expect(page.getByRole('button', { name: '新建', exact: true })).toBeVisible();
  const chart = blankChart('Dance workout');
  chart.notes = [{ id: 'workout', lane: 'squat', direction: 'down', timeMs: 1000, kind: 'tap' }];
  await importDemo(page, chart);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await expect(page.getByLabel('谱面类型')).toHaveValue('dance');
  await page.getByLabel('舞蹈难度').fill('8.5');
  await page.getByLabel('舞蹈难度').press('Enter');
  await expect(page.getByLabel('所属专辑')).toHaveValue('');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('曲目 → 所属专辑');
  await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('动漫');
  await expect(page.getByLabel('发布专辑')).toHaveCount(0);
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const dance = (await songs(page))[0].released.dance!;
  expect(dance.albumId).toBe('anime');
  expect(dance.chart.danceDifficulty).toBe(8.5);
  expect(dance.cover.startsWith('/__wfp/map-file/')).toBe(true);
  await page.getByLabel('谱面类型').selectOption('fitness');
  await expect(page.getByLabel('谱面类型')).toHaveValue('fitness');
  await page.getByLabel('作品名称').fill('Sunlight FITNESS');
  await page.getByLabel('运动强度').selectOption('medium');
  await page.getByLabel('所属专辑').selectOption('pop');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('流行');
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let stored = (await songs(page))[0];
  expect(stored.released.dance).toEqual(dance);
  expect(stored.released.fitness!.albumId).toBe('pop');
  expect(stored.released.fitness!.chart.title).toBe('Sunlight FITNESS');
  expect(stored.released.fitness!.chart.intensity).toBe('medium');
  await page.getByLabel('作品名称').fill('未发布修改');
  await page.getByLabel('运动强度').selectOption('high');
  await page.getByRole('button', { name: '音游模式', exact: true }).click();
  await expect(page.locator('.collection-album').first()).toContainText('全部曲目');
  await page.screenshot({ path: 'artifacts/menu-albums.png' });
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await expect(page.getByRole('button', { name: 'DANCE', exact: true })).toContainText('8.5');
  await expect(page.getByRole('button', { name: 'FITNESS', exact: true })).toContainText('MEDIUM');
  await page.getByRole('button', { name: 'FITNESS', exact: true }).click();
  await expect(page.locator('.selection-title h2')).toHaveText('Sunlight FITNESS');
  await expect(page.locator('.record-overline')).toContainText('INTENSITY');
  await expect(page.locator('.record-overline')).toContainText('MEDIUM');
  await expect(page.locator('.record-timing')).toContainText('BPM');
  const card = page.locator('.record-card[aria-current="true"]');
  await card.hover();
  await expect(card.locator('.cover-trace')).toHaveCSS('opacity', '1');
  await expect(card.locator('.cover-trace rect').first()).toHaveCSS(
    'animation-name',
    'cover-orbit',
  );
  await page.screenshot({ path: 'artifacts/menu-songs.png' });
  expect(await page.locator('.menu-app').evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual([
    0, 0,
  ]);
  await page.getByRole('button', { name: 'DANCE', exact: true }).click();
  await expect(card.locator('.record-overline')).toContainText(
    (createCalorieIndex(dance.chart.notes).at(-1)?.kcal ?? 0).toFixed(1),
  );
  await expect(card.locator('.record-timing')).toContainText(
    String(dance.chart.tempoSegments[0].bpm),
  );
  expect(
    await card.evaluate((el) => {
      const caption = el.querySelector('.record-caption')!.getBoundingClientRect();
      const title = el.querySelector('.record-title')!.getBoundingClientRect();
      const timing = el.querySelector('.record-timing')!.getBoundingClientRect();
      return (
        timing.left > title.right && timing.bottom <= caption.bottom && timing.top >= caption.top
      );
    }),
  ).toBe(true);
  await card.click();
  await expect(page.getByRole('dialog')).toContainText('HOLD ENTER TO START');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  await page.keyboard.press('Enter');
  // Observing "3" can happen partway through its first second; time from the action.
  const countdownStart = Date.now();
  await holdStart(page);
  const countdown = page.getByRole('timer');
  await expect(countdown).toHaveText('3');
  await page.keyboard.press('Space');
  await page.screenshot({ path: 'artifacts/game-countdown.png' });
  expect(
    await page.locator('video').evaluate((v: HTMLVideoElement) => [v.paused, v.currentTime]),
  ).toEqual([true, 0]);
  await expect(countdown).toHaveText('2');
  await expect(countdown).toHaveText('1');
  expect(
    await page.locator('video').evaluate((v: HTMLVideoElement) => [v.paused, v.currentTime]),
  ).toEqual([true, 0]);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  expect(Date.now() - countdownStart).toBeGreaterThan(2200);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(page.locator('.play-lane')).toHaveCount(5);
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'BACK TO SELECT', exact: true }).click();
  await expect(page.getByRole('button', { name: 'DANCE', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await card.click();
  await holdStart(page);
  await expect(countdown).toHaveText('3');
  await page.keyboard.press('Escape');
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  // A cancelled countdown must not start audio three seconds later in the menu.
  await page.waitForTimeout(3100);
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect(page.getByRole('button', { name: '管理曲目', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '编辑谱面', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeEnabled();
  expect((await songs(page))[0].released.dance).toEqual(dance);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByRole('button', { name: '管理曲目', exact: true }).click();
  const danceRow = page.locator('.managed-edition').filter({ has: page.locator('b.dance') });
  await danceRow.getByRole('button', { name: '撤下发布' }).click();
  await expect(danceRow).toContainText('未发布');
  stored = (await songs(page))[0];
  expect(stored.drafts.dance).toBeTruthy();
  expect(stored.released.dance).toBeUndefined();
  expect(stored.released.fitness).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: /创作模式/ }).click();
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  await page.getByRole('button', { name: '从 WAIFU 删除' }).click();
  await expect(page.locator('.managed-song')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭本地作品' }).click();
  await page.getByRole('button', { name: '音游模式', exact: true }).click();
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await expect(page.getByRole('heading', { name: '这张专辑还没有歌曲' })).toBeVisible();
  await page.reload();
  expect(await songs(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('自定义专辑封面、分组与曲绘保存', async ({ page }) => {
  await page.goto('/');
  await importDemo(page, {
    ...blankChart('Dance workout'),
    notes: [{ id: 'n', lane: 'squat', direction: 'down', timeMs: 1000, kind: 'tap' }],
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByRole('button', { name: '管理专辑与封面' }).click();
  await page.getByRole('button', { name: '新建专辑' }).click();
  await page.getByLabel('专辑名称').fill('自定义专辑');
  await page
    .getByLabel('选择专辑封面')
    .setInputFiles('src/assets/albums-illustrations/all_album.png');
  await expect(page.locator('.album-cover-preview img')).toBeVisible();
  expect(
    await page
      .locator('.album-cover-preview img')
      .evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]),
  ).toEqual([2345, 670]);
  await page.getByRole('button', { name: '保存专辑' }).click();
  await expect(page.getByRole('button', { name: '自定义专辑', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭专辑设置' }).click();
  await page.getByLabel('所属专辑').selectOption({ label: '自定义专辑' });
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByLabel('发布类型').selectOption('fitness');
  await expect(page.getByLabel('发布类型')).toHaveValue('fitness');
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await songs(page))[0].released.fitness).toBeTruthy();
  await page.getByRole('button', { name: '音游模式', exact: true }).click();
  const album = page.locator('.collection-album').filter({ hasText: '自定义专辑' });
  await expect(album.locator('img')).toHaveAttribute('src', /^data:image\/png/);
  await album.click();
  await insertAlbum(page);
  await expect(page.locator('.record-card')).toHaveCount(1);
});

test('多首歌曲滚动选择居中，返回保留专辑和曲目', async ({ page }) => {
  await page.goto('/');
  await importDemo(page, {
    ...blankChart('Dance workout'),
    notes: [{ id: 'n', lane: 'squat', direction: 'down', timeMs: 1000, kind: 'tap' }],
  });
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
            song.released.dance!.chart.songId = song.id;
            song.released.dance!.chart.title = `Test song ${i}`;
            song.released.dance!.updatedAt += i;
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
  await page.locator('.collection-album').filter({ hasText: '动漫' }).click();
  await insertAlbum(page);
  await expect(page.locator('.record-card')).toHaveCount(5);
  await expect(page.getByRole('button', { name: '上一首', exact: true })).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: '上一首', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '下一首', exact: true })).toBeVisible();
  const gapButtons = await page.locator('.record-card[aria-current="true"]').evaluate((card) => {
    const box = card.getBoundingClientRect();
    const left = card.previousElementSibling!.getBoundingClientRect();
    const right = card.nextElementSibling!.getBoundingClientRect();
    const previous = document.querySelector('.carousel-arrow.previous')!.getBoundingClientRect();
    const next = document.querySelector('.carousel-arrow.next')!.getBoundingClientRect();
    return (
      previous.left > left.right &&
      previous.right < box.left &&
      next.left > box.right &&
      next.right < right.left
    );
  });
  expect(gapButtons).toBe(true);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.collection-album[aria-current="true"]')).toContainText('动漫');
  await expect(page.locator('.collection-album[data-id="anime"]')).toHaveAttribute(
    'data-highlighted',
  );
  await page.locator('.collection-album[aria-current="true"]').click();
  await insertAlbum(page);
  await expect(page.locator('.record-card[aria-current="true"]')).toContainText('Test song 3');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/menu-carousel.png' });
  await page.getByRole('button', { name: '下一首', exact: true }).hover();
  await page.mouse.wheel(0, 120);
  await expect(page.locator('.record-card[aria-current="true"]')).toContainText('Test song 2');
  await expect(page.locator('.song-carousel')).not.toHaveAttribute('data-wheel-scrolling');
  await page.locator('.record-card[aria-current="true"]').hover();
  await page.mouse.wheel(0, -120);
  await expect(page.locator('.record-card[aria-current="true"]')).toContainText('Test song 3');
  await expect(page.locator('.song-carousel')).not.toHaveAttribute('data-wheel-scrolling');
  expect(
    await page.locator('.record-card[aria-current="true"] .record-overline').evaluate((el) => {
      const stats = el.getBoundingClientRect();
      const area = el.closest('.song-carousel')!.getBoundingClientRect();
      return stats.top >= area.top && stats.bottom <= area.bottom;
    }),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.record-card[aria-current="true"]').hover();
  await expect(
    page.locator('.record-card[aria-current="true"] .cover-trace rect').first(),
  ).toHaveCSS('animation-name', 'none');
  for (let index = 0; index < 3; index++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: '下一首', exact: true })).toHaveCount(0);
  const previous = page.getByRole('button', { name: '上一首', exact: true });
  await previous.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '下一首', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
