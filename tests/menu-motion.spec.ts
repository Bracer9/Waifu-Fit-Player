import { expect, test } from '@playwright/test';

test('专辑首尾居中，滚轮与键盘对焦，点击邻近专辑后返回保留位置', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const shelf = page.locator('.album-shelf');
  const current = page.locator('.collection-album[aria-current="true"]');
  const centered = async () => {
    await expect
      .poll(() =>
        current.evaluate((node) => {
          const card = node.getBoundingClientRect();
          const area = node.parentElement!.getBoundingClientRect();
          return Math.abs(card.y + card.height / 2 - area.y - area.height / 2);
        }),
      )
      .toBeLessThan(5);
  };
  await expect(current).toHaveAttribute('data-id', 'all');
  await centered();
  await shelf.hover();
  await page.mouse.wheel(0, 300);
  await expect(current).not.toHaveAttribute('data-id', 'all');
  await centered();
  // The cover loses focus, but the category label and card frame remain crisp.
  const unfocused = page.locator('.collection-album[aria-current="false"]').first();
  await expect(unfocused).toHaveCSS('filter', 'none');
  await expect(unfocused.locator('.collection-label')).toHaveCSS('filter', 'none');
  await expect(unfocused.locator('.cover-placeholder')).not.toHaveCSS('filter', 'none');
  await page.screenshot({ path: 'artifacts/album-focus-gallery.png' });
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowDown');
    await centered();
  }
  await expect(current).toHaveAttribute('data-id', 'touhou');
  await centered();
  await page.setViewportSize({ width: 1280, height: 720 });
  await centered();
  await page.screenshot({ path: 'artifacts/album-focus-last-720.png' });
  // A non-focused card still opens on a single click, during the existing curtain.
  const neighbor = page.locator('.collection-album[data-id="vocaloid"]');
  await neighbor.click();
  await expect(page.locator('.music-menu.songs h1')).toHaveText('虚拟歌姬');
  await page.getByRole('button', { name: '选择专辑', exact: true }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(current).toHaveAttribute('data-id', 'vocaloid');
  await centered();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('ArrowUp');
  await expect(current).toHaveAttribute('data-id', 'pop');
  await centered();
  await expect(current).toHaveCSS('transform', 'none');
  await expect(unfocused.locator('.cover-placeholder')).toHaveCSS('filter', 'none');
  expect(errors).toEqual([]);
});
