import { expect, test } from '@playwright/test';

test('album wheel notches advance smoothly without snapping back; reversal and keyboard stay responsive', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const shelf = page.locator('.album-shelf');
  const current = page.locator('.collection-album[aria-current="true"]');
  const idle = () => expect(shelf).not.toHaveAttribute('data-wheel-scrolling');
  await shelf.hover();
  await page.mouse.wheel(0, 120);
  await idle();
  await expect(current).toHaveAttribute('data-id', 'touhou');
  const first = await shelf.evaluate((node) => node.scrollTop);
  expect(first).toBeGreaterThan(200);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(50);
  await page.mouse.wheel(0, 120);
  await idle();
  await expect(current).toHaveAttribute('data-id', 'vocaloid');
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(60);
  const turning = await shelf.evaluate((node) => node.scrollTop);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => shelf.evaluate((node) => node.scrollTop)).toBeLessThan(turning - 30);
  await idle();
  const selected = await current.getAttribute('data-id');
  // Wheel selection does not move a stationary pointer's highlight. Target the
  // selected card explicitly before testing a keyboard step from that card.
  await current.hover();
  await current.focus();
  await page.keyboard.press('ArrowDown');
  await expect(current).not.toHaveAttribute('data-id', selected!);
  await expect(shelf).not.toHaveAttribute('data-wheel-scrolling');
  await expect
    .poll(() =>
      current.evaluate((card: HTMLElement) => {
        const shelf = card.parentElement!;
        return Math.abs(
          card.offsetTop + card.offsetHeight / 2 - shelf.scrollTop - shelf.clientHeight / 2,
        );
      }),
    )
    .toBeLessThan(4);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.wheel(0, -120);
  await idle();
  await expect(current).toHaveAttribute('data-id', selected!);
  await page.screenshot({ path: 'artifacts/album-wheel-1080p.png' });
});
