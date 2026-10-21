import { openDemo, editInStudio } from './helpers/project';
import { expect, test } from '@playwright/test';

test('148 BPM 的 1.41–1.46 回跳后持续播放，不反复 seek', async ({ page }) => {
  await page.goto('/');
  await openDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await editInStudio(page);
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  for (const [name, value] of [
    ['BPM', '148'],
    ['本段 Offset / ms', '960'],
  ]) {
    const input = page.getByRole('spinbutton', { name, exact: true });
    await input.fill(value);
    await input.press('Enter');
  }
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  const offset = page.getByRole('spinbutton', { name: '视频偏移 / ms', exact: true });
  await offset.fill('100');
  await offset.press('Enter');
  for (const [name, value] of [
    ['循环起点位置', '1.41'],
    ['循环终点位置', '1.46'],
  ]) {
    const input = page.getByRole('textbox', { name, exact: true });
    await input.fill(value);
    await input.press('Enter');
  }
  const video = page.locator('video');
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 73.5;
  });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  await video.evaluate((v: HTMLVideoElement) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
    v.dataset.loopWrites = '0';
    Object.defineProperty(v, 'currentTime', {
      get() {
        return descriptor.get!.call(v);
      },
      set(value: number) {
        v.dataset.loopWrites = String(Number(v.dataset.loopWrites) + 1);
        descriptor.set!.call(v, value);
      },
    });
  });
  await page.getByRole('button', { name: '区间循环', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => video.getAttribute('data-loop-writes')).not.toBe('0');
  await expect
    .poll(
      async () => {
        const time = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
        return time > 66.725 && time < 73;
      },
      { timeout: 5000 },
    )
    .toBe(true);
  await expect(video).toHaveAttribute('data-loop-writes', '1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
});
