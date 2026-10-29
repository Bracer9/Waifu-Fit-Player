import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 2557, height: 1427 },
  { width: 1470, height: 956 },
]) {
  test(`pink housing stays painted while open and pulsing at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
    await page.getByRole('button', { name: /舞蹈模式/ }).click();
    await expect(page.locator('.music-menu.albums')).toBeVisible();
    await expect(page.locator('.menu-curtain')).toHaveCount(0);
    await page.locator('.collection-album[data-id="pop"]').click();
    await expect(page.locator('.album-deck')).toHaveAttribute('data-ready');
    const pink = page.locator('.ambient-shape.pink');
    await expect(pink).toHaveCSS('box-shadow', 'none');
    await expect(pink).toHaveCSS('clip-path', 'none');
    const stage = (await page.locator('#root').boundingBox())!;
    for (const beat of [0, 1, 0.2]) {
      await pink.evaluate(
        (node, beat) =>
          (node as HTMLElement).style.setProperty('--music-beat', String(beat), 'important'),
        beat,
      );
      await page.waitForTimeout(150);
      // Sample real composited pixels well inside the housing's outer right edge.
      const strip = await page.screenshot({
        clip: {
          x: stage.x + stage.width - 14,
          y: stage.y + stage.height * 0.25,
          width: 8,
          height: Math.floor(stage.height * 0.5),
        },
      });
      const pinkRatio = await page.evaluate(async (png) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + png;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        let colored = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (
            Math.abs(pixels[i] - 246) < 3 &&
            Math.abs(pixels[i + 1] - 78) < 3 &&
            Math.abs(pixels[i + 2] - 147) < 3
          )
            colored++;
        return colored / (image.width * image.height);
      }, strip.toString('base64'));
      expect(
        pinkRatio,
        `beat ${beat}: housing background must not turn into the cream page`,
      ).toBeGreaterThan(0.98);
    }
    await page.screenshot({
      path: `artifacts/album-housing-investigation/bounded-fill-${viewport.width}.png`,
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('.album-deck')).not.toHaveAttribute('data-open');
    await expect(pink).toHaveCSS('translate', '0px');
    await page.locator('.collection-album[data-id="anime"]').click();
    await expect(page.locator('.album-deck')).toHaveAttribute('data-ready');
  });
}
