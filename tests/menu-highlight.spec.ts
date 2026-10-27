import { putSongs, readSongs } from './helpers/library';
import { expect, test, type Locator } from '@playwright/test';
import { insertAlbum, importDemo } from './helpers/project';
import { blankChart } from '../src/model';

test('卡片流光仅跟随最后一次鼠标或键盘操作', async ({ page }) => {
  const only = async (card: Locator) => {
    await expect(card).toHaveAttribute('data-highlighted', '');
    await expect(page.locator('[data-highlighted]')).toHaveCount(1);
    await expect(page.locator('.cover-trace:visible')).toHaveCount(1);
  };
  let direction = 1;
  const moveWithin = async (card: Locator) => {
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width * (0.5 + direction * 0.05), box.y + box.height * 0.5);
    direction *= -1;
  };
  await page.goto('/');
  const play = page.locator('.play-mode');
  const create = page.locator('.create-mode');
  await play.hover();
  await only(play);
  await page.keyboard.press('ArrowRight');
  await only(create);
  expect(await play.evaluate((node) => node.matches(':hover'))).toBe(true);
  await moveWithin(play);
  await only(play);
  await expect(create).toBeFocused();
  // At the last card, another right-arrow press still reclaims keyboard highlighting.
  await page.keyboard.press('ArrowRight');
  await only(create);
  await moveWithin(play);
  await only(play);
  await page.mouse.move(10, 10);
  await expect(page.locator('.cover-trace:visible')).toHaveCount(0);

  await importDemo(page, {
    ...blankChart('Highlight navigation'),
    notes: [{ id: 'n', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 }],
  });
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const song = structuredClone((await readSongs(page))[0]);
  song.id = crypto.randomUUID();
  song.released.dance!.chart.songId = song.id;
  song.released.dance!.chart.title = 'Second song';
  song.released.dance!.updatedAt += 1;
  await putSongs(page, [song]);
  await page.reload();
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const albums = page.locator('.collection-album');
  await albums.nth(0).hover();
  await only(albums.nth(0));
  await page.keyboard.press('ArrowDown');
  await only(albums.nth(1));
  await albums.nth(0).hover();
  await moveWithin(albums.nth(0));
  await only(albums.nth(0));
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.collection-album[data-highlighted]')).toBeFocused();
  await expect(page.locator('.cover-trace:visible')).toHaveCount(1);

  await albums.nth(0).click();
  await insertAlbum(page);
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const songs = page.locator('.record-card');
  await expect(songs).toHaveCount(2);
  await only(page.locator('.record-card[aria-current="true"]'));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('Second song');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await songs.nth(0).hover();
  await only(songs.nth(0));
  await page.keyboard.press('ArrowRight');
  await only(songs.nth(1));
  await songs.nth(0).hover();
  await moveWithin(songs.nth(0));
  await only(songs.nth(0));
  await page.keyboard.press('ArrowRight');
  await only(songs.nth(1));
});
