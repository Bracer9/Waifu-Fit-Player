import { expect, test } from '@playwright/test';
import { importDemo } from './helpers/project';

test('菜单齿轮固定一致，前进返回动画与四类点击音效', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const events: { name: string; volume: number }[] = [];
    const played: string[] = [];
    Object.assign(window, { uiSoundEvents: events, uiSoundsPlayed: played });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.menuSound)
        events.push({ name: this.dataset.menuSound, volume: this.volume });
      const result = play.call(this);
      if (this.dataset.menuSound)
        void result.then(() => played.push(this.dataset.menuSound!)).catch(() => {});
      return result;
    };
  });
  await page.goto('/');
  await importDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('touhou');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await page.mouse.move(10, 10);
  const gear = page.getByRole('button', { name: '全局设置', exact: true });
  const bounds = await gear.boundingBox();
  expect(bounds!.width).toBe(112);
  expect((await gear.locator('svg').boundingBox())!.width).toBe(96);
  await page.screenshot({ path: 'artifacts/menu-gear-home.png' });
  await gear.click();
  await page.getByLabel('菜单 BGM 音量', { exact: true }).fill('0.4');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-scene')).toHaveAttribute('data-direction', 'forward');
  await page.evaluate(() => {
    document.getAnimations().forEach((animation) => {
      if (['menu-pop-in', 'menu-color-swipe'].includes((animation as CSSAnimation).animationName)) {
        animation.pause();
        animation.currentTime = 160;
      }
    });
  });
  await page.screenshot({ path: 'artifacts/menu-transition-forward.png' });
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()));
  await page.mouse.move(10, 10);
  expect(await gear.boundingBox()).toEqual(bounds);
  await page.screenshot({ path: 'artifacts/menu-gear-albums.png' });
  await page.locator('.collection-album').first().click();
  await expect(page.getByRole('region', { name: '选择单曲' })).toBeVisible();
  expect(await gear.boundingBox()).toEqual(bounds);
  await page.locator('.record-card').first().click();
  await expect(page.getByRole('dialog')).toContainText('开始这首曲子');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '选择专辑', exact: true }).click();
  await expect(page.locator('.menu-scene')).toHaveAttribute('data-direction', 'back');
  expect(await gear.boundingBox()).toEqual(bounds);
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await expect(page.locator('.menu-scene')).toHaveAttribute('data-direction', 'back');
  expect(await gear.boundingBox()).toEqual(bounds);
  const sounds = await page.evaluate(
    () =>
      (
        window as unknown as {
          uiSoundEvents: { name: string; volume: number }[];
        }
      ).uiSoundEvents,
  );
  expect(sounds.map((s) => s.name)).toEqual(['settings', 'mode', 'album', 'song']);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { uiSoundsPlayed: string[] }).uiSoundsPlayed),
    )
    .toEqual(['settings', 'mode', 'album', 'song']);
  expect(sounds.slice(1).every((s) => Math.abs(s.volume - 0.18) < 0.001)).toBe(true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-swipe')).toHaveCSS('display', 'none');
  await expect(page.locator('.menu-scene')).toHaveCSS('animation-name', 'none');
  await page.screenshot({ path: 'artifacts/menu-gear-albums-720.png' });
  await page.locator('.collection-album').first().click();
  await page.screenshot({ path: 'artifacts/menu-gear-songs-720.png' });
  const start = await page.getByRole('button', { name: '开始', exact: true }).boundingBox();
  expect(start!.y + start!.height).toBeLessThan(720);
  expect(errors).toEqual([]);
});
