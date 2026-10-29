import { expect, test } from '@playwright/test';
import { insertAlbum, importDemo } from './helpers/project';
import { blankChart } from '../src/model';

test('菜单齿轮归位一致，前进返回动画与菜单操作音效', async ({ page }) => {
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
  await importDemo(page, {
    ...blankChart('Menu navigation'),
    notes: [{ id: 'n', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 }],
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await page.mouse.move(10, 10);
  const gear = page.getByRole('button', { name: '全局设置', exact: true });
  const bounds = await gear.boundingBox();
  expect(bounds!.width).toBe(112);
  expect((await gear.locator(':scope > svg').boundingBox())!.width).toBe(96);
  const selectGuide = page.locator('.menu-control-select');
  const enterGuide = page.locator('.menu-control-enter');
  const guideBounds = [await selectGuide.boundingBox(), await enterGuide.boundingBox()];
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
  await page.locator('.play-mode').hover();
  await expect(page.locator('.play-mode .cover-trace')).toHaveCSS('opacity', '1');
  await expect(page.locator('.play-mode .cover-trace rect').first()).toHaveCSS(
    'animation-name',
    'cover-orbit',
  );
  await page.screenshot({ path: 'artifacts/menu-gear-home.png' });
  await gear.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { uiSoundsPlayed: string[] }).uiSoundsPlayed.at(-1),
      ),
    )
    .toBe('settings');
  await expect(page.getByLabel('音效（SE）音量', { exact: true })).toHaveValue('0.5');
  await page.getByRole('slider', { name: '菜单 BGM 音量', exact: true }).fill('0.4');
  await page.getByLabel('游戏／视频音量', { exact: true }).fill('0.2');
  await page.getByLabel('音效（SE）音量', { exact: true }).fill('0.3');
  await page.keyboard.press('Escape');
  // Let the close sound start before the next gesture interrupts the shared SE player.
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { uiSoundsPlayed: string[] }).uiSoundsPlayed.at(-1),
      ),
    )
    .toBe('back');
  const beat = await page.addStyleTag({
    content: '.menu-app :is(.ambient-shape, .menu-settings) { --music-beat: 0.73 !important; }',
  });
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Object.assign(window, { originalMenuAnimate: animate });
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (
        this.classList.contains('menu-scene') ||
        this.classList.contains('ambient-shape') ||
        this.classList.contains('liquid-menu-curtain')
      )
        animation.pause();
      return animation;
    };
  });
  await page.getByRole('button', { name: /舞蹈模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveAttribute('data-direction', 'forward');
  await expect(page.locator('.menu-curtain')).toHaveAttribute('data-phase', 'cover');
  await expect(page.locator('.liquid-menu-curtain')).toBeVisible();
  await expect(page.locator('.menu-scene')).toHaveCSS('opacity', '1');
  expect(await gear.boundingBox()).toEqual(bounds);
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => {
      if (
        animation.id.startsWith('menu-scene-') ||
        animation.id.startsWith('menu-corner-') ||
        animation.id.startsWith('menu-liquid-')
      )
        animation.currentTime = 70;
    }),
  );
  await expect(page.locator('.title-menu')).toBeVisible();
  await expect(page.locator('.music-menu')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.menu-curtain')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/menu-curtain-closing.png' });
  const finishMenu = () =>
    page.evaluate(() =>
      document.getAnimations().forEach((animation) => {
        if (
          animation.id.startsWith('menu-scene-') ||
          animation.id.startsWith('menu-corner-') ||
          animation.id.startsWith('menu-liquid-')
        )
          animation.finish();
      }),
    );
  await finishMenu();
  await expect(page.locator('.menu-curtain')).toHaveAttribute('data-phase', 'reveal');
  await expect(page.locator('.title-menu')).toHaveCount(0);
  await expect(page.locator('.music-menu.albums')).toBeAttached();
  await expect(page.locator('.menu-scene')).toHaveCSS('opacity', '1');
  // The liquid retreat now returns the gear attached to the pink corner from offscreen.
  const coveredGear = (await gear.boundingBox())!;
  expect(coveredGear.x).toBe(bounds!.x);
  expect(coveredGear.y + coveredGear.height).toBeLessThan(0);
  await page.screenshot({ path: 'artifacts/menu-curtain-covered.png' });
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => {
      if (
        animation.id.startsWith('menu-scene-') ||
        animation.id.startsWith('menu-corner-') ||
        animation.id.startsWith('menu-liquid-')
      )
        animation.currentTime = 100;
    }),
  );
  await page.screenshot({ path: 'artifacts/menu-curtain-revealing.png' });
  await finishMenu();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.menu-scene')).toHaveCSS('opacity', '1');
  await page.evaluate(() => {
    Element.prototype.animate = (
      window as unknown as { originalMenuAnimate: typeof Element.prototype.animate }
    ).originalMenuAnimate;
  });
  await beat.evaluate((node) => node.parentNode?.removeChild(node));
  expect(
    await page.locator('.menu-app > .ambient-shape').evaluateAll((nodes) =>
      nodes.every((node) => {
        const style = (node as HTMLElement).style;
        return (
          !style.transform &&
          !style.scale &&
          !style.visibility &&
          !style.translate &&
          !style.transition
        );
      }),
    ),
  ).toBe(true);
  await page.mouse.move(10, 10);
  expect(await gear.boundingBox()).toEqual(bounds);
  expect([await selectGuide.boundingBox(), await enterGuide.boundingBox()]).toEqual(guideBounds);
  await page.screenshot({ path: 'artifacts/menu-gear-albums.png' });
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await expect(page.getByRole('region', { name: '选择单曲' })).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  expect(await gear.boundingBox()).toEqual(bounds);
  expect([await selectGuide.boundingBox(), await enterGuide.boundingBox()]).toEqual(guideBounds);
  await page.locator('.record-card').first().click();
  await expect(page.getByRole('dialog')).toContainText('HOLD ENTER TO START');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.menu-curtain')).toHaveAttribute('data-direction', 'back');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  expect(await gear.boundingBox()).toEqual(bounds);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
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
  const expected = [
    'settings',
    'back',
    'mode',
    'liquid',
    'settings',
    'insert',
    'song',
    'back',
    'back',
    'back',
    'liquid',
  ];
  expect(sounds.map((s) => s.name)).toEqual(expected);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { uiSoundsPlayed: string[] }).uiSoundsPlayed.filter(
          (name) => name !== 'liquid',
        ),
      ),
    )
    .toEqual(expected.filter((name) => name !== 'liquid'));
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
  await checkSound(click('选择主界面 BGM'), 'settings');
  await page.mouse.move(10, 10);
  await expect(page.getByRole('region', { name: '主界面音乐' })).toBeHidden();
  await checkSound(click('选择主界面 BGM'), 'settings');
  await expect(page.getByRole('button', { name: '播放菜单 BGM', exact: true })).toBeVisible();
  await checkSound(click('播放菜单 BGM'), 'settings');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: '主界面音乐' })).toBeHidden();
  await checkSound(() => gear.click(), 'settings');
  await checkSound(() => gear.click(), 'back');
  await checkSound(() => gear.click(), 'settings');
  await checkSound(() => page.keyboard.press('Escape'), 'back');

  // SE mute persists and does not change either music volume.
  await gear.click();
  await page.getByLabel('音效（SE）音量', { exact: true }).fill('0');
  await page.reload();
  await gear.click();
  await expect(page.getByLabel('音效（SE）音量', { exact: true })).toHaveValue('0');
  await expect(page.getByRole('slider', { name: '菜单 BGM 音量', exact: true })).toHaveValue('0.4');
  await expect(page.getByLabel('游戏／视频音量', { exact: true })).toHaveValue('0.2');
  expect(
    await page.evaluate(() => (window as unknown as { uiSoundEvents: unknown[] }).uiSoundEvents),
  ).toEqual([]);
  // Muting BGM does not mute SE, including after a reload.
  await page.getByRole('slider', { name: '菜单 BGM 音量', exact: true }).fill('0');
  await page.getByLabel('音效（SE）音量', { exact: true }).fill('0.3');
  await checkSound(() => page.keyboard.press('Escape'), 'back');
  await page.reload();
  await checkSound(() => gear.click(), 'settings');
  await expect(page.getByLabel('音效（SE）音量', { exact: true })).toHaveValue('0.3');
  await expect(page.getByRole('slider', { name: '菜单 BGM 音量', exact: true })).toHaveValue('0');
  expect(
    await page.evaluate(
      () => (window as unknown as { uiSoundEvents: { volume: number }[] }).uiSoundEvents[0].volume,
    ),
  ).toBe(0.3);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: 'artifacts/menu-se-settings-1080p.png' });
  await checkSound(() => page.keyboard.press('Escape'), 'back');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: /舞蹈模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/menu-gear-albums-1080p.png' });
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await page.screenshot({ path: 'artifacts/menu-gear-songs-1080p.png' });
  await expect(page.getByRole('button', { name: '开始', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.title-menu')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.create-mode')).toBeFocused();
  await expect(page.locator('.create-mode .cover-trace')).toHaveCSS('opacity', '1');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.play-mode')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-menu')).toBeVisible();
  await page.setViewportSize({ width: 2560, height: 1440 });
  const wideGuides = [await selectGuide.boundingBox(), await enterGuide.boundingBox()];
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  const enter = (await enterGuide.boundingBox())!;
  const gearIcon = (await gear.locator(':scope > svg').boundingBox())!;
  await page.mouse.move(10, 10);
  const back = (await page.locator('.menu-control-back').boundingBox())!;
  const select = (await selectGuide.boundingBox())!;
  const header = (await page.locator('.music-menu-header').boundingBox())!;
  expect(back.x + back.width).toBeCloseTo(gearIcon.x + gearIcon.width, 0);
  expect(back.x + back.width).toBeCloseTo(header.x + header.width, 0);
  expect((await page.locator('.menu-back > svg').boundingBox())!.x).toBeCloseTo(header.x, 0);
  expect(select.x + select.width).toBeLessThan(enter.x);
  expect(enter.x + enter.width).toBeLessThan(back.x);
  expect(back.y + back.height / 2).toBeCloseTo(select.y + select.height / 2, 0);
  expect([await selectGuide.boundingBox(), await enterGuide.boundingBox()]).toEqual(wideGuides);
  await page.screenshot({ path: 'artifacts/menu-controls-albums-2560.png' });
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  expect([await selectGuide.boundingBox(), await enterGuide.boundingBox()]).toEqual(wideGuides);
  await page.screenshot({ path: 'artifacts/menu-controls-songs-2560.png' });
  await page.keyboard.press('Backspace');
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.title-menu')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '新建', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
