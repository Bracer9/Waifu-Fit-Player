import { expect, test } from '@playwright/test';
import { importDemo } from './helpers/project';

test('菜单齿轮固定一致，前进返回动画与菜单操作音效', async ({ page }) => {
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
  await expect(page.getByLabel('音效（SE）音量', { exact: true })).toHaveValue('0.5');
  await page.getByLabel('菜单 BGM 音量', { exact: true }).fill('0.4');
  await page.getByLabel('游戏／视频音量', { exact: true }).fill('0.2');
  await page.getByLabel('音效（SE）音量', { exact: true }).fill('0.3');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const freeze = await page.addStyleTag({
    content: '.menu-curtain-sheet { animation-play-state: paused !important; }',
  });
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveAttribute('data-direction', 'forward');
  await expect(page.locator('.menu-curtain')).toHaveAttribute('data-phase', 'cover');
  await page.evaluate(() => {
    document.getAnimations().forEach((animation) => {
      if ((animation as CSSAnimation).animationName === 'menu-curtain-cover')
        animation.currentTime = 130;
    });
  });
  await expect(page.locator('.title-menu')).toBeVisible();
  await expect(page.locator('.music-menu')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/menu-curtain-closing.png' });
  const finishCurtain = () =>
    page.evaluate(() =>
      document.getAnimations().forEach((animation) => {
        if ((animation as CSSAnimation).animationName?.startsWith('menu-curtain-'))
          animation.finish();
      }),
    );
  await finishCurtain();
  await expect(page.locator('.menu-curtain')).toHaveAttribute('data-phase', 'reveal');
  await expect(page.locator('.title-menu')).toHaveCount(0);
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  expect(
    await page.locator('.menu-curtain-sheet').evaluate((sheet: HTMLElement) => {
      const box = sheet.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(sheet).transform);
      return [0, innerHeight].every((y) => {
        const center = box.x + box.width / 2 + matrix.c * (y - box.y - box.height / 2);
        return center - sheet.offsetWidth / 2 <= 0 && center + sheet.offsetWidth / 2 >= innerWidth;
      });
    }),
  ).toBe(true);
  await page.screenshot({ path: 'artifacts/menu-curtain-covered.png' });
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => {
      if ((animation as CSSAnimation).animationName === 'menu-curtain-reveal')
        animation.currentTime = 210;
    }),
  );
  await page.screenshot({ path: 'artifacts/menu-curtain-revealing.png' });
  await finishCurtain();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await freeze.evaluate((node) => node.parentNode?.removeChild(node));
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
  await expect(page.locator('.menu-curtain')).toHaveAttribute('data-direction', 'back');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  expect(await gear.boundingBox()).toEqual(bounds);
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await expect(page.locator('.menu-curtain')).toHaveAttribute('data-direction', 'back');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  expect(await gear.boundingBox()).toEqual(bounds);
  const sounds = await page.evaluate(
    () =>
      (
        window as unknown as {
          uiSoundEvents: { name: string; volume: number }[];
        }
      ).uiSoundEvents,
  );
  const expected = ['settings', 'back', 'mode', 'album', 'song', 'back', 'back', 'back'];
  expect(sounds.map((s) => s.name)).toEqual(expected);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { uiSoundsPlayed: string[] }).uiSoundsPlayed),
    )
    .toEqual(expected);
  expect(sounds[0].volume).toBe(0.5);
  expect(sounds.slice(1).every((s) => Math.abs(s.volume - 0.3) < 0.001)).toBe(true);

  const checkSound = async (action: () => Promise<unknown>, name: string) => {
    const events = () =>
      page.evaluate(() =>
        (window as unknown as { uiSoundEvents: { name: string }[] }).uiSoundEvents.map(
          (s) => s.name,
        ),
      );
    const before = (await events()).length;
    await action();
    await expect.poll(async () => (await events()).slice(before)).toEqual([name]);
  };
  const click = (name: string) => () => page.getByRole('button', { name, exact: true }).click();
  await checkSound(click('选择主界面 BGM'), 'settings');
  for (const name of ['列表循环', '随机', '单曲循环']) await checkSound(click(name), 'settings');
  await checkSound(() => page.locator('.theme-track').first().click(), 'settings');
  await checkSound(click('暂停菜单 BGM'), 'settings');
  await checkSound(click('关闭主界面音乐'), 'back');
  await checkSound(click('选择主界面 BGM'), 'settings');
  await expect(page.getByRole('button', { name: '播放菜单 BGM', exact: true })).toBeVisible();
  await checkSound(click('播放菜单 BGM'), 'settings');
  await checkSound(() => page.keyboard.press('Escape'), 'back');
  await checkSound(() => gear.click(), 'settings');
  await checkSound(click('关闭设置'), 'back');
  await checkSound(() => gear.click(), 'settings');
  await checkSound(() => page.keyboard.press('Escape'), 'back');

  // SE mute persists and does not change either music volume.
  await gear.click();
  await page.getByLabel('音效（SE）音量', { exact: true }).fill('0');
  await page.reload();
  await gear.click();
  await expect(page.getByLabel('音效（SE）音量', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('菜单 BGM 音量', { exact: true })).toHaveValue('0.4');
  await expect(page.getByLabel('游戏／视频音量', { exact: true })).toHaveValue('0.2');
  expect(
    await page.evaluate(() => (window as unknown as { uiSoundEvents: unknown[] }).uiSoundEvents),
  ).toEqual([]);
  // Muting BGM does not mute SE, including after a reload.
  await page.getByLabel('菜单 BGM 音量', { exact: true }).fill('0');
  await page.getByLabel('音效（SE）音量', { exact: true }).fill('0.3');
  await checkSound(click('完成'), 'back');
  await page.reload();
  await checkSound(() => gear.click(), 'settings');
  await expect(page.getByLabel('音效（SE）音量', { exact: true })).toHaveValue('0.3');
  await expect(page.getByLabel('菜单 BGM 音量', { exact: true })).toHaveValue('0');
  expect(
    await page.evaluate(
      () => (window as unknown as { uiSoundEvents: { volume: number }[] }).uiSoundEvents[0].volume,
    ),
  ).toBe(0.3);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: 'artifacts/menu-se-settings-720.png' });
  await checkSound(click('完成'), 'back');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/menu-gear-albums-720.png' });
  await page.locator('.collection-album').first().click();
  await page.screenshot({ path: 'artifacts/menu-gear-songs-720.png' });
  const start = await page.getByRole('button', { name: '开始', exact: true }).boundingBox();
  expect(start!.y + start!.height).toBeLessThan(720);
  expect(errors).toEqual([]);
});
