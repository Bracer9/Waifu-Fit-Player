import { test, expect } from '@playwright/test';

test('折页专辑在窗口与全屏保留 16:9 视频、五轨和真实播放控制', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '体验示例作品', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const video = page.locator('video');
  const videoNode = (await video.elementHandle())!;
  await video.evaluate((element) => {
    (element as HTMLVideoElement).currentTime = 12.5;
  });
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).seeking))
    .toBe(false);
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
    [2560, 1080],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const checkLayout = async () => {
      expect(
        await video.evaluate((element) => element.clientWidth / element.clientHeight),
      ).toBeCloseTo(16 / 9, 2);
      await expect(video).toHaveCSS('object-fit', 'contain');
      await expect(page.locator('.play-lane')).toHaveCount(5);
      await expect
        .poll(() =>
          page
            .locator('.studio-scene')
            .evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
        )
        .toBe(true);
      // The foreground bottle must remain fully visible and clear of the actual playfield.
      const bottle = (await page.locator('.studio-bottle').boundingBox())!;
      expect(bottle.x).toBeGreaterThanOrEqual(0);
      expect(bottle.y).toBeGreaterThanOrEqual(0);
      expect(bottle.x + bottle.width).toBeLessThanOrEqual(width);
      expect(bottle.y + bottle.height).toBeLessThanOrEqual(height);
      for (const item of await page.locator('.note-highway, .video-panel').all()) {
        const box = (await item.boundingBox())!;
        expect(bottle.x + bottle.width <= box.x || bottle.y >= box.y + box.height).toBe(true);
      }
      const foreground = (await page.locator('.practice-foreground').boundingBox())!;
      expect(foreground.height).toBeGreaterThan(height * 0.2);
      await expect(page.locator('.practice-foreground')).toHaveCSS('pointer-events', 'none');
      expect(
        await page.evaluate(() => ({
          x: document.documentElement.scrollWidth > innerWidth,
          y: document.documentElement.scrollHeight > innerHeight,
        })),
      ).toEqual({ x: false, y: false });
      for (const item of await page
        .locator('.play-lane, .video-panel, .return-workspace, .transport')
        .all()) {
        const box = (await item.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
      }
      // Measure actual transformed corners, rather than inferring a fold from shadows or CSS angles.
      const corners = await page.locator('.stage-left, .stage-right').evaluateAll((leaves) =>
        leaves.map((leaf) =>
          ['0', '100%'].map((left) => {
            const probe = document.createElement('i');
            Object.assign(probe.style, {
              position: 'absolute',
              left,
              top: '100%',
              width: '0',
              height: '0',
              pointerEvents: 'none',
            });
            leaf.appendChild(probe);
            const { x, y } = probe.getBoundingClientRect();
            probe.remove();
            return { x, y };
          }),
        ),
      );
      const [[outerLeft, spineLeft], [spineRight, outerRight]] = corners;
      expect(outerLeft.y - spineLeft.y).toBeGreaterThan(height * 0.03);
      expect(outerRight.y - spineRight.y).toBeGreaterThan(height * 0.03);
      expect(Math.abs(spineLeft.x - spineRight.x)).toBeLessThan(2);
      expect(Math.abs(spineLeft.y - spineRight.y)).toBeLessThan(2);
      if (width / height < 1.8) {
        expect(outerLeft.x).toBeLessThan(width * 0.05);
        expect(outerRight.x).toBeGreaterThan(width * 0.95);
      }
      if (width === 1920)
        console.info('Album bottom corners at 1920×1080:', JSON.stringify(corners));
    };
    await checkLayout();
    const size = height === 1440 ? `${width}-${height}` : `${width}`;
    await page.screenshot({ path: `artifacts/album-window-${size}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await checkLayout();
    await page.screenshot({ path: `artifacts/album-fullscreen-${size}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeGreaterThan(12.8);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await video.evaluate((element) => (element as HTMLVideoElement).currentTime);
  await page.getByLabel('Playback speed').selectOption('0.75');
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  expect(await videoNode.evaluate((element) => element.isConnected)).toBe(true);
  expect(await video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeCloseTo(
    paused,
    2,
  );
  await expect(page.getByRole('button', { name: '打开作品', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  await expect(page.getByLabel('Playback speed')).toHaveValue('0.75');
  expect(await videoNode.evaluate((element) => element.isConnected)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: 'artifacts/album-reduced-motion.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('较窄与较矮窗口保留音符，竖屏可滚动且视频保持比例', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '体验示例作品', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  for (const [width, height] of [
    [1024, 768],
    [1280, 640],
    [1440, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    for (const target of await page.locator('.hit-target').all()) {
      const fits = await target.evaluate((element: HTMLElement) => {
        const highway = element.parentElement!;
        return element.offsetLeft + element.offsetWidth / 2 <= highway.clientWidth + 1;
      });
      expect(fits).toBe(true);
    }
    expect(
      await page
        .locator('.lanes-stack')
        .evaluate((stack) => stack.scrollHeight <= stack.clientHeight + 1),
    ).toBe(true);
    expect(
      await page.locator('video').evaluate((element) => element.clientWidth / element.clientHeight),
    ).toBeCloseTo(16 / 9, 2);
    await page.screenshot({
      path: `artifacts/album-compact-${width}-${height}.png`,
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});
