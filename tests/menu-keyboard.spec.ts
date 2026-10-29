import { expect, test, type Locator, type Page } from '@playwright/test';
import { importDemo, insertAlbum } from './helpers/project';
import { blankChart } from '../src/model';

async function only(page: Page, target: Locator) {
  await expect(target).toHaveAttribute('data-highlighted', '');
  await expect(page.locator('[data-highlighted]')).toHaveCount(1);
}

test('ArrowDown into the headphone menu plays one selection sound', async ({ page }) => {
  await page.addInitScript(() => {
    const events: string[] = [];
    Object.assign(window, { headphoneSounds: events });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.menuSound) events.push(this.dataset.menuSound);
      return play.call(this);
    };
  });
  await page.goto('/');
  await page.mouse.move(5, 5);
  const sounds = () =>
    page.evaluate(() => (window as unknown as { headphoneSounds: string[] }).headphoneSounds);
  for (const source of ['.play-mode', '.create-mode']) {
    await page.locator(source).focus();
    const before = (await sounds()).length;
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.theme-track').first()).toBeFocused();
    expect((await sounds()).slice(before)).toEqual(['settings']);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.theme-track').nth(1)).toBeFocused();
    expect((await sounds()).slice(before)).toEqual(['settings', 'settings']);
  }
});

test('headphone opens only over its button or through keyboard selection; the open bridge still works', async ({
  page,
}) => {
  await page.goto('/');
  const headphone = page.getByRole('button', { name: '选择主界面 BGM' });
  const music = page.getByRole('region', { name: '主界面音乐' });
  const button = (await headphone.boundingBox())!;
  const consoleBox = (await page.locator('.music-console').boundingBox())!;
  for (const [x, y] of [
    [consoleBox.x + consoleBox.width / 2, consoleBox.y + 12],
    [consoleBox.x + 30, button.y + button.height / 2],
    [consoleBox.x + consoleBox.width - 30, button.y + button.height / 2],
    [button.x + button.width / 2, button.y + button.height + 6],
  ]) {
    await page.mouse.move(x, y);
    await expect(headphone).toHaveAttribute('aria-expanded', 'false');
    await expect(music).toBeHidden();
  }
  await headphone.hover();
  await expect(music).toBeVisible();
  await page.locator('.music-panel-bridge').hover();
  await expect(headphone).toHaveAttribute('aria-expanded', 'true');
  await music.hover();
  await expect(music).toBeVisible();
  await page.locator('.play-mode').hover();
  await expect(music).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await expect(music).toBeVisible();
  await expect(page.locator('.theme-track').first()).toBeFocused();
});

test('home initially selects play and restores that selection after returning from albums or the workbench', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.play-mode')).toBeVisible();
  await only(page, page.locator('.play-mode'));
  await page.keyboard.press('Enter');
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await only(page, page.locator('.collection-album[data-id="all"]'));
  await page.keyboard.press('ArrowDown');
  await only(page, page.locator('.collection-album[data-id="anime"]'));
  await page.keyboard.press('Backspace');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await only(page, page.locator('.play-mode'));
  await page.keyboard.press('Enter');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await only(page, page.locator('.collection-album[data-id="anime"]'));
  await page.keyboard.press('Backspace');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await only(page, page.locator('.play-mode'));
  await page.locator('.create-mode').click();
  await expect(page.getByRole('button', { name: '主菜单', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await only(page, page.locator('.play-mode'));
});

test('主页方向键选择齿轮和耳机，后输入接管唯一高亮，回车切换固定和设置', async ({ page }) => {
  await page.goto('/');
  const play = page.locator('.play-mode');
  const create = page.locator('.create-mode');
  const gear = page.getByRole('button', { name: '全局设置', exact: true });
  const headphone = page.getByRole('button', { name: '选择主界面 BGM' });
  const music = page.getByRole('region', { name: '主界面音乐' });
  await expect(headphone).toBeVisible();
  await only(page, play);
  await page.mouse.move(10, 10);
  await page.keyboard.press('ArrowRight');
  await only(page, create);
  await page.keyboard.press('ArrowRight');
  await only(page, gear);
  await expect(gear).toBeFocused();
  await expect(gear).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Enter');
  await expect(gear).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  const audio = page.getByRole('tab', { name: 'AUDIO', exact: true });
  const system = page.getByRole('tab', { name: 'SYSTEM', exact: true });
  await expect(audio).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(system).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(gear).toBeFocused();
  await only(page, gear);
  await page.keyboard.press('ArrowDown');
  await expect(system).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(gear).toHaveAttribute('aria-expanded', 'false');
  await expect(gear).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(gear).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Enter');
  await expect(gear).toHaveAttribute('aria-expanded', 'false');
  await create.hover();
  await only(page, create);
  // A stationary mouse cannot reclaim selection after the keyboard reaches the gear.
  await page.keyboard.press('ArrowRight');
  await only(page, gear);
  expect(await create.evaluate((node) => node.matches(':hover'))).toBe(true);
  const box = (await create.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await only(page, create);
  await expect(gear).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('ArrowDown');
  await only(page, headphone);
  await expect(music).toBeVisible();
  await expect(headphone).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.theme-track').first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await only(page, create);
  await expect(music).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.theme-track').first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(headphone).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.theme-track').last()).toBeFocused();
  for (let index = (await page.locator('.theme-track').count()) - 1; index > 0; index--)
    await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await only(page, create);
  await expect(music).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await only(page, headphone);
  await expect(page.locator('.theme-track').first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(headphone).toHaveAttribute('aria-pressed', 'false');
  await expect(music).toBeHidden();
  await page.keyboard.press('ArrowUp');
  await only(page, create);
  await page.keyboard.press('ArrowLeft');
  await only(page, play);
  await page.keyboard.press('ArrowDown');
  await only(page, headphone);
  await expect(music).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await only(page, play);
  await expect(music).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await only(page, gear);
  const icon = gear.locator(':scope > svg');
  await expect
    .poll(() => icon.evaluate((node) => Number(getComputedStyle(node).scale)))
    .toBeGreaterThan(1.014);
  const scales = await icon.evaluate(async (node) => {
    const result: number[] = [];
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const sample = () => {
        result.push(Number(getComputedStyle(node).scale));
        if (performance.now() - start < 2200) requestAnimationFrame(sample);
        else resolve();
      };
      sample();
    });
    return result;
  });
  expect(Math.min(...scales)).toBeGreaterThanOrEqual(1.014);
  expect(Math.max(...scales)).toBeLessThanOrEqual(1.101);
  expect(Math.max(...scales) - Math.min(...scales)).toBeGreaterThan(0.008);
  await expect(page.locator('.menu-control-symbols > svg')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/menu-keyboard-gear-1080p.png' });
});

test('专辑顶端和单曲按上通往齿轮，单曲左右只选曲，鼠标与键盘可交替接管', async ({ page }) => {
  await page.goto('/');
  // Navigation does not depend on the local demo video's length or full song chart.
  const chart = blankChart();
  chart.title = 'Menu navigation';
  chart.danceDifficulty = 3;
  chart.notes = [{ id: 'menu-note', lane: 'squat', direction: 'down', timeMs: 1000, kind: 'tap' }];
  await importDemo(page, chart);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await page.getByRole('button', { name: /舞蹈模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.mouse.move(10, 10);
  const gear = page.getByRole('button', { name: '全局设置', exact: true });
  const albums = page.locator('.collection-album');
  await page.keyboard.press('ArrowUp');
  await only(page, gear);
  await page.keyboard.press('ArrowDown');
  await only(page, albums.first());
  await page.keyboard.press('ArrowDown');
  await only(page, albums.nth(1));
  await page.keyboard.press('ArrowUp');
  await only(page, albums.first());
  await page.keyboard.press('ArrowUp');
  await only(page, gear);
  await page.keyboard.press('Enter');
  await expect(gear).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'SYSTEM', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(gear).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(gear).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await albums.first().hover();
  await only(page, albums.first());
  await page.keyboard.press('ArrowRight');
  await only(page, gear);
  const box = (await albums.first().boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await only(page, albums.first());
  await page.keyboard.press('Enter');
  await insertAlbum(page);
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const song = page.locator('.record-card[aria-current="true"]');
  await only(page, song);
  await page.keyboard.press('ArrowRight');
  await only(page, song);
  await page.keyboard.press('ArrowLeft');
  await only(page, song);
  await page.keyboard.press('ArrowUp');
  await only(page, gear);
  await page.keyboard.press('ArrowDown');
  await only(page, song);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(gear).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Backspace');
  await expect(gear).toHaveAttribute('aria-expanded', 'false');
  await expect(gear).toBeFocused();
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  await song.hover();
  await only(page, song);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('HOLD ENTER TO START');
});
