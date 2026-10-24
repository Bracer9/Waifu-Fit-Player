import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blankChart } from '../src/model';
import { importDemo } from './helpers/project';
import { putAlbums } from './helpers/library';

test('inserted Vocaloid cover retains the authored idle composition and its own SVG masks', async ({
  page,
}) => {
  await page.goto('/');
  await importDemo(page, {
    ...blankChart('Vocaloid insertion'),
    notes: [{ id: 'n', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 }],
  });
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('vocaloid');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await putAlbums(page, [
    {
      id: 'vocaloid',
      name: '虚拟歌姬',
      cover:
        'data:image/png;base64,' +
        (await readFile('src/assets/albums-illustrations/vocaloid_album2.png')).toString('base64'),
    },
  ]);
  await page.reload();
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const card = page.locator('.collection-album[data-id="vocaloid"]');
  const face = card.locator('.album-cover-detail.vinyl');
  await expect(face).toHaveCSS('opacity', '1');
  await expect(card).toHaveAttribute('aria-current', 'false');
  const idleImages = await face
    .locator('image')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
  await card.click();
  await expect(page.locator('.album-deck')).toHaveAttribute('data-ready');
  await card.locator('.album-vinyl-spin').evaluate((node) => {
    for (const animation of node.getAnimations()) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  await card
    .locator('.collection-art')
    .screenshot({ path: 'artifacts/vocaloid-idle-composition.png' });
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains('album-flight-card') && !this.hasAttribute('data-returning')) {
        animation.pause();
        animation.currentTime = 0;
      }
      return animation;
    };
  });
  await page.keyboard.press('Enter');
  const flight = page.locator('.album-flight-card');
  await expect(flight).toBeVisible();
  await flight
    .locator('.collection-art')
    .screenshot({ path: 'artifacts/vocaloid-insertion-composition.png' });
  const refs = await flight
    .locator('svg [clip-path], svg [mask], svg [filter]')
    .evaluateAll((nodes) =>
      nodes.flatMap((node) =>
        [...node.attributes].flatMap((attribute) => {
          const match = /^url\(#(.+)\)$/.exec(attribute.value);
          return match
            ? [
                {
                  value: attribute.value,
                  local:
                    document.getElementById(match[1])?.closest('.album-flight-card') ===
                    node.closest('.album-flight-card'),
                },
              ]
            : [];
        }),
      ),
    );
  expect(refs.length).toBeGreaterThan(0);
  expect(refs.every((ref) => ref.local)).toBe(true);
  await expect(flight.locator('.album-cover-detail.vinyl')).toHaveCSS('opacity', '1');
  expect(
    await flight
      .locator('.album-cover-detail image')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
  ).toEqual(idleImages);
  await expect(flight.locator('.album-vinyl-spin')).toHaveCSS('animation-play-state', 'paused');
  await page.keyboard.press('Escape');
  await expect(flight).toHaveCount(0);
  await expect(card).toHaveCSS('visibility', 'visible');
  await expect(face).toHaveCSS('opacity', '1');
});
