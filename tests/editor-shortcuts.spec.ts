import { expect, test } from '@playwright/test';
import { importDemo } from './helpers/project';
import { blankChart } from '../src/model';

test('N/B locate the actual media and timeline without editing notes or intercepting text entry', async ({
  page,
}) => {
  await page.goto('/');
  const chart = blankChart('Shortcut check');
  chart.videoOffsetMs = 500;
  chart.notes = [
    { id: 'last-start', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 17000 },
    {
      id: 'long',
      lane: 'step',
      direction: 'left',
      kind: 'hold',
      modifier: 'none',
      timeMs: 10000,
      endTimeMs: 18000,
    },
  ];
  await importDemo(page, chart);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('n');
  const video = page.locator('video');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(17.5, 2);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  expect(await page.locator('.timeline-scroll').evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  await page.keyboard.press('b');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(0);
  expect(await page.locator('.timeline-scroll').evaluate((e) => e.scrollLeft)).toBe(0);

  await page.getByRole('button', { name: '曲目', exact: true }).click();
  const title = page.getByRole('textbox', { name: '作品名称', exact: true });
  await title.fill('');
  await title.pressSequentially('bn');
  await expect(title).toHaveValue('bn');
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(0);

  chart.specialMove = { name: 'Pose', icon: 'star', previewBeats: 1 };
  chart.specialEvents = [{ id: 'special', timeMs: 18000, endTimeMs: 19000 }];
  await importDemo(page, chart);
  await page.locator('.editor-position').click();
  await page.keyboard.press('n');
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeCloseTo(18.5, 2);
  await expect(page.getByTestId('editor-note')).toHaveCount(2);
});
