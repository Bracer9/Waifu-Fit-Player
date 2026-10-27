import { editInStudio } from './helpers/project';
import { test, expect, demo, seek } from './helpers/editor';
import { TEST_DURATION_MS } from './helpers/test-media';

for (const source of ['fixture', ...(process.env.WFP_SEEK_TEST_VIDEO_URL ? ['local-video'] : [])]) {
  test(`scrub commits once on release and survives repeated rewind: ${source}`, async ({
    page,
  }) => {
    await demo(page);
    const video = page.locator('video');
    if (source === 'local-video') {
      await video.evaluate((element: HTMLVideoElement, url) => {
        element.src = url!;
        element.load();
      }, process.env.WFP_SEEK_TEST_VIDEO_URL);
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState))
        .toBeGreaterThanOrEqual(2);
    }
    const slider = page.getByRole('slider', { name: 'Playback position', exact: true });
    await expect(slider).toBeEnabled();
    // The in-game transport is projected onto a tilted wall: its bounding-box
    // centre line is not the actual input hit area at every horizontal position.
    const pointAt = (fraction: number) =>
      slider.evaluate((element, fraction) => {
        const box = element.getBoundingClientRect();
        const x = box.left + Math.max(1, Math.min(box.width - 1, box.width * fraction));
        for (let y = box.top; y < box.bottom; y += 0.5)
          if (document.elementFromPoint(x, y) === element) return { x, y };
        throw new Error('Playback slider hit area not found');
      }, fraction);
    await video.evaluate((element: HTMLVideoElement) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        'currentTime',
      )!;
      element.dataset.seekWrites = '0';
      Object.defineProperty(element, 'currentTime', {
        get() {
          return descriptor.get!.call(this);
        },
        set(value: number) {
          element.dataset.seekWrites = String(Number(element.dataset.seekWrites) + 1);
          descriptor.set!.call(this, value);
        },
      });
    });
    for (let cycle = 0; cycle < 3; cycle++) {
      await video.evaluate((element: HTMLVideoElement) => element.play());
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
        .toBeGreaterThan(1.5);
      await video.evaluate((element: HTMLVideoElement) => {
        element.pause();
        element.dataset.seekWrites = '0';
      });
      const from = await pointAt(0.2),
        middle = await pointAt(0.1),
        end = await pointAt(0);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(middle.x, middle.y, { steps: 20 });
      await page.mouse.move(end.x - 20, end.y, { steps: 20 });
      await expect(video).toHaveAttribute('data-seek-writes', '0');
      await expect(slider).toHaveValue('0');
      await page.mouse.up();
      await expect(video).toHaveAttribute('data-seek-writes', '1');
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.seeking))
        .toBe(false);
      expect(
        await video.evaluate((element: HTMLVideoElement) => ({
          time: element.currentTime,
          error: element.error?.code ?? null,
        })),
      ).toEqual({ time: 0, error: null });
    }
    // An already-zero click must not seek again; keyboard changes still commit immediately.
    const end = await pointAt(0);
    await page.mouse.click(end.x, end.y);
    await expect(video).toHaveAttribute('data-seek-writes', '1');
    await slider.press('ArrowRight');
    await expect(video).toHaveAttribute('data-seek-writes', '2');
    await expect(slider).toHaveValue('1');
    const from = await pointAt(0.2),
      middle = await pointAt(0.1);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(middle.x, middle.y, { steps: 10 });
    await slider.dispatchEvent('pointercancel');
    await page.mouse.up();
    await expect(video).toHaveAttribute('data-seek-writes', '2');
    await expect(slider).toHaveValue('1');
    await video.evaluate((element: HTMLVideoElement) => element.play());
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
      .toBeGreaterThan(0.5);
    await video.evaluate((element: HTMLVideoElement) => element.pause());
    await page.screenshot({ path: `artifacts/scrub-${source}.png` });
  });
}

test('真实 MP4 播放、暂停、跳转、变速和单视频切换 @smoke', async ({ page }) => {
  await demo(page);
  await expect(page.locator('video')).toHaveCount(1);
  const videoNode = (await page.locator('video').elementHandle())!;
  for (const name of ['新建', '打开作品', '更换视频', '保存草稿', '导出 JSON', '操作帮助'])
    await expect(page.getByRole('button', { name, exact: true })).not.toBeVisible();
  await expect(page.getByRole('navigation')).not.toBeVisible();
  await expect(page.getByTestId('special-cue')).toHaveText('');
  const info = await page.locator('video').evaluate((v) => ({
    width: (v as HTMLVideoElement).videoWidth,
    height: (v as HTMLVideoElement).videoHeight,
    duration: (v as HTMLVideoElement).duration,
  }));
  expect(info.width).toBe(1920);
  expect(info.height).toBe(1080);
  expect(info.duration).toBeCloseTo(TEST_DURATION_MS / 1000, 1);
  await seek(page, 3);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'sway');
  await page.screenshot({ path: 'artifacts/demo-player.png', fullPage: true });
  await seek(page, 1);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'idle');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(1.4);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime);
  await page.waitForTimeout(350);
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime)).toBe(
    paused,
  );
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 0.5;
  });
  await seek(page, 3);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'sway');
  await editInStudio(page);
  expect(await videoNode.evaluate((v) => v.isConnected)).toBe(true);
  await expect(page.getByRole('button', { name: '打开作品', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/demo-editor.png', fullPage: true });
  expect(
    await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime),
  ).toBeCloseTo(3, 1);
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).playbackRate)).toBe(
    0.5,
  );
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await seek(page, 23.5);
  await expect(page.getByTestId('special-cue')).toContainText('GET READY');
  await seek(page, 24.4);
  await expect(page.getByTestId('special-cue')).toContainText('SPECIAL!');
  await seek(page, 26);
  await expect(page.getByTestId('special-cue')).not.toContainText('SPECIAL!');
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 1;
  });
  await seek(page, TEST_DURATION_MS / 1000 - 0.3);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).ended))
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});
