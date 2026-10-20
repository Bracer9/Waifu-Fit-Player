import { expect, test } from '@playwright/test';
import { insertAlbum } from './helpers/project';

test('card presses preserve the existing transform', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.matches('.mode-record-face, .collection-album, .record-card')) animation.pause();
      return animation;
    };
  });
  // Enter uses the same press feedback as a mouse click.
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() => document.getAnimations().some((a) => a.id === 'menu-card-press')),
    )
    .toBe(true);
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.id.startsWith('menu-scene-') || a.id.startsWith('menu-card-press'))
      .forEach((a) => a.finish()),
  );
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.album-shelf')).toHaveCSS('translate', '0px');
  await page.locator('.collection-album').first().click();
  const press = await page.evaluate(() => {
    const animation = document.getAnimations().find((a) => a.id === 'menu-card-press')!;
    const effect = animation.effect as KeyframeEffect;
    animation.currentTime = 45;
    const style = getComputedStyle(effect.target!);
    return { composite: effect.composite, transform: style.transform, translate: style.translate };
  });
  expect(press.composite).toBe('add');
  expect(press.transform).not.toBe('none');
  expect(parseFloat(press.translate.split(' ')[1])).toBeGreaterThan(1);
  expect(parseFloat(press.translate.split(' ')[1])).toBeLessThanOrEqual(3);
});

test('song-to-album fade through keeps its gear and original corners continuous', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.play-mode')).toBeVisible();
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const gearBounds = await page.locator('.menu-settings').boundingBox();
  for (let visit = 0; visit < 2; visit++) {
    await page.locator('.collection-album[data-id="all"]').click();
    await insertAlbum(page);
    await page.locator('.menu-back').click();
    const frames = await page.evaluate(
      () =>
        new Promise<
          {
            phase: string;
            opacity: number;
            x: number;
            back: number | null;
            corners: boolean;
            gear: number[];
            time: number;
          }[]
        >((resolve, reject) => {
          const samples: {
            phase: string;
            opacity: number;
            x: number;
            back: number | null;
            corners: boolean;
            gear: number[];
            time: number;
          }[] = [];
          const start = performance.now();
          let ended = false,
            emptyFrames = 0;
          const tick = () => {
            const guard = document.querySelector<HTMLElement>('.menu-curtain');
            if (guard) {
              if (ended) return reject(new Error('Menu transition restarted after finishing.'));
              const style = getComputedStyle(document.querySelector('.menu-scene')!);
              const gear = document.querySelector('.menu-settings')!.getBoundingClientRect();
              samples.push({
                phase: guard.dataset.phase!,
                opacity: Number(style.opacity),
                x: new DOMMatrix(style.transform === 'none' ? undefined : style.transform).e,
                back: document.querySelector('.menu-back')?.getBoundingClientRect().x ?? null,
                corners: [
                  ...document.querySelectorAll<HTMLElement>('.menu-app > .ambient-shape'),
                ].every((corner) => {
                  const style = getComputedStyle(corner);
                  const shift =
                    style.translate === 'none'
                      ? [0, 0]
                      : style.translate.split(' ').map(parseFloat);
                  return (
                    style.visibility === 'visible' &&
                    style.opacity === '1' &&
                    Math.abs(shift[0]) <= 18.1 &&
                    Math.abs(shift[1] ?? 0) <= 12.1 &&
                    !corner.style.transform &&
                    !corner.style.visibility &&
                    !corner.style.scale &&
                    !corner.style.transition
                  );
                }),
                gear: [gear.x, gear.y, gear.width, gear.height],
                time: performance.now() - start,
              });
            } else {
              ended = true;
              if (++emptyFrames === 3) return resolve(samples);
            }
            if (performance.now() - start > 2000)
              return reject(new Error('Menu transition did not finish.'));
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(frames.length).toBeGreaterThan(8);
    expect(frames.every((frame) => frame.corners && Math.abs(frame.x) <= 12.1)).toBe(true);
    for (const frame of frames)
      if (frame.back !== null) expect(Math.abs(frame.back - 1920 * 0.05)).toBeLessThanOrEqual(12.1);
    for (const frame of frames)
      expect(frame.gear).toEqual([
        gearBounds!.x,
        gearBounds!.y,
        gearBounds!.width,
        gearBounds!.height,
      ]);
    const cover = frames.filter((frame) => frame.phase === 'cover');
    const reveal = frames.filter((frame) => frame.phase === 'reveal');
    expect(cover.length).toBeGreaterThan(2);
    expect(reveal.length).toBeGreaterThan(4);
    for (let i = 1; i < cover.length; i++)
      expect(cover[i].opacity).toBeLessThanOrEqual(cover[i - 1].opacity);
    for (let i = 1; i < reveal.length; i++)
      expect(reveal[i].opacity).toBeGreaterThanOrEqual(reveal[i - 1].opacity);
    expect(frames.at(-1)!.time).toBeLessThan(550);
    await expect(page.locator('.menu-scene')).toHaveCSS('opacity', '1');
    await expect(page.locator('.menu-scene')).toHaveCSS('transform', 'none');
    expect(
      await page.evaluate(() =>
        document
          .getAnimations()
          .some(
            (animation) =>
              animation.id.startsWith('menu-scene-') || animation.id.startsWith('menu-corner-'),
          ),
      ),
    ).toBe(false);
  }
});
