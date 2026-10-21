import { expect, test, type Page } from '@playwright/test';
import { importDemo } from './helpers/project';
import { blankChart } from '../src/model';

const selectors = [
  '.title-brand',
  '.mode-records',
  '.mode-record',
  '.main-menu-down-hint',
  '.headphone-button',
  '.music-pulse',
  '.menu-settings',
  '.menu-controls',
];
async function home(page: Page) {
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}
async function freeze(page: Page) {
  await page.addStyleTag({
    content:
      '* { animation-play-state: paused !important; transition: none !important } .menu-app * { --music-beat: 0 !important }',
  });
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => {
      animation.pause();
      animation.currentTime = 0;
    }),
  );
}
async function geometry(page: Page) {
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

test('Retina pixel density does not change the logical menu size', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1470, height: 956 },
    deviceScaleFactor: 2,
  });
  try {
    const page = await context.newPage();
    await home(page);
    await expect(page.locator('html')).toHaveAttribute('data-menu-fit', '');
    const stage = (await page.locator('#root').boundingBox())!;
    expect(stage.width).toBeCloseTo(1470, 1);
    expect(stage.height).toBeCloseTo((1080 * 1470) / 1920, 1);
    await page.getByRole('button', { name: '全局设置', exact: true }).click();
    await expect(page.getByRole('tab', { name: /AUDIO/ })).toBeVisible();
    await page.screenshot({ path: 'artifacts/menu-fit-retina-1470.png' });
  } finally {
    await context.close();
  }
});

for (const [width, height] of [
  [1440, 900],
  [1470, 956],
  [1710, 1107],
  [1440, 800],
]) {
  test(`home retains its desktop composition at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await home(page);
    await freeze(page);
    const reference = await geometry(page);
    await page.setViewportSize({ width, height });
    await expect(page.locator('html')).toHaveAttribute('data-menu-fit', '');
    const stage = (await page.locator('#root').boundingBox())!;
    const scale = stage.width / 1920;
    const actual = await geometry(page);
    for (const selector of selectors)
      for (const [index, rect] of actual[selector].entries()) {
        const expected = reference[selector][index];
        for (const edge of ['x', 'y', 'width', 'height'] as const) {
          const value =
            (rect[edge] - (edge === 'x' ? stage.x : edge === 'y' ? stage.y : 0)) / scale;
          expect(Math.abs(value - expected[edge]), `${selector} ${edge}`).toBeLessThan(0.2);
        }
      }
    expect(stage.x).toBeCloseTo((width - stage.width) / 2, 1);
    expect(stage.y).toBeCloseTo((height - stage.height) / 2, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: `artifacts/menu-fit-home-${width}-${height}.png` });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('html')).not.toHaveAttribute('data-menu-fit');
    expect(await geometry(page)).toEqual(reference);
  });
}

test('fitted menu keeps settings, headphone controls and editor entry interactive', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1470, height: 956 });
  await home(page);
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  await expect(page.locator('.corner-settings')).toHaveAttribute('data-open');
  await page.getByRole('tab', { name: /SYSTEM/ }).hover();
  await expect(page.getByRole('slider', { name: '音符流速' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/menu-fit-settings-1470.png' });
  await page.keyboard.press('Escape');
  await page.locator('.play-mode').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.theme-track').first()).toBeFocused();
  const slider = page.getByRole('slider', { name: '菜单 BGM 音量', exact: true });
  const box = (await slider.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(0.6);
  await expect.poll(async () => Number(await slider.inputValue())).toBeLessThan(0.8);
  await page.screenshot({ path: 'artifacts/menu-fit-headphones-1470.png' });
  await page.locator('.create-mode').click();
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-menu-fit');
});

test('small-window portals and album insertion use the same menu coordinate system', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1470, height: 956 });
  await home(page);
  await page.locator('.play-mode').click();
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('.album-deck')).toHaveAttribute('data-ready');
  const card = (await page.locator('.album-shelf [aria-current="true"]').boundingBox())!;
  const slot = (await page.locator('.album-deck-slot').boundingBox())!;
  expect(Math.abs(slot.y + slot.height / 2 - card.y - card.height / 2)).toBeLessThan(6);
  await page.keyboard.down('Enter');
  const flight = page.locator('.album-flight-card');
  await expect(flight).toBeVisible();
  expect(await flight.evaluate((node) => node.closest('#root') !== null)).toBe(true);
  await page.waitForTimeout(250);
  expect((await flight.boundingBox())!.x).toBeGreaterThan(card.x);
  await page.keyboard.up('Enter');
  await expect(page.locator('.album-flight')).toHaveCount(0);
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.menu-back').click();
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.menu-back').click();
  await expect(page.locator('.title-menu')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  // Editor remains at native size; entering it and returning must not reset media/state.
  await importDemo(page, blankChart('Viewport round trip'));
  await expect(page.locator('html')).not.toHaveAttribute('data-menu-fit');
  await page.getByRole('button', { name: '返回主页', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-menu-fit', '');
});
