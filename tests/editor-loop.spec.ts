import { expect, test } from '@playwright/test';

test('workbench loop funnels drag independently and loop the actual offset video', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '体验示例作品', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  const offset = page.getByRole('spinbutton', { name: '视频偏移 / ms', exact: true });
  await offset.fill('500');
  await offset.press('Enter');
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  const inputA = page.getByRole('textbox', { name: '循环起点位置', exact: true });
  const inputB = page.getByRole('textbox', { name: '循环终点位置', exact: true });
  await inputA.fill('1.128');
  await inputA.press('Enter');
  await expect(inputA).toHaveValue(/03:/);
  expect(await page.locator('.timeline-scroll').evaluate((e) => e.scrollLeft)).toBeGreaterThan(
    10000,
  );
  await inputB.fill('03:40.123');
  await inputB.press('Enter');
  await expect(inputB).toHaveValue('03:40.123');
  await inputA.fill('00:00.500');
  await inputA.press('Enter');
  await inputB.fill('4000ms');
  await inputB.press('Enter');
  await expect(inputB).toHaveValue('00:04.000');
  const noteCount = await page.getByTestId('editor-note').count();
  const dragTo = async (name: string, timeMs: number) => {
    const handle = page.getByRole('button', { name, exact: true });
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    const boundary = (await handle.locator('..').boundingBox())!;
    const grabOffset = box.x + box.width / 2 - boundary.x;
    const timeline = (await page.locator('.timeline-surface').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(timeline.x + 124 + timeMs / 10 + grabOffset, box.y + box.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
  };
  await dragTo('循环起点', 2000);
  // Both halves stay in the top ruler and join without covering each other's hit area.
  await dragTo('循环终点', 2000);
  const upper = (await page.getByRole('button', { name: '循环起点', exact: true }).boundingBox())!;
  const lower = (await page.getByRole('button', { name: '循环终点', exact: true }).boundingBox())!;
  const ruler = (await page.locator('.timeline-ruler').boundingBox())!;
  expect(upper.x).toBe(lower.x);
  expect(upper.y).toBe(ruler.y);
  expect(lower.y).toBe(upper.y + upper.height);
  expect(lower.y + lower.height).toBeLessThanOrEqual(ruler.y + ruler.height);
  await expect(page.getByRole('button', { name: '区间循环', exact: true })).toBeDisabled();
  await page.locator('.editor').screenshot({ path: 'artifacts/workbench-loop-joined.png' });
  await dragTo('循环终点', 4000);
  await expect(inputA).toHaveValue('00:02.000');
  await expect(inputB).toHaveValue('00:04.000');
  expect(await page.getByTestId('editor-note').count()).toBe(noteCount);
  const toggle = page.getByRole('button', { name: '区间循环', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'artifacts/workbench-loop.png', fullPage: true });
  const video = page.locator('video');
  await video.evaluate((v: HTMLVideoElement) => {
    v.dataset.wraps = '0';
    v.addEventListener('seeking', () => {
      if (Math.abs(v.currentTime - 1.5) < 0.1)
        v.dataset.wraps = String(Number(v.dataset.wraps) + 1);
    });
  });
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 1.5;
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  // The initial seek into the range plus two actual boundary crossings.
  await expect.poll(() => video.getAttribute('data-wraps')).toBe('3');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 4.3;
  });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.seeking)).toBe(false);
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(4.3, 2);
  // Turning off preserves the range, and ordinary playback can pass its end.
  await toggle.click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(4.5);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await toggle.click();
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 4.3;
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(4.5);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(errors).toEqual([]);
});
