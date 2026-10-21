import { putSongs, readSongs } from './helpers/library';
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

async function fixture(page: Page, neighbors = false) {
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
  const song = (await readSongs(page))[0];
  song.released.fitness = {
    ...song.released.dance!,
    chart: { ...fitness, songId: song.id, videoHint: song.released.dance!.chart.videoHint },
  };
  const seeded = [song];
  if (neighbors)
    for (const offset of [-1, 1]) {
      const copy = structuredClone(song);
      copy.id = crypto.randomUUID();
      for (const edition of [...Object.values(copy.drafts), ...Object.values(copy.released)]) {
        edition.chart.songId = copy.id;
        edition.updatedAt += offset * 1000;
      }
      seeded.push(copy);
    }
  await putSongs(page, seeded);
  await page.reload();
  await page.getByRole('button', { name: /音游模式/ }).click();
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  return { dance, fitness, cover };
}

const chargeValue = (page: Page) =>
  page
    .locator('.start-charge')
    .evaluate((root) => Number(getComputedStyle(root).getPropertyValue('--start-charge')));

test('poster reveals the original textured panel, restores the carousel and survives interrupted input', async ({
  page,
}) => {
  let releaseTexture!: () => void;
  const textureGate = new Promise<void>((resolve) => (releaseTexture = resolve));
  await page.route('**/art/cover-paper-grain.svg', async (route) => {
    await textureGate;
    await route.continue();
  });
  await fixture(page, true);
  await page.mouse.move(5, 5);
  await page.keyboard.press('ArrowRight');
  const selected = page.locator('.record-card').nth(1);
  await expect(selected).toHaveAttribute('aria-current', 'true');
  await expect
    .poll(() =>
      selected.evaluate((card: HTMLElement) => {
        const shelf = card.parentElement!;
        return Math.abs(
          card.offsetLeft + card.offsetWidth / 2 - shelf.scrollLeft - shelf.clientWidth / 2,
        );
      }),
    )
    .toBeLessThan(1);
  const originalOffset = await page.locator('.song-carousel').evaluate((node) => node.scrollLeft);
  const selectedId = await selected.getAttribute('data-id');
  await page.evaluate(() => {
    const state = { freeze: true, animations: [] as Animation[], exitOpacity: [] as number[] };
    Object.assign(window, { posterTest: state });
    const play = Animation.prototype.play;
    Animation.prototype.play = function () {
      if (!state.freeze || !state.animations.includes(this)) play.call(this);
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (
        state.freeze &&
        this.matches('.start-briefing, .start-briefing *, .briefing-shade, .record-card')
      ) {
        animation.pause();
        animation.currentTime = 0;
        state.animations.push(animation);
      }
      if (this.matches('.start-briefing') && this.getAttribute('data-motion') === 'closing') {
        const element = this;
        const sample = () => {
          if (!element.isConnected) return;
          state.exitOpacity.push(Number(getComputedStyle(element).opacity));
          if (animation.playState === 'running') requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }
      return animation;
    };
  });
  await selected.locator('.record-select').click();
  const briefing = page.locator('.start-briefing');
  await expect(briefing).toHaveAttribute('data-motion', 'opening');
  expect(
    await briefing
      .locator('.briefing-board')
      .evaluate(
        (node) => node.getAnimations().find((a) => a.id === 'briefing-poster-mask')!.currentTime,
      ),
  ).toBe(0);
  await expect(briefing).not.toHaveAttribute('data-material', 'ready');
  releaseTexture();
  await expect(briefing).toHaveAttribute('data-material', 'ready');
  await expect(page.locator('.start-briefing-backdrop')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await expect(page.locator('.start-briefing-backdrop')).toHaveCSS('backdrop-filter', 'none');
  const setTime = (time: number) =>
    page.evaluate((time) => {
      (
        window as unknown as { posterTest: { animations: Animation[] } }
      ).posterTest.animations.forEach((a) => (a.currentTime = time));
    }, time);
  const panelPose = () =>
    briefing.evaluate((node) => ({
      x: node.getBoundingClientRect().x,
      y: node.getBoundingClientRect().y,
      width: node.getBoundingClientRect().width,
      geometry: Array.from(node.querySelectorAll('.briefing-geometry > *'), (shape) => {
        const box = shape.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }),
    }));
  const revealedWidth = () =>
    briefing.locator('.briefing-board').evaluate((node) => {
      const points = getComputedStyle(node)
        .clipPath.match(/-?[\d.]+(?=%)/g)!
        .map(Number);
      return points[2] - points[0];
    });
  const grain = briefing.locator('.briefing-cover-grain');
  const grainTexture = await grain.evaluate((node) => getComputedStyle(node).backgroundImage);
  await expect(grain).toHaveCSS('opacity', '0.68');
  await expect(briefing.locator('.briefing-cover-ink')).toHaveCSS('opacity', '0.22');
  await expect(briefing.locator('.briefing-cover-fibers')).toHaveCSS('opacity', '0.38');
  await expect(page.locator('.briefing-cover-flight')).toHaveCount(0);
  await setTime(100);
  await page.screenshot({ path: 'artifacts/poster-reveal-100ms.png' });
  await setTime(220);
  const earlyPose = await panelPose();
  const earlyReveal = await revealedWidth();
  expect(earlyReveal).toBeLessThan(65); // The unfolding must still be visible, not mostly finished.
  expect(
    await briefing.locator('.briefing-board').evaluate((node) => getComputedStyle(node).clipPath),
  ).toContain('polygon');
  await expect(grain).toHaveCSS('opacity', '0.68');
  expect(await grain.evaluate((node) => getComputedStyle(node).backgroundImage)).toBe(grainTexture);
  await expect(briefing.locator('.start-charge')).toHaveCSS('opacity', '0');
  await expect(page.locator('.record-card:not([aria-current="true"])').first()).toHaveCSS(
    'opacity',
    '0',
  );
  await page.screenshot({ path: 'artifacts/poster-reveal-220ms.png' });
  await page.keyboard.down('Enter'); // A fresh press during opening must not be carried into charge.
  expect(await chargeValue(page)).toBe(0);
  await page.keyboard.press('ArrowLeft');
  await expect(briefing).toHaveAttribute('data-chart-type', 'dance');
  await setTime(400);
  expect(await revealedWidth()).toBeGreaterThan(earlyReveal + 25);
  expect((await panelPose()).width).toBeCloseTo(earlyPose.width, 2);
  await page.screenshot({ path: 'artifacts/poster-reveal-400ms.png' });
  await setTime(500);
  await page.screenshot({ path: 'artifacts/poster-reveal-500ms.png' });
  await setTime(START_BRIEFING.openMs - 1);
  const expandedPose = await panelPose();
  expect(expandedPose.width).toBeCloseTo(earlyPose.width, 2);
  await page.screenshot({ path: 'artifacts/poster-reveal-expanded-1080p.png' });
  await page.evaluate(() => {
    const state = (
      window as unknown as { posterTest: { freeze: boolean; animations: Animation[] } }
    ).posterTest;
    state.freeze = false;
    state.animations.forEach((animation) => animation.finish());
  });
  await expect(briefing).toHaveAttribute('data-motion', 'ready');
  await page.waitForTimeout(100);
  expect(await chargeValue(page)).toBe(0);
  await page.keyboard.up('Enter');
  await expect(briefing).toHaveCSS('transform', 'none');
  await expect(briefing).toHaveCSS('scale', '0.9');
  const restingPose = await panelPose();
  expect(restingPose.x).toBeCloseTo(expandedPose.x, 2);
  expect(restingPose.y).toBeCloseTo(expandedPose.y, 2);
  expect(restingPose.width).toBeCloseTo(expandedPose.width, 2);
  restingPose.geometry.forEach((shape, index) => {
    expect(shape.x).toBeCloseTo(expandedPose.geometry[index].x, 2);
    expect(shape.y).toBeCloseTo(expandedPose.geometry[index].y, 2);
    expect(shape.width).toBeCloseTo(expandedPose.geometry[index].width, 2);
    expect(shape.height).toBeCloseTo(expandedPose.geometry[index].height, 2);
  });
  await expect(briefing.locator('.briefing-board')).toHaveCSS('clip-path', 'none');
  await expect(briefing.locator('.start-charge')).toHaveCSS('translate', 'none');
  expect(
    await briefing.evaluate(
      (node) => node.getAnimations().filter((a) => a.id.startsWith('briefing-')).length,
    ),
  ).toBe(0);
  await page.screenshot({ path: 'artifacts/poster-reveal-ready-1080p.png' });
  await page.keyboard.press('Escape');
  await expect(briefing).toHaveCount(0);
  await expect(page.locator('.record-card[aria-current="true"]')).toHaveAttribute(
    'data-id',
    selectedId!,
  );
  expect(
    Math.abs(
      (await page.locator('.song-carousel').evaluate((node) => node.scrollLeft)) - originalOffset,
    ),
  ).toBeLessThan(1);
  expect(
    await page
      .locator('.record-card')
      .evaluateAll(
        (cards) =>
          cards.flatMap((card) => card.getAnimations().filter((a) => a.id.startsWith('briefing-')))
            .length,
      ),
  ).toBe(0);
  const exits = await page.evaluate(
    () => (window as unknown as { posterTest: { exitOpacity: number[] } }).posterTest.exitOpacity,
  );
  expect(exits.some((opacity) => opacity > 0 && opacity < 1)).toBe(true);
  for (let i = 1; i < exits.length; i++) expect(exits[i]).toBeLessThanOrEqual(exits[i - 1]);
  for (const action of ['Escape', 'Backspace', 'mouse', 'early', 'early']) {
    // Use a real pointer. Locator.click's automatic CDP scroll can re-snap the
    // horizontal carousel before the actual click, changing the precondition.
    const hit = (await selected.locator('.record-select').boundingBox())!;
    await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2);
    if (action !== 'early') await expect(briefing).toHaveAttribute('data-motion', 'ready');
    if (action === 'mouse') await page.locator('.briefing-cancel').click();
    else await page.keyboard.press(action === 'early' ? 'Escape' : action);
    await page.keyboard.press('Enter'); // Input during closing must not reopen or start.
    await page.keyboard.press('Escape');
    await expect(briefing).toHaveCount(0);
    await expect(page.locator('.game-entrance')).toHaveCount(0);
    await expect(page.locator('.record-card[aria-current="true"]')).toHaveAttribute(
      'data-id',
      selectedId!,
    );
    expect(
      Math.abs(
        (await page.locator('.song-carousel').evaluate((node) => node.scrollLeft)) - originalOffset,
      ),
    ).toBeLessThan(1);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await selected.locator('.record-select').click();
  await expect(briefing).toHaveAttribute('data-motion', 'ready');
  await expect(briefing.locator('.briefing-board')).toHaveCSS('clip-path', 'none');
  await page.keyboard.press('Escape');
  await expect(briefing).toHaveCount(0);
});
test('reference layout uses real cover, credits, range statistics and synchronized chart types', async ({
  page,
}) => {
  const { dance, fitness, cover } = await fixture(page);
  await page.locator('.record-select').click();
  const briefing = page.locator('.start-briefing');
  await expect(briefing).toHaveAttribute('data-motion', 'ready');
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
    ['squat', 'SQUAT', '深蹲'],
    ['punch', 'ARMS', '手臂'],
    ['step', 'STEP', '踏步'],
    ['calf_raise', 'CALF RAISE', '提踵'],
    ['side_crunch', 'SIDE CRUNCH', '侧腹'],
  ];
  await expect(briefing.locator('.briefing-move > strong')).toHaveText(
    expectedMoves.map(([, english]) => english),
  );
  for (const [lane, english, chinese] of expectedMoves) {
    const move = briefing.locator(`.briefing-move[data-lane="${lane}"]`);
    await expect(move.locator('strong')).toHaveText(english);
    await expect(move.locator(':scope > span')).toHaveText(chinese);
    const count = dance.notes.filter((note) => note.lane === lane).length;
    await expect(move).toHaveAttribute(
      'aria-label',
      `${english} ${Math.round((count / dance.notes.length) * 100)}%`,
    );
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
  await expect(page.locator('.start-briefing')).toHaveAttribute('data-motion', 'ready');
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
  // Per-frame beat/progress updates belong to the moving control, never the full page/card.
  await expect
    .poll(() =>
      button.evaluate((node) =>
        Number((node as HTMLElement).style.getPropertyValue('--menu-music-beat')),
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => ({
      bodyBeat: document.body.style.getPropertyValue('--menu-music-beat'),
      menuBeat: document
        .querySelector<HTMLElement>('.menu-app')!
        .style.getPropertyValue('--music-beat'),
      cardCharge: document
        .querySelector<HTMLElement>('.start-briefing')!
        .style.getPropertyValue('--start-charge'),
    })),
  ).toEqual({ bodyBeat: '', menuBeat: '', cardCharge: '' });

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
  await expect(briefing).toHaveAttribute('data-motion', 'ready');
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
  await expect(briefing).toHaveAttribute('data-motion', 'ready');
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
