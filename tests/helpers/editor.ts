import { test as base, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blankChart, LANES, type Chart, type Lane } from '../../src/model';
import { importDemo, openDemo } from './project';
export { expect };
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() =>
      Object.defineProperty(window, 'showOpenFilePicker', {
        value: undefined,
        writable: true,
        configurable: true,
      }),
    );
    await page.goto('/');
    await use(page);
    expect(errors).toEqual([]);
  },
});
export async function stepChoice(page: Page, target: 'draw' | 'selected', value: string) {
  const [direction, type] = value.split('-');
  if (direction !== 'free') {
    await page
      .getByRole('button', {
        name:
          target === 'draw'
            ? `放置方向${direction === 'left' ? 'L' : 'R'}`
            : `选中踏步方向 ${direction === 'left' ? '←' : '→'}`,
        exact: true,
      })
      .click();
    if (target === 'draw')
      await page
        .getByRole('button', { name: `录入用脚 ${direction === 'left' ? 'L' : 'R'}`, exact: true })
        .click();
  }
  await page
    .getByLabel(target === 'draw' ? '绘制类型' : '选中事件类型')
    .selectOption(direction === 'free' ? 'free-sway' : type);
}
export async function demo(page: Page) {
  await openDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
}
export async function seek(page: Page, seconds: number) {
  await page.locator('video').evaluate((v, time) => {
    (v as HTMLVideoElement).currentTime = time;
  }, seconds);
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).seeking))
    .toBe(false);
}
export async function exportChart(page: Page): Promise<Chart> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const file = await download;
  return JSON.parse(await readFile((await file.path())!, 'utf8'));
}
export async function emptyEditor(page: Page) {
  const chart = blankChart('浏览器测试作品');
  await importDemo(page, chart);
  await expect(page.getByRole('heading', { name: chart.title })).toBeVisible();
  return chart;
}
export async function draw(page: Page, time: number, lane: Lane | 'special', end?: number) {
  const row = lane === 'special' ? LANES.length : LANES.findIndex((item) => item.id === lane);
  const surface = page.locator('.timeline-surface');
  const y = 30 + row * 54 + (row === LANES.length ? 18 : 27);
  // Scroll to the requested point, not the centre of the entire long timeline.
  await surface.hover({ position: { x: 124 + time * 0.1, y } });
  await page.mouse.down();
  if (end !== undefined) await surface.hover({ position: { x: 124 + end * 0.1, y } });
  await page.mouse.up();
}
