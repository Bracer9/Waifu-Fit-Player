import { expect, test, type Page } from '@playwright/test';
import { LIQUID_TRANSITION } from '../src/liquid-transition';

async function at(page: Page, phase: string, time: number) {
  await page.evaluate(
    ({ phase, time }) => {
      const animation = document.getAnimations().find((a) => a.id === `menu-liquid-${phase}`)!;
      animation.currentTime = time;
    },
    { phase, time },
  );
  const duration = phase === 'cover' ? LIQUID_TRANSITION.coverMs : LIQUID_TRANSITION.revealMs;
  await expect(page.locator('.liquid-menu-curtain')).toHaveAttribute(
    'data-progress',
    (time / duration).toFixed(3),
  );
}

test('opening starts fully cyan, reveals home without flooding again, and restores menu input', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains('liquid-menu-curtain')) animation.pause();
      return animation;
    };
  });
  await page.goto('/');
  const intro = page.locator('.liquid-menu-curtain[data-intro]');
  await expect(intro).toHaveAttribute('data-phase', 'hold');
  await expect(intro).toHaveAttribute('data-liquid', 'cyan');
  await expect(intro.locator('h2')).toHaveText('WAIFU FITPLAYER');
  await expect(page.locator('.menu-scene')).toHaveAttribute('inert', '');
  expect(
    await page
      .locator('.liquid-fill')
      .evaluate((path: SVGPathElement) =>
        [1, innerWidth / 2, innerWidth - 1].every((x) =>
          [1, innerHeight / 2, innerHeight - 1].every((y) =>
            path.isPointInFill(new DOMPoint(x, y)),
          ),
        ),
      ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'artifacts/liquid-opening-1080p.png' });
  await page.keyboard.press('Enter');
  await expect(page.locator('.music-menu.albums')).toHaveCount(0);
  await page.evaluate(() =>
    document
      .getAnimations()
      .find((a) => a.id === 'menu-liquid-hold')!
      .finish(),
  );
  await expect(intro).toHaveAttribute('data-phase', 'reveal');
  expect(
    await page.evaluate(() => document.getAnimations().some((a) => a.id === 'menu-liquid-cover')),
  ).toBe(false);
  await at(page, 'reveal', LIQUID_TRANSITION.revealMs * 0.45);
  await page.screenshot({ path: 'artifacts/liquid-opening-reveal-1080p.png' });
  await page.evaluate(() =>
    document
      .getAnimations()
      .find((a) => a.id === 'menu-liquid-reveal')!
      .finish(),
  );
  await expect(intro).toHaveCount(0);
  await expect(page.locator('.play-mode')).toHaveAttribute('data-highlighted', '');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.create-mode')).toHaveAttribute('data-highlighted', '');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.play-mode')).toHaveAttribute('data-highlighted', '');
});

test('cold font loading keeps the cyan opening intact without showing a temporary title face', async ({
  page,
}) => {
  let releaseFonts!: () => void;
  const fonts = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  await page.route('**/*.woff*', async (route) => {
    await fonts;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const intro = page.locator('.liquid-menu-curtain[data-intro]');
  try {
    await expect(intro).toHaveAttribute('data-phase', 'hold');
    await expect(intro).not.toHaveAttribute('data-type-ready');
    await expect(intro.locator('.liquid-briefing')).toHaveCSS('visibility', 'hidden');
    // A slow first download must not consume the title's readable hold duration.
    await page.waitForTimeout(LIQUID_TRANSITION.introHoldMs + 80);
    await expect(intro).toHaveAttribute('data-phase', 'hold');
    expect(
      await page.evaluate(() => document.getAnimations().some((a) => a.id === 'menu-liquid-hold')),
    ).toBe(false);
    releaseFonts();
    await expect(intro).toHaveAttribute('data-type-ready', 'true');
    await expect(intro.locator('h2')).toBeVisible();
    expect(
      await page.evaluate(() =>
        [600, 700, 900].every((weight) =>
          document.fonts.check(`${weight} 16px "Barlow Condensed"`),
        ),
      ),
    ).toBe(true);
    await expect(intro).toHaveAttribute('data-phase', 'hold');
    await expect(intro).toHaveCount(0);
    await expect(page.locator('.play-mode')).toHaveAttribute('data-highlighted', '');
  } finally {
    releaseFonts();
  }
});

test('pink floods into albums, cyan floods home; only the fully covered frame swaps pages', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.addStyleTag({ content: '.menu-app { --music-beat: 0.73 !important }' });
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains('liquid-menu-curtain')) animation.pause();
      return animation;
    };
  });
  for (const back of [false, true]) {
    const source = page.locator(back ? '.music-menu.albums' : '.title-menu');
    const target = page.locator(back ? '.title-menu' : '.music-menu.albums');
    const scene = await page.locator('.menu-scene').boundingBox();
    await page.locator(back ? '.menu-back' : '.play-mode').click();
    const curtain = page.locator('.liquid-menu-curtain');
    await expect(curtain).toHaveAttribute('data-liquid', back ? 'cyan' : 'pink');
    await expect(source).toBeVisible();
    await at(page, 'cover', 350);
    await expect(target).toHaveCount(0);
    await expect(page.locator('.menu-scene')).toHaveCSS('opacity', '1');
    expect(await page.locator('.menu-scene').boundingBox()).toEqual(scene);
    await page.screenshot({ path: `artifacts/liquid-${back ? 'return' : 'entry'}-1080p.png` });
    await at(page, 'cover', LIQUID_TRANSITION.coverMs - 1);
    const full = await page.locator('.liquid-fill').evaluate((element: SVGPathElement) => {
      const width = innerWidth,
        height = innerHeight;
      return [1, width / 2, width - 1].every((x) =>
        [1, height / 2, height - 1].every((y) => element.isPointInFill(new DOMPoint(x, y))),
      );
    });
    expect(full).toBe(true);
    await expect(page.locator('.liquid-prints [data-move]')).toHaveCount(5);
    await expect(page.locator('.liquid-briefing')).toHaveCSS('opacity', '1');
    await expect(page.locator('.liquid-briefing h2')).toHaveText(
      back ? 'YOUR MUSIC.YOUR MOVEMENT.' : 'SELECT YOURMUSIC',
    );
    await expect(page.locator('.liquid-beat-bar > i').last()).toHaveCSS('--cell', '4');
    await expect(source).toBeVisible();
    await page.evaluate(() =>
      document
        .getAnimations()
        .find((a) => a.id === 'menu-liquid-cover')!
        .finish(),
    );
    await expect(curtain).toHaveAttribute('data-phase', 'reveal');
    await expect(target).toBeVisible();
    await expect(source).toHaveCount(0);
    // Retreat is still a full-width wave, never a narrowing corner silhouette.
    await at(page, 'reveal', LIQUID_TRANSITION.revealMs * 0.4);
    const waveSpan = await page
      .locator('.liquid-surface-highlight')
      .evaluate((path: SVGPathElement) => {
        const length = path.getTotalLength();
        const ys = Array.from({ length: 25 }, (_, i) => path.getPointAtLength((length * i) / 24).y);
        return Math.max(...ys) - Math.min(...ys);
      });
    expect(waveSpan).toBeLessThan(1080 * 0.06);
    // The entire wave and both corners leave before the original shapes return.
    await at(
      page,
      'reveal',
      LIQUID_TRANSITION.revealMs * (LIQUID_TRANSITION.cornerReturnStart - 0.01),
    );
    const cleared = await page
      .locator('.liquid-fill')
      .evaluate((path: SVGPathElement) =>
        [1, innerWidth / 2, innerWidth - 1].every((x) =>
          [1, innerHeight / 2, innerHeight - 1].every(
            (y) => !path.isPointInFill(new DOMPoint(x, y)),
          ),
        ),
      );
    expect(cleared).toBe(true);
    const primary = page.locator('.liquid-corner-primary');
    const outside = (await primary.boundingBox())!;
    expect(back ? outside.y > 1080 : outside.y + outside.height < 0).toBe(true);
    expect((await page.locator('.menu-settings').boundingBox())!.y + 112).toBeLessThan(0);
    await at(page, 'reveal', LIQUID_TRANSITION.revealMs * 0.9);
    const incoming = (await primary.boundingBox())!;
    expect(back ? incoming.y < 1080 : incoming.y + incoming.height > 0).toBe(true);
    const beforeBeat = await primary.getAttribute('points');
    await page.addStyleTag({
      content: `.menu-app { --music-beat: ${back ? 0.73 : 0.15} !important }`,
    });
    await expect.poll(() => primary.getAttribute('points')).not.toBe(beforeBeat);
    const liveCorner = page.locator(`.ambient-shape.${back ? 'cyan' : 'pink'}`);
    await liveCorner.evaluate((node) =>
      Promise.all(node.getAnimations().map((a) => a.finished.catch(() => {}))),
    );
    await at(page, 'reveal', LIQUID_TRANSITION.revealMs - 1);
    // Last frame is the real live geometry, so restoring the DOM corners cannot jump.
    const actual = await liveCorner.evaluate((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    });
    const final = (await primary.boundingBox())!;
    for (const edge of ['x', 'y', 'width', 'height'] as const)
      expect(Math.abs(actual[edge] - final[edge])).toBeLessThan(1.5);
    await page.evaluate(() =>
      document
        .getAnimations()
        .find((a) => a.id === 'menu-liquid-reveal')!
        .finish(),
    );
    await expect(curtain).toHaveCount(0);
    expect(
      await page.locator('.ambient-shape').evaluateAll((nodes) =>
        nodes.every((n) => {
          const style = (n as HTMLElement).style;
          return !style.visibility && !style.transform && !style.translate;
        }),
      ),
    ).toBe(true);
    await expect(page.locator('.menu-settings')).toHaveCSS('opacity', '1');
  }
});

test('water and bubbles layer with the menu click, stop on completion, and respect SE mute', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const started: { name: string; volume: number }[] = [];
    const stopped: string[] = [];
    const audible: string[] = [];
    Object.assign(window, { liquidAudioQA: { started, stopped, audible } });
    const play = HTMLMediaElement.prototype.play;
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = function () {
      const name = this.dataset.menuSound;
      if (name) started.push({ name, volume: this.volume });
      const result = play.call(this);
      if (name) void result.then(() => audible.push(name)).catch(() => {});
      return result;
    };
    HTMLMediaElement.prototype.pause = function () {
      if (this.dataset.menuSound) stopped.push(this.dataset.menuSound);
      return pause.call(this);
    };
  });
  await page.goto('/');
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const state = await page.evaluate(
    () =>
      (
        window as unknown as {
          liquidAudioQA: {
            started: { name: string; volume: number }[];
            stopped: string[];
            audible: string[];
          };
        }
      ).liquidAudioQA,
  );
  expect(state.started.map((event) => event.name)).toEqual(['mode', 'liquid']);
  expect(state.started.every((event) => event.volume === 0.5)).toBe(true);
  expect(state.audible).toEqual(expect.arrayContaining(['mode', 'liquid']));
  expect(state.stopped).toContain('liquid');
  expect(state.stopped).not.toContain('mode');
  await page.evaluate(() => localStorage.setItem('waifu-fit-player-se-volume', '0'));
  await page.reload();
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            liquidAudioQA: { started: unknown[] };
          }
        ).liquidAudioQA.started,
    ),
  ).toEqual([]);
});

test('albums ↔ songs retain the ordinary transition, and reduced motion skips liquid', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  for (const action of ['.collection-album[data-id="all"]', '.menu-back']) {
    await page.locator(action).click();
    await expect(page.locator('.menu-curtain')).toBeVisible();
    await expect(page.locator('.liquid-menu-curtain')).toHaveCount(0);
    await expect(page.locator('.menu-curtain')).toHaveCount(0);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.menu-back').click();
  await expect(page.locator('.title-menu')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.play-mode').click();
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
});
