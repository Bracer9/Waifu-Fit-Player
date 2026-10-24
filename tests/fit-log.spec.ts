import { test, expect, type Page } from '@playwright/test';
import { importDemo, insertAlbum, editInStudio } from './helpers/project';
import { readSongs, putSongs } from './helpers/library';
import { blankChart } from '../src/model';
import type { FitLogData } from '../src/fit-log';

const log = async (page: Page): Promise<FitLogData> =>
  (await page.request.get('/__wfp/fit-log')).json();
const trigger = (page: Page) => page.getByRole('button', { name: 'Fit Log 运动记录', exact: true });
async function expectContentInsideCorner(page: Page) {
  const outside = await page.locator('.fit-log-value').evaluateAll((values) => {
    const paint = document.querySelector<SVGPolygonElement>('.fit-log-corner-surface polygon')!;
    const inverse = paint.getScreenCTM()!.inverse();
    return values.some((node) => {
      const { left, right, top, bottom } = node.getBoundingClientRect();
      return [
        [left, top],
        [right, top],
        [left, bottom],
        [right, bottom],
      ].some(([x, y]) => !paint.isPointInFill(new DOMPoint(x, y).matrixTransform(inverse)));
    });
  });
  expect(outside, 'numbers and their icons stay inside the painted blue corner').toBe(false);
}
async function open(page: Page) {
  await trigger(page).hover();
  await expect(page.locator('.fit-log')).toHaveAttribute('data-open');
  await expect(page.locator('.fit-log-panel')).toHaveCSS('opacity', '1');
  await page
    .locator('.fit-log-corner-surface')
    .evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished)));
}
async function close(page: Page) {
  await page.mouse.move(600, 200);
  await expect(page.locator('.fit-log')).not.toHaveAttribute('data-open');
}

test('weekly paper index reads local days, supports hover/keys and clears both corner panels', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const played: number[] = [];
    Object.assign(window, { paperVolumes: played });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.menuSound === 'paper') played.push(this.volume);
      return play.call(this);
    };
  });
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.weekly-notes')).toHaveCount(0);
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.weekly-notes output strong')).toHaveText('00/07');
  await expect(page.locator('.weekly-day[data-active]')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/fit-log/weekly-empty-1920.png' });
  const today = page.locator('.weekly-day[aria-current="date"]');
  await today.click();
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(today).not.toHaveAttribute('data-feedback');
  expect((await log(page)).sessions).toEqual([]);
  expect((await log(page)).checkIns).toHaveLength(1);
  await page.mouse.move(1200, 650);
  await expect(page.locator('.weekly-notes output strong')).toHaveText('01/07');
  await page.screenshot({ path: 'artifacts/fit-log/weekly-stamped-1920.png' });
  await page.reload();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await today.focus();
  await page.keyboard.press('Enter');
  await expect(today).toHaveAttribute('aria-pressed', 'false');
  expect((await log(page)).checkIns).toEqual([]);
  expect((await log(page)).sessions).toEqual([]);
  await page.locator('.menu-back').click();
  await expect(page.locator('.title-menu')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const record = await page.evaluate(() => {
    const dateKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const count = Math.min(3, ((now.getDay() + 6) % 7) + 1);
    const days = Array.from({ length: count }, (_, index) => {
      const day = new Date(now);
      day.setDate(day.getDate() - index);
      return { date: dateKey(day), durationMs: 24 * 60000, estimatedKcal: 3 };
    });
    const before = new Date(now);
    before.setDate(before.getDate() - ((before.getDay() + 6) % 7) - 1);
    days.push({ date: dateKey(before), durationMs: 3600000, estimatedKcal: 10 });
    return {
      id: crypto.randomUUID(),
      songId: 'weekly-test',
      title: 'Weekly local test',
      chartType: 'fitness',
      startedAt: Date.now() - 10 * 86400000,
      updatedAt: Date.now(),
      completed: true,
      days,
    };
  });
  expect(
    (
      await page.request.post('/__wfp/fit-log', { headers: { 'X-WFP-Fit-Log': '1' }, data: record })
    ).ok(),
  ).toBe(true);
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const strip = page.locator('.weekly-notes');
  const count = record.days.length - 1;
  await expect(strip.locator('.weekly-day[data-active]')).toHaveCount(count);
  await expect(strip.locator('output strong')).toHaveText(`${String(count).padStart(2, '0')}/07`);
  const bounds = (await strip.boundingBox())!;
  const card = (await page.locator('.collection-album[data-id="all"]').boundingBox())!;
  expect(Math.abs(bounds.width - card.width)).toBeLessThan(3);
  expect(Math.abs(bounds.x - card.x)).toBeLessThan(3);
  expect(bounds.y + bounds.height).toBeLessThan(card.y);
  expect(card.y - bounds.y - bounds.height).toBeLessThan(40);
  expect(card.y - bounds.y - bounds.height).toBeGreaterThan(8);
  await page.screenshot({ path: 'artifacts/fit-log/weekly-notes-1920.png' });
  const day = strip.locator('.weekly-day[data-active]').first();
  await day.hover();
  await expect(strip.locator('output strong')).toHaveText('24');
  await expect(strip.locator('output > span')).toHaveText('MIN');
  if ((await day.getAttribute('aria-current')) === 'date')
    await expect(day.locator('.weekly-key-face')).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, -1)',
    );
  else await expect(day.locator('i')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 2)');
  await page.mouse.move(1200, 650);
  await expect(strip.locator('output strong')).toHaveText(`${String(count).padStart(2, '0')}/07`);
  const volumes = await page.evaluate(
    () => (window as unknown as { paperVolumes: number[] }).paperVolumes,
  );
  expect(volumes.length).toBeGreaterThan(0);
  expect(volumes.every((volume) => volume > 0 && volume <= 0.24)).toBe(true);
  await page.locator('.collection-album[data-id="all"]').focus();
  await page.keyboard.press('ArrowUp');
  await expect(strip.locator('[aria-current="date"]')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(strip.locator('.weekly-day').first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(strip.locator('.weekly-day').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.collection-album[data-id="all"]')).toBeFocused();
  // Opening the player shifts the index with the shelf, keeping the right clear.
  await page.locator('.collection-album[data-id="all"]').click();
  await expect(page.locator('.album-deck')).toHaveCSS('opacity', '1');
  await page
    .locator('.weekly-notes-slot')
    .evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished)));
  const shifted = (await strip.boundingBox())!,
    player = (await page.locator('.album-deck').boundingBox())!;
  expect(shifted.x + shifted.width).toBeLessThan(player.x);
  await page.screenshot({ path: 'artifacts/fit-log/weekly-player-1920.png' });
  await page.locator('.menu-settings').click();
  await trigger(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.fit-log')).toHaveAttribute('data-open');
  await expect(page.locator('.corner-settings[data-open]')).toBeVisible();
  const left = (await page.locator('.fit-log-panel').boundingBox())!,
    right = (await page.locator('.corner-settings').boundingBox())!;
  const settled = (await strip.boundingBox())!;
  expect(settled.x).toBeGreaterThan(left.x + left.width);
  expect(settled.x + settled.width).toBeLessThan(right.x);
  await page.screenshot({ path: 'artifacts/fit-log/weekly-both-panels-1920.png' });
  await page.setViewportSize({ width: 1650, height: 928 });
  await expect
    .poll(async () => {
      const index = (await strip.boundingBox())!;
      const album = (await page.locator('.collection-album[data-id="all"]').boundingBox())!;
      return Math.abs(index.width - album.width);
    })
    .toBeLessThan(3);
  const small = (await strip.boundingBox())!;
  const smallCard = (await page.locator('.collection-album[data-id="all"]').boundingBox())!;
  expect(Math.abs(small.width - smallCard.width)).toBeLessThan(3);
  expect(small.height).toBeGreaterThanOrEqual(60);
  expect(small.height).toBeLessThanOrEqual(75);
  await page.screenshot({ path: 'artifacts/fit-log/weekly-both-panels-1650.png' });
  await page.getByLabel('音效（SE）音量', { exact: true }).fill('0');
  const beforeMuteHover = await page.evaluate(
    () => (window as unknown as { paperVolumes: number[] }).paperVolumes.length,
  );
  await strip.locator('.weekly-day[data-active]').first().hover();
  await expect(strip.locator('output strong')).toHaveText('24');
  expect(
    await page.evaluate(
      () => (window as unknown as { paperVolumes: number[] }).paperVolumes.length,
    ),
  ).toBe(beforeMuteHover);
  await page.mouse.move(1200, 650);
  await expect(strip.locator('output strong')).toHaveText(`${String(count).padStart(2, '0')}/07`);
  await page.reload();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.play-mode').click();
  await expect(strip.locator('.weekly-day[data-active]')).toHaveCount(count);
  const beforeStamp = (await log(page)).sessions;
  await today.click();
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(today).not.toHaveAttribute('data-feedback');
  await expect(strip.locator('output strong')).toHaveText('CHECKED');
  await today.click();
  await expect(today).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.move(1200, 650);
  await expect(strip.locator('output strong')).toHaveText(`${String(count).padStart(2, '0')}/07`);
  expect((await log(page)).sessions).toEqual(beforeStamp);
  await page.setViewportSize({ width: 2560, height: 1440 });
  const wide = (await strip.boundingBox())!,
    wideCard = (await page.locator('.collection-album[data-id="all"]').boundingBox())!;
  expect(Math.abs(wide.width - wideCard.width)).toBeLessThan(3);
  await page.screenshot({ path: 'artifacts/fit-log/weekly-notes-2560.png' });
  const firstAlbum = page.locator('.collection-album[data-id="all"]');
  const albumBox = (await firstAlbum.boundingBox())!;
  await page.mouse.move(albumBox.x + albumBox.width / 2, albumBox.y + albumBox.height / 2);
  await page.mouse.wheel(0, 120);
  const secondAlbum = page.locator('.collection-album').nth(1);
  await expect(secondAlbum).toHaveAttribute('aria-current', 'true');
  await expect(strip).not.toBeInViewport();
  await secondAlbum.focus();
  await page.keyboard.press('ArrowUp');
  await expect(firstAlbum).toHaveAttribute('aria-current', 'true');
  await expect(strip).toBeInViewport();
});

test('today is a mechanical latching key and confirms only durable saves', async ({ page }) => {
  await page.addInitScript(() => {
    const sounds: { name: string; volume: number }[] = [];
    Object.assign(window, { keySounds: sounds });
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.menuSound?.startsWith('key-'))
        sounds.push({ name: this.dataset.menuSound, volume: this.volume });
      return original.call(this);
    };
  });
  let releaseSave!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let requests = 0;
  let failNext = false;
  await page.route('**/__wfp/fit-log', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests++;
    if (requests === 1) await gate;
    if (failNext) {
      failNext = false;
      return route.fulfill({ status: 503, json: { error: 'Test save unavailable' } });
    }
    return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const today = page.locator('.weekly-day[aria-current="date"]');
  const face = today.locator('.weekly-key-face');
  const glint = () => face.evaluate((node) => getComputedStyle(node, '::before').animationName);
  await expect.poll(glint).toBe('weekly-key-glint');
  await expect(face).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)');
  // Pause at the middle of the sheen to inspect its actual size and confinement to the cap.
  await face.evaluate((node) => {
    const animation = node
      .getAnimations({ subtree: true })
      .find((a) => a instanceof CSSAnimation && a.animationName === 'weekly-key-glint')!;
    animation.pause();
    animation.currentTime = 2100;
  });
  await page.screenshot({ path: 'artifacts/fit-log/weekly-key-glint.png' });
  await today.hover();
  await expect.poll(glint).toBe('none');
  await expect(face).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -1)');
  await page.screenshot({ path: 'artifacts/fit-log/weekly-key-ready.png' });
  await page.mouse.down();
  await expect(face).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 3)');
  await page.screenshot({ path: 'artifacts/fit-log/weekly-key-pressed.png' });
  await page.mouse.up();
  await expect(today).toHaveAttribute('data-feedback', 'saving');
  await expect(today).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.weekly-notes output strong')).not.toHaveText('CHECKED');
  await today.focus();
  await page.keyboard.press('Enter');
  expect(requests).toBe(1);
  releaseSave();
  await expect(today).toHaveAttribute('data-feedback', 'engage');
  await expect(page.locator('.weekly-notes output strong')).toHaveText('CHECKED');
  await expect(page.locator('.weekly-notes output > span')).toHaveText('TODAY');
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(today).not.toHaveAttribute('data-feedback');
  await page.mouse.move(1200, 650);
  await page.locator('.collection-album[aria-current="true"]').focus();
  await expect.poll(glint).toBe('none');
  await page.screenshot({ path: 'artifacts/fit-log/weekly-key-latched.png' });
  const confirmationFits = await page
    .locator('.weekly-notes output strong')
    .evaluate(
      (node) =>
        node.getBoundingClientRect().width <= node.parentElement!.getBoundingClientRect().width,
    );
  expect(confirmationFits).toBe(true);
  await expect(page.locator('.weekly-notes output strong')).toHaveText('01/07');
  expect((await log(page)).sessions).toEqual([]);
  expect((await log(page)).checkIns).toHaveLength(1);
  await today.focus();
  await page.keyboard.press('Enter');
  await expect(today).toHaveAttribute('data-feedback', 'release');
  await expect(today).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.weekly-notes output strong')).not.toHaveText('CHECKED');
  await expect(today).not.toHaveAttribute('data-feedback');
  failNext = true;
  await page.keyboard.press('Enter');
  await expect(today).toHaveAttribute('data-feedback', 'failed');
  await expect(today).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.weekly-notes-edition small')).toHaveText('SAVE FAILED · RETRY');
  expect((await log(page)).checkIns).toEqual([]);
  await expect(today).not.toHaveAttribute('data-feedback');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.collection-album[aria-current="true"]').focus();
  await expect.poll(glint).toBe('none');
  await today.focus();
  await page.keyboard.press('Space');
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(today).not.toHaveAttribute('data-feedback');
  await expect(face).toHaveCSS('animation-name', 'none');
  const sounds = await page.evaluate(
    () =>
      (
        window as unknown as {
          keySounds: { name: string; volume: number }[];
        }
      ).keySounds,
  );
  expect(sounds.filter((s) => s.name === 'key-lock')).toHaveLength(2);
  expect(sounds.filter((s) => s.name === 'key-up')).toHaveLength(1);
  expect(sounds.every((s) => s.volume > 0 && s.volume <= 0.55)).toBe(true);
});

test('Fit Log hover, hour layout, streak and shared menu entry use local records', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  const record = await page.evaluate(() => {
    const date = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const days = [0, 1, 2].map((offset) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      return {
        date: date(d),
        durationMs: offset ? 60000 : 80 * 60000,
        estimatedKcal: offset ? 1 : 238,
      };
    });
    return {
      id: crypto.randomUUID(),
      songId: 'test',
      title: 'Local Fit Log',
      chartType: 'fitness',
      startedAt: Date.now() - 3 * 86400000,
      updatedAt: Date.now(),
      completed: true,
      days,
    };
  });
  expect(
    (
      await page.request.post('/__wfp/fit-log', { headers: { 'X-WFP-Fit-Log': '1' }, data: record })
    ).ok(),
  ).toBe(true);
  await open(page);
  await expect(page.locator('.fit-log-metric').first()).toContainText('238');
  await expect(page.locator('.fit-log-time strong')).toHaveText('1h20min');
  await expect(page.locator('.fit-log-metric').last()).toContainText('3');
  const sizes = await page
    .locator('.fit-log-trigger > svg, .menu-settings > svg')
    .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).width));
  expect(sizes).toEqual(['96px', '96px']);
  expect((await trigger(page).boundingBox())!.width).toBe(112);
  await expect(trigger(page)).toHaveCSS('color', 'rgb(255, 249, 244)');
  const pencil = (await trigger(page).boundingBox())!;
  const gear = (await page.locator('.menu-settings').boundingBox())!;
  expect(pencil.x).toBeCloseTo(1920 - gear.x - gear.width, 1);
  expect(1080 - pencil.y - pencil.height).toBeCloseTo(gear.y, 1);
  const time = (await page.locator('.fit-log-time strong').boundingBox())!;
  const panel = (await page.locator('.fit-log-panel').boundingBox())!;
  expect(time.x + time.width).toBeLessThan(panel.x + panel.width);
  await page.screenshot({ path: 'artifacts/fit-log/home-open-1920.png' });
  await expectContentInsideCorner(page);
  await close(page);
  await page
    .locator('.fit-log-corner-surface')
    .evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: 'artifacts/fit-log/home-closed-1920.png' });
  await page.locator('.menu-settings').click();
  await open(page);
  await expect(page.locator('.corner-settings[data-open]')).toBeVisible();
  await page.screenshot({ path: 'artifacts/fit-log/home-settings-open-1920.png' });
  await close(page);
  await page.keyboard.press('Escape');
  await page.locator('.play-mode').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(trigger(page)).toBeFocused();
  await expect(page.locator('.fit-log')).toHaveAttribute('data-open');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.play-mode')).toBeFocused();
  await expect(page.locator('.fit-log')).not.toHaveAttribute('data-open');
  await expect(page.locator('.title-menu')).toBeVisible();
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await expect(trigger(page)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.collection-album[aria-current="true"]')).toBeFocused();
  await open(page);
  await page.screenshot({ path: 'artifacts/fit-log/albums-open-1920.png' });
  await close(page);
  await page.locator('.collection-album[data-id="all"]').click();
  await insertAlbum(page);
  await open(page);
  await page.screenshot({ path: 'artifacts/fit-log/songs-open-1920.png' });
  await close(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  await expect(page.locator('.fit-log-time strong')).toHaveText('1h20min');
  await page.screenshot({ path: 'artifacts/fit-log/songs-open-1280.png' });
  await close(page);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await open(page);
  await page.screenshot({ path: 'artifacts/fit-log/songs-open-2560.png' });
  await expectContentInsideCorner(page);
  await close(page);
  await page.request.post('/__wfp/fit-log', {
    headers: { 'X-WFP-Fit-Log': '1' },
    data: {
      ...record,
      updatedAt: Date.now(),
      days: record.days.map((day, index) => (index ? day : { ...day, durationMs: 1439 * 60000 })),
    },
  });
  await open(page);
  await expect(page.locator('.fit-log-time strong')).toHaveText('23h59min');
  await expectContentInsideCorner(page);
  await close(page);
  const response = await page.request.post('/__wfp/fit-log', { data: record });
  expect(response.status()).toBe(403);
});

test('published gameplay logs real participation, skips seeks, excludes editor preview and persists restart attempts', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/');
  await importDemo(page, {
    ...blankChart('Fit Log playback'),
    playRange: { startMs: 0, endMs: 6500 },
    notes: [
      { id: 'one', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 },
      { id: 'skip', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 4500 },
    ],
  });
  await expect(page.locator('.editor')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await expect(page.locator('.fit-log')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/fit-log/editor-unchanged-1920.png' });
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.locator('.practice')).toBeVisible();
  if (await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused))
    await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 10000,
    })
    .toBeGreaterThan(1.2);
  expect((await log(page)).sessions).toEqual([]);
  await editInStudio(page);
  const song = (await readSongs(page))[0];
  await putSongs(page, [
    { ...song, released: { dance: { ...song.drafts.dance!, albumId: 'pop' } } },
  ]);
  await page.reload();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.play-mode').click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.collection-album[data-id="all"]').click();
  await insertAlbum(page);
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.start-briefing')).toHaveAttribute('data-motion', 'ready');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.practice')).toBeVisible();
  await expect(page.locator('.fit-log')).toHaveCount(0);
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 12000,
    })
    .toBeGreaterThan(1.4);
  await page.screenshot({ path: 'artifacts/fit-log/gameplay-unchanged-1920.png' });
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  await expect.poll(async () => (await log(page)).sessions.length).toBe(1);
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.currentTime = 5.2;
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('.after-show')).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await log(page)).sessions[0]?.completed).toBe(true);
  const first = (await log(page)).sessions[0];
  expect(first.days[0].durationMs).toBeGreaterThan(1500);
  expect(first.days[0].durationMs).toBeLessThan(4200);
  expect(first.days[0].estimatedKcal).toBeCloseTo(3.6 * 0.0414);
  await expect(page.locator('.fit-log')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/fit-log/after-show-unchanged-1920.png' });
  await page.getByRole('button', { name: /ENCORE/ }).focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 12000,
    })
    .toBeGreaterThan(1.3);
  await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  await expect.poll(async () => (await log(page)).sessions.length).toBe(2);
  const context = await browser.newContext({ baseURL });
  await context.addCookies(await page.context().cookies());
  try {
    const fresh = await context.newPage();
    await fresh.goto('/');
    await expect(fresh.locator('.menu-curtain')).toHaveCount(0);
    await open(fresh);
    await expect(fresh.locator('.fit-log-metric').last()).toContainText('1');
    expect((await log(fresh)).sessions.length).toBe(2);
  } finally {
    await context.close();
  }
});
