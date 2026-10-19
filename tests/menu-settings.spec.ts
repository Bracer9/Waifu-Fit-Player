import { expect, test } from '@playwright/test';
import { importDemo } from './helpers/project';
import { blankChart } from '../src/model';

test('右上几何设置在三页一致，悬停切换等宽标签，共享音量且不挤压主卡片', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const gear = page.getByRole('button', { name: '全局设置', exact: true });
  const settings = page.getByRole('dialog', { name: '全局设置', exact: true });
  const pink = page.locator('.ambient-shape.pink');
  const cards = (await page.locator('.mode-records').boundingBox())!;
  const audioTab = page.getByRole('tab', { name: 'AUDIO', exact: true });
  const systemTab = page.getByRole('tab', { name: 'SYSTEM', exact: true });
  const verifyWidth = async () => {
    const tabs = (await page.getByRole('tablist', { name: '设置分类' }).boundingBox())!;
    const sheet = (await settings.locator('.corner-settings-sheet').boundingBox())!;
    expect(tabs.x).toBeCloseTo(sheet.x, 0);
    expect(tabs.width).toBeCloseTo(sheet.width, 0);
    const left = (await audioTab.boundingBox())!;
    const right = (await systemTab.boundingBox())!;
    expect(left.width).toBeCloseTo(right.width, 0);
    expect(right.x + right.width).toBeCloseTo(sheet.x + sheet.width, 0);
  };
  const open = async () => {
    await gear.click();
    await expect(settings).toBeVisible();
    await expect(settings).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await expect(pink).toHaveCSS('scale', '1.22');
    await expect(pink).toHaveCSS('background-color', 'rgb(246, 78, 147)');
    await expect(settings.locator('.corner-settings-sheet')).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)',
    );
    await verifyWidth();
  };
  const close = async () => {
    await page.mouse.click(15, 15);
    await expect(gear).toHaveAttribute('aria-expanded', 'false');
    await expect(settings).toBeHidden();
    await expect(pink).toHaveCSS('scale', '1');
    await expect(pink).toHaveCSS('background-color', 'rgb(246, 78, 147)');
  };
  await page.getByRole('button', { name: '选择主界面 BGM' }).click();
  const music = page.getByRole('region', { name: '主界面音乐' });
  await music.getByRole('slider', { name: '菜单 BGM 音量', exact: true }).fill('0.64');
  await open();
  await expect(page.locator('.settings-gear-halo')).toHaveCSS('opacity', '1');
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  expect(await page.locator('.mode-records').boundingBox()).toEqual(cards);
  const homeBounds = (await settings.boundingBox())!;
  expect(homeBounds.x).toBeGreaterThan(cards.x + cards.width + 12);
  await expect(settings.getByRole('slider', { name: '菜单 BGM 音量', exact: true })).toHaveValue(
    '0.64',
  );
  await settings.getByRole('slider', { name: '菜单 BGM 音量', exact: true }).fill('0.42');
  await expect(music.getByRole('slider', { name: '菜单 BGM 音量', exact: true })).toHaveValue(
    '0.42',
  );
  await settings.getByRole('slider', { name: '菜单 BGM 音量', exact: true }).fill('0');
  await expect(music.getByRole('button', { name: '取消菜单 BGM 静音', exact: true })).toBeVisible();
  await expect(page.locator('.headphone-pin-rays')).toHaveAttribute('data-muted', '');
  await settings.getByRole('slider', { name: '菜单 BGM 音量', exact: true }).fill('0.42');
  await settings.getByRole('slider', { name: '游戏／视频音量', exact: true }).fill('0.67');
  await settings.getByRole('slider', { name: '音效（SE）音量', exact: true }).fill('0.28');
  const beat = () =>
    page
      .locator('.menu-app')
      .evaluate((node) => (node as HTMLElement).style.getPropertyValue('--music-beat'));
  const before = await beat();
  await expect.poll(beat, { timeout: 10000 }).not.toBe(before);
  const edge = await pink.evaluate((node) => getComputedStyle(node, '::after').opacity);
  expect(edge).toBe('1');
  await page.screenshot({ path: 'artifacts/settings-home-audio-1080p.png' });
  await systemTab.hover();
  await expect(systemTab).toHaveAttribute('aria-selected', 'true');
  await expect(systemTab).toHaveCSS('background-color', 'rgb(255, 250, 245)');
  await expect(settings.getByRole('slider', { name: '音符流速', exact: true })).toBeVisible();
  await verifyWidth();
  await settings.getByRole('slider', { name: '音符流速', exact: true }).fill('6.5');
  expect(await page.evaluate(() => localStorage.getItem('waifu-fit-player-note-speed'))).toBe(
    '6.5',
  );
  await page.screenshot({ path: 'artifacts/settings-home-system-1080p.png' });
  await audioTab.hover();
  await expect(audioTab).toHaveAttribute('aria-selected', 'true');
  await verifyWidth();
  await close();
  expect(await page.locator('.mode-records').boundingBox()).toEqual(cards);
  const chart = blankChart('Settings navigation');
  chart.difficultyRating = 3;
  chart.notes = [
    { id: 'settings-note', lane: 'squat', direction: 'down', timeMs: 1000, kind: 'tap' },
  ];
  await importDemo(page, chart);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('touhou');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await open();
  expect(await settings.boundingBox()).toEqual(homeBounds);
  await expect(settings.getByRole('slider', { name: '游戏／视频音量', exact: true })).toHaveValue(
    '0.67',
  );
  await page.screenshot({ path: 'artifacts/settings-albums-1080p.png' });
  await close();
  await page.locator('.collection-album').first().click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await open();
  expect(await settings.boundingBox()).toEqual(homeBounds);
  await page.screenshot({ path: 'artifacts/settings-songs-1080p.png' });
  await systemTab.hover();
  await expect(systemTab).toHaveAttribute('aria-selected', 'true');
  await verifyWidth();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  expect(errors).toEqual([]);
});

test('设置从原有几何展开并收回，动效中途不改变主卡片布局', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const cards = (await page.locator('.mode-records').boundingBox())!;
  const gear = page.getByRole('button', { name: '全局设置', exact: true });
  const pink = page.locator('.ambient-shape.pink');
  const freeze = () =>
    page.evaluate(() => {
      for (const selector of ['.ambient-shape.pink', '.corner-settings', '.settings-gear-halo']) {
        for (const animation of document
          .querySelector(selector)!
          .getAnimations({ subtree: true })) {
          if (
            selector === '.ambient-shape.pink' &&
            (animation as CSSTransition).transitionProperty === 'transform'
          )
            continue;
          const { duration, delay } = animation.effect!.getTiming();
          if (typeof duration === 'number') {
            animation.pause();
            animation.currentTime = (delay ?? 0) + duration * 0.5;
          }
        }
      }
    });
  const resume = () =>
    page.evaluate(() =>
      document.getAnimations().forEach((animation) => {
        if (animation.playState === 'paused') animation.play();
      }),
    );
  await gear.click();
  await freeze();
  const middle = Number(await pink.evaluate((node) => getComputedStyle(node).scale));
  expect(middle).toBeGreaterThan(1);
  expect(middle).toBeLessThan(1.22);
  expect(await page.locator('.mode-records').boundingBox()).toEqual(cards);
  await page.screenshot({ path: 'artifacts/settings-opening-midpoint-1080p.png' });
  await resume();
  await expect(pink).toHaveCSS('scale', '1.22');
  await expect(page.locator('.corner-settings-sheet')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  await gear.click();
  await freeze();
  expect(await page.locator('.mode-records').boundingBox()).toEqual(cards);
  await page.screenshot({ path: 'artifacts/settings-closing-midpoint-1080p.png' });
  await resume();
  await expect(pink).toHaveCSS('scale', '1');
  await expect(page.locator('.corner-settings')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('.ambient-shape.pink')).toHaveCount(1);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await gear.click();
  await expect(pink).toHaveCSS('scale', '1.22');
  await expect(page.locator('.corner-settings-sheet')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  const wideCards = (await page.locator('.mode-records').boundingBox())!;
  const widePanel = (await page.locator('.corner-settings').boundingBox())!;
  expect(widePanel.x).toBeGreaterThan(wideCards.x + wideCards.width + 12);
  await page.screenshot({ path: 'artifacts/settings-wide-1440p.png' });
});
