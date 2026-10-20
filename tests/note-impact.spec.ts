import { test, expect } from '@playwright/test';
import { blankChart } from '../src/model';
import { importDemo } from './helpers/project';

test.use({ viewport: { width: 1920, height: 1080 } });
test('game impacts use prepared textures, preserve pause/release timing and reduced motion', async ({
  page,
}) => {
  const loaded = new Set<string>();
  page.on('request', (request) => {
    const match = request.url().match(/\/art\/impact\/([^/?]+)\.png/);
    if (match) loaded.add(match[1]);
  });
  await page.goto('/');
  const chart = blankChart();
  chart.notes = [
    { id: 'tap', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 },
    {
      id: 'hold',
      lane: 'calf_raise',
      direction: 'up',
      kind: 'hold',
      modifier: 'none',
      timeMs: 2000,
      endTimeMs: 3000,
    },
  ];
  await importDemo(page, chart);
  expect([...loaded]).toEqual([]);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  const video = page.locator('video');
  const seek = async (time: number) => {
    await video.evaluate((element: HTMLVideoElement, t) => {
      element.currentTime = t;
    }, time);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  };
  await seek(0.2);
  const note = page.locator('[data-note-id="tap"]');
  const before = (await note.boundingBox())!.x;
  await seek(0.7);
  expect((await note.boundingBox())!.x).toBeGreaterThan(before);
  await seek(2.1);
  const impact = page.getByTestId('impact-calf_raise');
  const sprite = impact.locator('.impact-sprite');
  await expect(impact).toHaveClass(/arrival/);
  await expect(sprite).toBeVisible();
  await expect(sprite).toHaveCSS('filter', 'none');
  await expect(sprite).toHaveCSS('background-image', /\/art\/impact\/miku\.png/);
  expect([...loaded].sort()).toEqual(['miku', 'pink']);
  await expect(impact.locator('.impact-particle')).toHaveCount(0);
  const frame = await impact.getAttribute('data-frame');
  await page.waitForTimeout(150);
  await expect(impact).toHaveAttribute('data-frame', frame!);
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    2.1,
    true,
  ]);
  await page.screenshot({ path: 'artifacts/arrow-hold-arrival-1920.png' });
  await seek(3.1);
  await expect(impact).toHaveClass(/release/);
  expect(Number(await impact.getAttribute('data-frame'))).toBeGreaterThanOrEqual(32);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(sprite).toBeHidden();
  await expect(impact.locator('.impact-still')).toBeVisible();
  await seek(3.6);
  await expect(impact).toHaveCount(0);
});
