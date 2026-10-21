import { expect, test, type Page } from '@playwright/test';
import { importDemo, insertAlbum } from './helpers/project';
import { blankChart } from '../src/model';

async function project(page: Page) {
  await page.goto('/');
  const chart = blankChart('Viewport check');
  chart.notes = [{ id: 'first', lane: 'punch', kind: 'tap', direction: 'right', timeMs: 4000 }];
  await importDemo(page, chart);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
}

const selectors = [
  '.stage-grid',
  '.stage-left',
  '.stage-right',
  '.play-lane',
  '.practice-masthead',
  '.transport',
  '.studio-floor-print',
];
async function geometry(page: Page) {
  // ResizeObserver updates the lane metrics after layout; measure the settled frame.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((selector) => [
          selector,
          [...document.querySelectorAll(selector)].map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
          }),
        ]),
      ),
    selectors,
  );
}

test('gameplay preserves desktop composition, media identity and pause input across laptop sizes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await project(page);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const video = (await page.locator('video').elementHandle())!;
  const reference = await geometry(page);
  for (const [width, height] of [
    [1470, 956],
    [1440, 800],
    [1710, 1107],
    [1280, 800],
    [2560, 900],
  ]) {
    await page.setViewportSize({ width, height });
    const stage = (await page.locator('#root').boundingBox())!;
    const scale = stage.width / 1920;
    const actual = await geometry(page);
    for (const selector of selectors)
      for (const [index, rect] of actual[selector].entries()) {
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          const logical = (rect[key] - (key === 'x' ? stage.x : key === 'y' ? stage.y : 0)) / scale;
          expect(
            Math.abs(logical - reference[selector][index][key]),
            `${width} ${selector} ${key}`,
          ).toBeLessThan(0.3);
        }
      }
    expect(await video.evaluate((v) => v.isConnected)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
  }
  await page.setViewportSize({ width: 1470, height: 956 });
  const slider = (await page
    .getByRole('slider', { name: 'Playback position', exact: true })
    .boundingBox())!;
  await page.mouse.click(slider.x + slider.width / 2, slider.y + slider.height / 2);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(70);
  await page.screenshot({ path: 'artifacts/player-fit-1470.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'PAUSED', exact: true })).toBeVisible();
  await expect(page.locator('.pause-console')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'artifacts/player-fit-pause-1470.png' });
  await page.getByRole('button', { name: 'EDIT IN STUDIO', exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-menu-fit');
  expect(await video.evaluate((v) => v.isConnected)).toBe(true);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(70);
  expect(errors).toEqual([]);
});

test('laptop song confirmation, full-window entrance, countdown and resume share the stage', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1470, height: 856 });
  await project(page);
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('12500');
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.seeking))
    .toBe(false);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByRole('button', { name: '用当前视频画面', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '返回主页', exact: true }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.start-briefing')).toHaveAttribute('data-motion', 'ready');
  const briefing = (await page.locator('.start-briefing').boundingBox())!;
  expect(briefing.x).toBeGreaterThan(0);
  expect(briefing.y).toBeGreaterThan(0);
  expect(briefing.x + briefing.width).toBeLessThan(1470);
  expect(briefing.y + briefing.height).toBeLessThan(856);
  await page.screenshot({ path: 'artifacts/briefing-fit-1470.png' });
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.game-entrance')).toBeVisible();
  const entrance = (await page.locator('.game-entrance').boundingBox())!;
  expect(entrance).toEqual({ x: 0, y: 0, width: 1470, height: 856 });
  await expect(page.locator('.album-workspace.practice')).toHaveAttribute('data-ready', 'counting');
  await page.screenshot({ path: 'artifacts/countdown-fit-1470.png' });
  const video = (await page.locator('video').elementHandle())!;
  await expect(page.locator('.ready-countdown')).toHaveCount(0);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'PAUSED', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ready-countdown')).toBeVisible();
  await expect(page.locator('.ready-countdown')).toHaveCount(0);
  expect(await video.evaluate((v) => v.isConnected)).toBe(true);
});

test('native studio keeps timeline coordinates and scrollable controls on laptop windows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1470, height: 856 });
  await project(page);
  for (const [width, height] of [
    [1470, 856],
    [1280, 800],
    [1710, 1107],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('html')).not.toHaveAttribute('data-menu-fit');
    expect(await page.locator('#root').evaluate((root) => getComputedStyle(root).transform)).toBe(
      'none',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('.timeline-scroll').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/studio-fit-${width}-${height}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1470, height: 856 });
  await page.locator('.timeline-scroll').scrollIntoViewIfNeeded();
  const surface = (await page.locator('.timeline-surface').boundingBox())!;
  await page.mouse.click(surface.x + 224, surface.y + 57);
  await expect(page.getByTestId('editor-note')).toHaveCount(2);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await expect(page.getByLabel('所属专辑')).toBeVisible();
  await page.getByRole('button', { name: '操作帮助', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  const box = (await modal.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(856);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});
