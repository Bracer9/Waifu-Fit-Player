import { expect, test, type Page } from '@playwright/test';
import { blankChart } from '../src/model';
import { AFTER_SHOW_FINISH } from '../src/after-show';
import { AFTER_SHOW_SNAP } from '../src/after-show-snap';
import { importDemo } from './helpers/project';
import { putSongs, readSongs } from './helpers/library';

async function setup(page: Page, range: boolean, withNext = false) {
  await page.addInitScript(() => {
    const probe = { music: [] as HTMLAudioElement[], events: [] as { name: string; at: number }[] };
    Object.assign(window, { afterShowAudio: probe });
    const NativeAudio = window.Audio;
    window.Audio = class extends NativeAudio {
      constructor(src?: string) {
        super(src);
        probe.music.push(this);
      }
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const name = this.dataset.menuSound ?? (this === probe.music[0] ? 'bgm' : '');
      if (name) probe.events.push({ name, at: performance.now() });
      return play.call(this);
    };
  });
  await page.goto('/');
  await importDemo(page, {
    ...blankChart('After Show / first'),
    ...(range ? { playRange: { startMs: 1000, endMs: 4000 } } : {}),
    notes: [{ id: 'move', lane: 'squat', kind: 'tap', direction: 'down', timeMs: 2000 }],
  });
  if (withNext) {
    const song = (await readSongs(page))[0];
    const edition = { ...song.drafts.dance!, albumId: 'pop', updatedAt: 20 };
    await putSongs(page, [
      { ...song, released: { dance: edition } },
      {
        id: 'b6b7c8d9-1234-4234-8234-0123456789ab',
        drafts: {},
        released: {
          fitness: {
            ...edition,
            updatedAt: 10,
            chart: {
              ...edition.chart,
              songId: 'b6b7c8d9-1234-4234-8234-0123456789ab',
              chartType: 'fitness',
              title: 'After Show / next',
            },
          },
        },
      },
    ]);
    // Reload the same saved draft so the running app also sees both released tracks.
    await page.reload();
    await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
    await page.locator('.create-mode').click();
    await expect(page.getByRole('button', { name: '试玩谱面', exact: true })).toBeEnabled();
  }
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.locator('.practice')).toBeVisible();
  if (
    (await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)) &&
    !(await page.locator('.ready-countdown').count())
  )
    await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(false);
}

async function finish(page: Page, end: number) {
  await page.locator('video').evaluate((video: HTMLVideoElement, end) => {
    video.currentTime = end - 0.3;
  }, end);
  await expect(page.locator('.after-show')).toBeVisible();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
}

test('photo settles before room lighting, results entry and metric counting begin', async ({
  page,
}) => {
  await setup(page, true);
  await expect(page.locator('.studio-startup-lighting')).toHaveCount(0);
  await page.locator('video').evaluate((video: HTMLVideoElement) => {
    video.currentTime = 3.7;
  });
  const snap = page.locator('.after-show-snap');
  await expect(snap).toHaveAttribute('data-phase', 'photo');
  await expect(snap).not.toHaveAttribute('data-settled');
  await expect(page.locator('.practice')).toHaveAttribute('data-after-show', 'photo');
  await expect(page.locator('.after-show')).toHaveCount(0);
  await expect(page.locator('.studio-finish-lighting')).toHaveCount(0);
  await expect(page.locator('.studio-afterglow')).toHaveCount(0);
  const fade = await page.locator('.practice-performance .player-lanes').evaluate((node) => ({
    opacity: Number(getComputedStyle(node).opacity),
    animation: getComputedStyle(node).animationName,
  }));
  expect(fade.opacity).toBeGreaterThan(0);
  expect(fade.animation).toBe('after-show-tracks-out');
  await expect(snap).toHaveAttribute('data-settled', 'true');
  await expect(page.locator('.practice')).toHaveAttribute('data-after-show', 'summary');
  await expect(page.locator('.studio-finish-lighting')).toHaveCount(1);
  await expect(page.locator('.studio-afterglow')).toHaveCount(1);
  await expect(page.locator('.after-show-metrics dd').first()).toHaveText('\u00a0');
  await expect(page.locator('.after-show-metrics dd').first()).toHaveText('00:03');
});

test('range end keeps the same stage frame, hides controls and supports encore plus keyboard return', async ({
  page,
}) => {
  await setup(page, true);
  const video = await page.locator('video').elementHandle();
  const bounds = (await page.locator('.video-viewport').boundingBox())!;
  await finish(page, 4);
  expect(await video!.evaluate((node) => node === document.querySelector('video'))).toBe(true);
  await expect(page.locator('.after-show h2')).toHaveText('TRACKFINISHED');
  const snap = page.locator('.after-show-snap');
  await expect(snap).toHaveAttribute('data-phase', 'photo');
  await expect(snap.locator('figcaption')).toContainText('AFTER SHOW SNAP');
  await expect(snap.locator('.after-show-snap-sheen')).toHaveCount(1);
  expect(
    await snap.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width),
  ).toBeGreaterThan(0);
  await expect(page.locator('video')).toHaveCount(1);
  await expect(page.locator('.after-show-metrics dd').first()).toHaveText('00:03');
  await expect(page.locator('.practice-performance')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.practice .transport')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = (window as unknown as { afterShowAudio: { music: HTMLAudioElement[] } })
          .afterShowAudio;
        return !probe.music[0].paused && probe.music[0].loop;
      }),
    )
    .toBe(true);
  const musicDelay = await page.evaluate(() => {
    const events = (
      window as unknown as { afterShowAudio: { events: { name: string; at: number }[] } }
    ).afterShowAudio.events;
    const finish = [...events].reverse().find((event) => event.name === 'celebrate')!;
    return events.find((event) => event.name === 'bgm' && event.at >= finish.at)!.at - finish.at;
  });
  expect(musicDelay).toBeGreaterThanOrEqual(AFTER_SHOW_FINISH.bgmDelayMs - 25);
  const photoBeforeCelebration = await page.evaluate(() => {
    const events = (
      window as unknown as { afterShowAudio: { events: { name: string; at: number }[] } }
    ).afterShowAudio.events;
    const shutter = [...events].reverse().find((event) => event.name === 'shutter')!;
    const celebration = events.find(
      (event) => event.name === 'celebrate' && event.at >= shutter.at,
    )!;
    return celebration.at - shutter.at;
  });
  expect(photoBeforeCelebration).toBeGreaterThanOrEqual(
    AFTER_SHOW_SNAP.flashMs + AFTER_SHOW_SNAP.revealMs - 25,
  );
  expect(await page.locator('.after-show').innerText()).not.toMatch(
    /score|rank|accuracy|perfect|combo/i,
  );
  const finishedBounds = (await page.locator('.video-viewport').boundingBox())!;
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(finishedBounds[key]).toBeCloseTo(bounds[key], 1);
  await expect(page.getByRole('button', { name: /NEXT TRACK/ })).toBeDisabled();
  await expect(page.locator('.after-show .cover-trace')).toHaveCount(0);
  await expect(page.locator('.after-show-estimate')).toHaveCount(0);
  await expect(page.locator('.after-show-kicker')).toHaveText('LIVE END ///');
  await expect(page.locator('.after-show-option[data-selected="true"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /BACK TO SELECT/ })).toHaveCSS(
    'background-color',
    'rgb(50, 198, 211)',
  );
  await expect
    .poll(() =>
      page
        .getByRole('button', { name: /ENCORE/ })
        .evaluate((button) => Number(button.style.getPropertyValue('--music-beat'))),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /BACK TO SELECT/ })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: /ENCORE/ })).toBeFocused();
  const back = page.getByRole('button', { name: /BACK TO SELECT/ });
  const box = (await back.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(back).toHaveAttribute('data-selected', 'true');
  await expect(back).toHaveCSS('border-color', 'rgb(29, 28, 33)');
  await expect(page.getByRole('button', { name: /ENCORE/ })).toHaveAttribute(
    'data-selected',
    'false',
  );
  await expect(page.locator('.after-show-option[data-selected="true"]')).toHaveCount(1);
  await expect
    .poll(() => back.evaluate((button) => parseFloat(getComputedStyle(button).scale)))
    .toBeGreaterThan(1.08);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.locator('.after-show')).toHaveCount(0);
  await expect(page.locator('.after-show-snap')).toHaveCount(0);
  await expect(page.locator('video')).toHaveCSS('filter', 'none');
  await expect(page.locator('.ready-countdown')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { afterShowAudio: { music: HTMLAudioElement[] } }).afterShowAudio
            .music[0].paused,
      ),
    )
    .toBe(true);
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(false);
  await finish(page, 4);
  await page.keyboard.press('Escape');
  await expect(page.locator('.music-menu.songs')).toBeVisible();
});

test('full video naturally ends and Next Track uses the next available edition and original start flow', async ({
  page,
}) => {
  await setup(page, false, true);
  await finish(page, 60);
  await expect(page.locator('.after-show-metrics dd').first()).toHaveText('01:00');
  // The button intentionally pulses with the BGM; click its centre without
  // waiting for Playwright's stable-box condition to stop that motion.
  const next = (await page.getByRole('button', { name: /NEXT TRACK/ }).boundingBox())!;
  await page.mouse.click(next.x + next.width / 2, next.y + next.height / 2);
  await expect(page.locator('.practice-track-info h1')).toHaveText('After Show / next');
  await expect(page.locator('.practice-chart-type')).toContainText('FITNESS');
  await expect(page.locator('.ready-countdown')).toBeVisible();
  await expect(page.locator('.after-show')).toHaveCount(0);
});
