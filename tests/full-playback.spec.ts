import { test, expect } from '@playwright/test';
import { demoChart } from '../src/demo';
import { LANES } from '../src/model';

test('整首真实视频 1x 播放，五轨状态与媒体时间保持一致', async ({ page }) => {
  test.setTimeout(310000);
  await page.goto('/');
  await page.getByRole('button', { name: '体验示例作品', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const chart = demoChart('');
  let samples = 0;
  await expect
    .poll(
      async () => {
        const frame = await page.evaluate(() => {
          const v = document.querySelector('video')!;
          return {
            time: v.currentTime * 1000,
            ended: v.ended,
            states: Array.from(document.querySelectorAll('.hit-target')).map((el) =>
              el.getAttribute('data-state'),
            ),
            timeText: document.querySelector('[data-testid="current-time"]')!.textContent,
          };
        });
        if (
          !chart.notes.some(
            (n) =>
              Math.abs(n.timeMs - frame.time) < 100 ||
              (n.kind === 'hold' && Math.abs(n.endTimeMs - frame.time) < 100),
          )
        ) {
          const expected = LANES.map(({ id: lane }) => {
            const n = chart.notes.find(
              (n) =>
                n.lane === lane &&
                n.kind === 'hold' &&
                n.timeMs <= frame.time &&
                n.endTimeMs > frame.time,
            );
            return n?.kind === 'hold' ? (n.modifier === 'sway' ? 'sway' : 'holding') : 'idle';
          });
          expect(frame.states).toEqual(expected);
          samples++;
        }
        return frame.ended;
      },
      { timeout: 295000, intervals: [2000] },
    )
    .toBe(true);
  expect(samples).toBeGreaterThan(60);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});
