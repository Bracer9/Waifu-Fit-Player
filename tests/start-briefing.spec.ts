import { expect, test, type Page } from '@playwright/test';
import { blankChart, type Note } from '../src/model';
import { createCalorieIndex } from '../src/calories';
import { START_BRIEFING } from '../src/start-briefing';
import { insertAlbum, importDemo, holdStart } from './helpers/project';

const notes = (counts: number[]): Note[] =>
  counts.flatMap((count, lane) =>
    Array.from({ length: count }, (_, index): Note => ({
      id: `${lane}-${index}`,
      lane: (['squat', 'calf_raise', 'punch', 'step', 'side_crunch'] as const)[lane],
      direction: lane === 0 ? 'down' : lane === 1 ? 'up' : 'left',
      kind: 'tap',
      timeMs: 4000 + lane * 1000 + index * 100,
    })),
  );

async function fixture(page: Page) {
  await page.goto('/');
  const dance = {
    ...blankChart('爽快夺回 Sunlight'),
    artist: 'うたたP',
    danceDifficulty: 7,
    playRange: { startMs: 3000, endMs: 18000 },
    videoOffsetMs: 120,
    tempoSegments: [{ id: 'tempo', anchorMs: 0, bpm: 148, meter: '4/4' as const }],
    notes: notes([1, 0, 2, 7, 0]),
  };
  await importDemo(page, dance);
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('12500');
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.seeking))
    .toBe(false);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByRole('button', { name: '用当前视频画面', exact: true }).click();
  const cover = await page.locator('.draft-cover img').getAttribute('src');
  await page.getByLabel('所属专辑').selectOption('anime');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const fitness = {
    ...dance,
    title: '爽快夺回 Sunlight / Fitness',
    chartType: 'fitness' as const,
    intensity: 'medium' as const,
    tempoSegments: [{ id: 'tempo', anchorMs: 0, bpm: 120, meter: '4/4' as const }],
    notes: notes([5, 0, 3, 2, 0]),
  };
  await page.evaluate(
    (chart) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('waifu-fit-player-library');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result,
            tx = db.transaction('songs', 'readwrite'),
            store = tx.objectStore('songs');
          const rows = store.getAll();
          rows.onsuccess = () => {
            const song = rows.result[0];
            song.released.fitness = {
              ...song.released.dance,
              chart: { ...chart, songId: song.id, videoHint: song.released.dance.chart.videoHint },
            };
            store.put(song);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    fitness,
  );
  await page.reload();
  await page.getByRole('button', { name: /音游模式/ }).click();
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  return { dance, fitness, cover };
}

const chargeValue = (page: Page) =>
  page
    .locator('.start-briefing')
    .evaluate((root) => Number(getComputedStyle(root).getPropertyValue('--start-charge')));

test('briefing fades as one layer without moving covers or flashing back on cancel', async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => {
    const state = { running: true, frames: [] as { x: number; y: number }[] };
    Object.assign(window, { libraryArrowMotion: state });
    const sample = () => {
      const arrow = document.querySelector('.menu-back');
      if (arrow && document.querySelector('.menu-curtain')) {
        const { x, y } = arrow.getBoundingClientRect();
        state.frames.push({ x, y });
      }
      if (state.running) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  // Exercise the shared header both ways, including while its page is entering/leaving.
  await page.locator('.menu-back').click();
  await expect(page.locator('.music-menu.albums')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const arrowFrames = await page.evaluate(() => {
    const state = (
      window as unknown as {
        libraryArrowMotion: { running: boolean; frames: { x: number; y: number }[] };
      }
    ).libraryArrowMotion;
    state.running = false;
    return state.frames;
  });
  expect(arrowFrames.length).toBeGreaterThan(8);
  for (const frame of arrowFrames) {
    expect(Math.abs(frame.x - 1920 * 0.05)).toBeLessThanOrEqual(12.1);
    expect(frame.y).toBeCloseTo(28, 0);
  }
  await page.evaluate(() => {
    const samples: number[] = [];
    const exits: number[][] = [];
    Object.assign(window, {
      briefingExitSamples: samples,
      briefingBackdropFrames: exits,
    });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.matches('.start-briefing, .start-briefing-backdrop')) {
        const element = this;
        const shadeFrames: number[] = [];
        const sampleExit = () => {
          if (animation.id !== 'briefing-close' || !element.isConnected) return;
          if (!shadeFrames.length) exits.push(shadeFrames);
          shadeFrames.push(Number(getComputedStyle(element).opacity));
          if (animation.playState === 'running') requestAnimationFrame(sampleExit);
        };
        requestAnimationFrame(sampleExit);
        void animation.finished
          .then(() =>
            queueMicrotask(() => {
              if (animation.id === 'briefing-close' && element.isConnected)
                samples.push(Number(getComputedStyle(element).opacity));
            }),
          )
          .catch(() => {});
      }
      return animation;
    };
  });
  for (const action of ['Escape', 'Backspace', 'mouse', 'early']) {
    await page.locator('.record-select').click();
    const briefing = page.locator('.start-briefing');
    if (action !== 'early') await expect(briefing).toHaveAttribute('data-motion', 'ready');
    await expect(page.locator('.briefing-cover-flight')).toHaveCount(0);
    await expect(briefing.locator('.briefing-cover > img')).toHaveCSS('visibility', 'visible');
    await expect(briefing.locator('.briefing-cover-grain')).toHaveCSS('opacity', '0.68');
    await expect(page.locator('.record-jacket > img')).toHaveCSS('visibility', 'visible');
    if (action === 'mouse') await page.locator('.briefing-cancel').click();
    else await page.keyboard.press(action === 'early' ? 'Escape' : action);
    await expect(briefing).toHaveCount(0);
  }
  const samples = await page.evaluate(
    () => (window as unknown as { briefingExitSamples: number[] }).briefingExitSamples,
  );
  expect(samples).toEqual([0, 0, 0, 0]);
  const backdropFrames = await page.evaluate(
    () => (window as unknown as { briefingBackdropFrames: number[][] }).briefingBackdropFrames,
  );
  expect(backdropFrames).toHaveLength(4);
  for (const frames of backdropFrames) {
    expect(frames.some((opacity) => opacity > 0.05 && opacity < 0.95)).toBe(true);
    for (let index = 1; index < frames.length; index++)
      expect(frames[index]).toBeLessThanOrEqual(frames[index - 1]);
  }
  await page.locator('.record-select').click();
  await expect(page.locator('.start-briefing')).toHaveAttribute('data-motion', 'ready');
  await page.locator('.start-briefing').evaluate((element) => {
    const fade = element.getAnimations().find((animation) => animation.id === 'briefing-enter')!;
    fade.pause();
    fade.currentTime = Number(fade.effect!.getTiming().duration) * 0.35;
  });
  const partialOpacity = await page
    .locator('.start-briefing')
    .evaluate((element) => Number(getComputedStyle(element).opacity));
  expect(partialOpacity).toBeGreaterThan(0.2);
  expect(partialOpacity).toBeLessThan(0.8);
  await page.screenshot({ path: 'artifacts/start-briefing-motion-1080p.png' });
  await page.locator('.start-briefing').evaluate((element) =>
    element
      .getAnimations()
      .find((animation) => animation.id === 'briefing-enter')!
      .finish(),
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('.start-briefing')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.record-select').click();
  await expect(page.locator('.start-briefing')).toHaveAttribute('data-motion', 'ready');
  await page.keyboard.press('Escape');
  await expect(page.locator('.start-briefing')).toHaveCount(0);
});

test('reference layout uses real cover, credits, range statistics and synchronized chart types', async ({
  page,
}) => {
  const { dance, fitness, cover } = await fixture(page);
  await page.locator('.record-select').click();
  const briefing = page.locator('.start-briefing');
  await expect(briefing).toBeVisible();
  await expect(briefing.locator('.start-charge .cover-trace rect').first()).toHaveCSS(
    'animation-name',
    'cover-orbit',
  );
  await expect(briefing.getByRole('heading')).toHaveText(dance.title);
  await expect(briefing.locator('.briefing-cover img')).toHaveAttribute('src', cover!);
  await expect(briefing.locator('.briefing-artist')).toContainText('うたたP');
  await expect(briefing.locator('.briefing-rating')).toHaveText('LV. 7');
  for (const [selector, property] of [
    ['.start-charge-content em', 'color'],
    ['.briefing-song-heading > svg', 'color'],
    ['.start-charge-ring-fill', 'stroke'],
    ['.start-charge-track .start-charge-fill > i:first-child', 'background-color'],
    ['.start-charge-track .start-charge-fill > i:last-child', 'background-color'],
  ])
    await expect(briefing.locator(selector)).toHaveCSS(property, 'rgb(246, 78, 147)');
  await expect(briefing.getByRole('button', { name: 'DANCE', exact: true })).toHaveCSS(
    'background-color',
    'rgb(246, 78, 147)',
  );
  await expect(briefing.locator('.briefing-metrics')).toContainText('148');
  await expect(briefing.locator('.briefing-metrics')).toContainText('00:15');
  await expect(briefing.locator('.briefing-burn')).toContainText(
    createCalorieIndex(dance.notes).at(-1)!.kcal.toFixed(1),
  );
  await expect(briefing.locator('.briefing-move[data-prominent="true"]')).toHaveCount(2);
  const expectedMoves = [
    ['punch', 'ARMS', '手臂'],
    ['step', 'STEP', '踏步'],
    ['side_crunch', 'SIDE CRUNCH', '侧腹'],
    ['squat', 'SQUAT', '深蹲'],
    ['calf_raise', 'CALF RAISE', '提踵'],
  ];
  await expect(briefing.locator('.briefing-move > strong')).toHaveText(
    expectedMoves.map(([, english]) => english),
  );
  for (const [lane, english, chinese] of expectedMoves) {
    const move = briefing.locator(`.briefing-move[data-lane="${lane}"]`);
    await expect(move.locator('strong')).toHaveText(english);
    await expect(move.locator(':scope > span')).toHaveText(chinese);
  }
  await expect(briefing.locator('[data-lane="step"]')).toHaveAttribute('aria-label', 'STEP 70%');
  await expect(briefing.locator('[data-lane="calf_raise"]')).toHaveAttribute('data-empty', 'true');
  expect(await briefing.locator('.briefing-move-icon svg').count()).toBe(5);
  await expect(briefing.locator('[data-lane="step"] .shoe-print')).toHaveCSS(
    'fill',
    'rgb(36, 35, 41)',
  );
  await page.screenshot({ path: 'artifacts/start-briefing-dance-1080p.png' });
  await page.keyboard.press('ArrowLeft');
  await expect(briefing.getByRole('button', { name: 'FITNESS', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(briefing.getByRole('button', { name: 'FITNESS', exact: true })).toHaveCSS(
    'background-color',
    'rgb(53, 201, 219)',
  );
  await expect(briefing.getByRole('button', { name: 'DANCE', exact: true })).toHaveCSS(
    'background-color',
    'rgb(233, 232, 229)',
  );
  await expect(briefing.getByRole('heading')).toHaveText(fitness.title);
  await expect(briefing.locator('.briefing-rating')).toHaveText('INT. MEDIUM');
  for (const [selector, property] of [
    ['.start-charge-content em', 'color'],
    ['.briefing-song-heading > svg', 'color'],
    ['.start-charge-ring-fill', 'stroke'],
    ['.start-charge-track .start-charge-fill > i:first-child', 'background-color'],
    ['.start-charge-track .start-charge-fill > i:last-child', 'background-color'],
  ])
    await expect(briefing.locator(selector)).toHaveCSS(property, 'rgb(53, 201, 219)');
  await expect(briefing.locator('.briefing-metrics')).toContainText('120');
  await expect(briefing.locator('.briefing-burn')).toContainText(
    createCalorieIndex(fitness.notes).at(-1)!.kcal.toFixed(1),
  );
  await expect(briefing.locator('.briefing-move[data-prominent="true"]')).toHaveCount(3);
  for (const [lane, english, chinese] of expectedMoves) {
    const move = briefing.locator(`.briefing-move[data-lane="${lane}"]`);
    await expect(move.locator('strong')).toHaveText(english);
    await expect(move.locator(':scope > span')).toHaveText(chinese);
  }
  await expect(briefing.locator('[data-lane="squat"]')).toHaveAttribute('aria-label', 'SQUAT 50%');
  await expect(briefing.locator('[data-lane="step"]')).toHaveAttribute('aria-label', 'STEP 20%');
  await expect(briefing).not.toContainText(/HARD|NORMAL/);
  await page.screenshot({ path: 'artifacts/start-briefing-fitness-1080p.png' });
  const box = (await briefing.boundingBox())!;
  expect(box.x).toBeGreaterThan(0);
  expect(box.width).toBeCloseTo(1740 * 0.9, -1);
  expect(box.y).toBeGreaterThan(0);
  expect(box.x + box.width).toBeLessThan(1920);
  expect(box.y + box.height).toBeLessThan(1080);
  await page.keyboard.press('Backspace');
  await expect(briefing).toHaveCount(0);
  await expect(page.locator('.selection-title h2')).toHaveText(fitness.title);
  await expect(
    page.locator('.chart-type-choice').getByRole('button', { name: 'FITNESS', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('charge eases out without changing the hold duration; mouse and keyboard share cancellable charge and completion sounds', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const sounds: { name: string; at: number; volume: number }[] = [];
    const played: string[] = [];
    const audio = new Map<string, HTMLMediaElement>();
    Object.assign(window, { briefingSounds: sounds, briefingPlayed: played, briefingAudio: audio });
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const name = this.dataset.menuSound;
      if (name) {
        sounds.push({ name, at: performance.now(), volume: this.volume });
        audio.set(name, this);
      }
      const result = original.call(this);
      if (name) void result.then(() => played.push(name)).catch(() => {});
      return result;
    };
  });
  await fixture(page);
  await page.locator('.record-select').click();
  const button = page.getByRole('button', { name: '按住 Enter 开始游戏', exact: true });
  const idleArrowColor = await page
    .locator('.start-charge-arrow > svg:last-child')
    .evaluate((arrow) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = getComputedStyle(arrow).color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    });
  expect(idleArrowColor).toEqual([98, 97, 106]);
  await button.hover();
  await page.mouse.down();
  await expect.poll(() => chargeValue(page), { intervals: [16] }).toBeGreaterThan(0.3);
  await page.mouse.up();
  const chargePaused = () =>
    page.evaluate(
      () =>
        (window as unknown as { briefingAudio: Map<string, HTMLMediaElement> }).briefingAudio.get(
          'charge',
        )?.paused,
    );
  await expect.poll(chargePaused).toBe(true);
  await expect.poll(() => chargeValue(page)).toBe(0);
  await page.keyboard.down('Enter');
  await expect.poll(() => chargeValue(page), { intervals: [16] }).toBeGreaterThan(0.25);
  await page.keyboard.up('Enter');
  await expect.poll(() => chargeValue(page)).toBe(0);
  // Hold only the completion handoff so the real completed state can be inspected.
  await page.evaluate((completionMs) => {
    const original = window.setTimeout;
    window.setTimeout = function (handler: TimerHandler, timeout?: number, ...args: unknown[]) {
      if (timeout === completionMs && document.querySelector('.start-briefing')) {
        window.setTimeout = original;
        const id = original(() => {}, 60000);
        Object.assign(window, {
          finishBriefingFeedback: () => {
            clearTimeout(id);
            if (typeof handler === 'function') handler(...args);
          },
        });
        return id;
      }
      return original(handler, timeout, ...args);
    } as typeof window.setTimeout;
  }, START_BRIEFING.completionMs);
  await page.keyboard.down('Enter');
  await page.waitForTimeout(500);
  expect(await chargeValue(page)).toBeGreaterThan(0.75); // Linear fill would still be below 0.5.
  await expect(page.locator('.start-briefing')).toHaveAttribute('data-state', 'holding');
  await page.waitForFunction(
    () => document.querySelector('.start-briefing')?.getAttribute('data-state') === 'complete',
  );
  await page.keyboard.up('Enter');
  const result = await page.evaluate(() => {
    const state = window as unknown as {
      briefingSounds: { name: string; at: number; volume: number }[];
      briefingPlayed: string[];
      briefingAudio: Map<string, HTMLMediaElement>;
    };
    return {
      sounds: state.briefingSounds.filter((event) =>
        ['charge', 'release', 'charged'].includes(event.name),
      ),
      played: state.briefingPlayed,
      paused: state.briefingAudio.get('charge')?.paused,
    };
  });
  expect(result.sounds.map((sound) => sound.name)).toEqual([
    'charge',
    'release',
    'charge',
    'release',
    'charge',
    'charged',
  ]);
  const elapsed =
    result.sounds.at(-1)!.at - result.sounds.filter((sound) => sound.name === 'charge').at(-1)!.at;
  expect(elapsed).toBeGreaterThanOrEqual(START_BRIEFING.holdMs - 20);
  expect(elapsed).toBeLessThan(START_BRIEFING.holdMs + 200);
  expect(result.sounds.every((sound) => sound.volume === 0.5)).toBe(true);
  expect(result.paused).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { briefingPlayed: string[] }).briefingPlayed),
    )
    .toContain('charged');
  expect(result.played).toContain('charge');
  expect(result.played).toContain('release');
  const briefing = page.locator('.start-briefing');
  await expect(button).toHaveCSS('animation-name', 'none');
  await expect(briefing).toHaveCSS('animation-name', 'none');
  await briefing.evaluate((root, completionMs) => {
    root.getAnimations({ subtree: true }).forEach((animation) => {
      if (animation instanceof CSSAnimation && animation.animationName.startsWith('start-')) {
        animation.pause();
        animation.currentTime = completionMs * 0.45;
      }
    });
  }, START_BRIEFING.completionMs);
  expect(
    await briefing
      .locator('.start-charge-backlight')
      .evaluate((node) => getComputedStyle(node).boxShadow),
  ).toContain('50px');
  await expect(briefing.locator('.start-charge-content > strong')).toHaveText('LET’S GO!');
  expect(
    await button.evaluate((node) => {
      // The component retains its dark face while its backlight turns on.
      const context = document.createElement('canvas').getContext('2d')!;
      context.fillStyle = getComputedStyle(node).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    }),
  ).toEqual([36, 35, 41]);
  expect(
    await briefing
      .locator('.start-charge-arrow > svg:last-child')
      .evaluate((node) => getComputedStyle(node).filter),
  ).toContain('12px');
  await expect(briefing.locator('.start-charge-arrow')).toHaveCSS(
    'animation-name',
    'start-ring-slide',
  );
  expect(
    await briefing
      .locator('.start-charge-backlight')
      .evaluate((node) => Number(getComputedStyle(node).opacity)),
  ).toBeGreaterThan(0.8);
  const ring = briefing.locator('.start-charge-arrow');
  const positions = [];
  for (const fraction of [0, 0.4, 0.75, 1]) {
    await ring.evaluate((node, time) => {
      node
        .getAnimations()
        .find(
          (animation) =>
            animation instanceof CSSAnimation && animation.animationName === 'start-ring-slide',
        )!.currentTime = time;
    }, START_BRIEFING.completionMs * fraction);
    positions.push((await ring.boundingBox())!);
  }
  expect(positions[1].x).toBeGreaterThan(positions[0].x + 300);
  expect(positions[2].x).toBeCloseTo(positions[3].x, 0);
  for (const position of positions) {
    expect(position.y).toBeCloseTo(positions[0].y, 0);
    expect(position.height).toBeCloseTo(positions[0].height, 0);
    expect(position.width).toBeCloseTo(positions[0].width, 0);
  }
  const panel = (await button.boundingBox())!;
  expect(Math.abs(panel.x + panel.width - positions[3].x - positions[3].width - 25)).toBeLessThan(
    16,
  );
  await page.screenshot({ path: 'artifacts/start-briefing-complete-1080p.png' });
  await page.evaluate(() =>
    (window as unknown as { finishBriefingFeedback: () => void }).finishBriefingFeedback(),
  );
  await expect(page.locator('.game-entrance')).toHaveAttribute('data-phase', 'cover');
});

test('Shift Enter skips charging, completes once and enters the original gameplay opening', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const sounds: string[] = [];
    Object.assign(window, { quickStartSounds: sounds });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.menuSound) sounds.push(this.dataset.menuSound);
      return play.call(this);
    };
  });
  await fixture(page);
  await page.locator('.record-select').click();
  const briefing = page.locator('.start-briefing');
  await expect(briefing.locator('.start-charge-shortcut')).toHaveText(
    'SHIFT + ENTER · QUICK START',
  );
  await page.keyboard.press('Shift+Enter');
  await expect(briefing).toHaveAttribute('data-state', 'complete');
  expect(await chargeValue(page)).toBe(1);
  await page.keyboard.press('Shift+Enter');
  const sounds = await page.evaluate(
    () => (window as unknown as { quickStartSounds: string[] }).quickStartSounds,
  );
  expect(sounds.filter((name) => name === 'charged')).toHaveLength(1);
  expect(sounds.filter((name) => name === 'charge')).toHaveLength(0);
  await expect(page.locator('.game-entrance')).toBeVisible();
  await expect(page.locator('.ready-countdown')).toBeVisible();
});

test('fresh Enter hold connects a dedicated black entrance, then powers the room and starts the original countdown', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fixture(page);
  await page.mouse.move(5, 5);
  await page.keyboard.down('Enter');
  const briefing = page.locator('.start-briefing');
  await expect(briefing).toBeVisible();
  await page.keyboard.down('Enter'); // Browser key repeat from the key which opened the briefing.
  await page.waitForTimeout(START_BRIEFING.holdMs + 50);
  expect(await chargeValue(page)).toBe(0);
  await page.keyboard.up('Enter');
  await page.keyboard.down('Enter');
  await expect.poll(() => chargeValue(page)).toBeGreaterThan(0.25);
  await page.keyboard.up('Enter');
  await expect.poll(() => chargeValue(page)).toBe(0);
  await expect(briefing).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('.ready-countdown')).toHaveCount(0);
  const pausedEntrance = await page.addStyleTag({
    content: '.game-entrance { animation-play-state: paused !important; }',
  });
  await page.keyboard.down('Enter');
  await page.waitForFunction(
    () => document.querySelector('.start-briefing')?.getAttribute('data-state') === 'complete',
  );
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  const entrance = page.locator('.game-entrance');
  await expect(entrance).toHaveAttribute('data-phase', 'cover');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await entrance.evaluate((element) => {
    const animation = element.getAnimations()[0];
    animation.currentTime = Number(animation.effect!.getComputedTiming().duration) / 2;
  });
  const opacity = Number(await entrance.evaluate((element) => getComputedStyle(element).opacity));
  expect(opacity).toBeGreaterThan(0.2);
  expect(opacity).toBeLessThan(0.8);
  await expect(page.locator('.practice-app')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/game-entrance-darkening-1080p.png' });
  await entrance.evaluate((element) => element.getAnimations()[0].finish());
  await expect(entrance).toHaveAttribute('data-phase', 'reveal');
  await expect(entrance).toHaveCSS('opacity', '1');
  const countdown = page.getByRole('dialog', { name: '开始倒计时', exact: true });
  await expect(countdown).toBeVisible();
  await expect(countdown).toHaveAttribute('data-phase', 'waiting');
  await expect(page.locator('.practice')).toHaveAttribute('data-ready', 'waiting');
  await expect(page.locator('.ready-room-focus')).toHaveCSS('backdrop-filter', 'blur(5px)');
  await entrance.evaluate((element) => {
    const animation = element.getAnimations()[0];
    const timing = animation.effect!.getComputedTiming();
    animation.currentTime = Number(timing.delay) + Number(timing.duration) / 2;
  });
  await page.screenshot({ path: 'artifacts/game-entrance-room-reveal-1080p.png' });
  await expect(countdown).toHaveAttribute('data-phase', 'waiting');
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(
    true,
  );
  await entrance.evaluate((element) => element.getAnimations()[0].finish());
  await expect(entrance).toHaveCount(0);
  await pausedEntrance.evaluate((element) => (element as Element).remove());
  await expect(countdown.locator('.ready-progress-fill')).toHaveCSS(
    'background-color',
    'rgb(246, 78, 147)',
  );
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(countdown.getByRole('timer')).toHaveText('3');
  await expect(page.locator('.ready-room-focus')).toHaveCSS('backdrop-filter', 'none');
  expect(
    await page
      .locator('video')
      .evaluate((video: HTMLVideoElement) => [video.currentTime, video.paused]),
  ).toEqual([3, true]);
  await expect(countdown).toHaveCount(0);
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(false);
  await expect(page.locator('.practice-chart-type')).toHaveText('DANCELv. 7');
  expect(errors).toEqual([]);
});

test('pointer capture, blur, mode changes and cancel clear charge; mouse hold also starts with reduced motion', async ({
  page,
}) => {
  await fixture(page);
  await page.locator('.record-select').click();
  const briefing = page.locator('.start-briefing');
  const button = briefing.getByRole('button', { name: '按住 Enter 开始游戏', exact: true });
  await button.click();
  await expect.poll(() => chargeValue(page)).toBe(0);
  await button.hover();
  await page.mouse.down();
  await expect.poll(() => chargeValue(page), { intervals: [16] }).toBeGreaterThan(0.4);
  await page.screenshot({ path: 'artifacts/start-briefing-charge-1080p.png' });
  await page.mouse.move(10, 10);
  await page.mouse.up();
  await expect.poll(() => chargeValue(page)).toBe(0);
  await page.keyboard.down('Enter');
  await expect.poll(() => chargeValue(page)).toBeGreaterThan(0.2);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('Enter');
  await expect.poll(() => chargeValue(page)).toBe(0);
  await page.keyboard.down('Enter');
  await expect.poll(() => chargeValue(page)).toBeGreaterThan(0.2);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Enter');
  expect(await chargeValue(page)).toBe(0);
  await expect(briefing.getByRole('button', { name: 'FITNESS', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.down('Enter');
  await expect.poll(() => chargeValue(page)).toBeGreaterThan(0.2);
  await page.keyboard.press('Escape');
  await page.keyboard.up('Enter');
  await expect(briefing).toHaveCount(0);
  await page.waitForTimeout(START_BRIEFING.holdMs + START_BRIEFING.completionMs);
  await expect(page.locator('.ready-countdown')).toHaveCount(0);
  await page.locator('.record-select').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(briefing.locator('.start-charge .cover-trace rect').first()).toHaveCSS(
    'animation-name',
    'none',
  );
  await holdStart(page);
  await expect(page.getByRole('dialog', { name: '开始倒计时', exact: true })).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.game-entrance')).toHaveCount(0);
});
