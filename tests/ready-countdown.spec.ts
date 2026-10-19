import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Chart } from '../src/model';
import { READY_COUNTDOWN } from '../src/ready-countdown';

type Proof = {
  kind: string;
  at: number;
  phase?: string;
  text?: string;
  time?: number;
  overlay?: boolean;
  frameReady?: number;
  seeking?: boolean;
  opacity?: number;
};

async function instrument(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
    Object.assign(window, { readyProof: [], holdReadyFrame: false });
    const state = window as unknown as { readyProof: Proof[]; holdReadyFrame: boolean };
    const ready = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get() {
        const value = ready.get!.call(this);
        return this instanceof HTMLVideoElement && this.isConnected && state.holdReadyFrame
          ? Math.min(2, value)
          : value;
      },
    });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLVideoElement && this.isConnected)
        state.readyProof.push({
          kind: 'play',
          at: performance.now(),
          time: this.currentTime,
          overlay: !!document.querySelector('.ready-countdown'),
          frameReady: this.readyState,
          seeking: this.seeking,
        });
      return play.call(this);
    };
    let last = '';
    new MutationObserver(() => {
      const countdown = document.querySelector('.ready-countdown');
      const phase = countdown?.getAttribute('data-phase') ?? '';
      const text = countdown?.querySelector('[role="timer"]')?.textContent ?? '';
      const key = `${phase}:${text}`;
      if (key === last) return;
      if (countdown || last !== '')
        state.readyProof.push({
          kind: countdown ? 'step' : 'removed',
          phase,
          text,
          at: performance.now(),
        });
      last = countdown ? key : '';
      if (phase === 'counting' && text === '3') {
        const sample = () => {
          const number = document.querySelector(
            '.ready-countdown[data-phase="counting"] .ready-number',
          );
          if (number?.textContent !== '3') return;
          state.readyProof.push({
            kind: 'number-opacity',
            at: performance.now(),
            opacity: Number(getComputedStyle(number).opacity),
          });
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-phase'],
    });
  });
}

async function publish(page: Page, title: string, coverFile: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await chooser).setFiles('tests/fixtures/bpm-148.mp4');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const chart: Chart = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  chart.title = title;
  chart.difficulty = 'normal';
  chart.difficultyRating = 3;
  chart.playRange = { startMs: 3000, endMs: 18000 };
  chart.notes = [{ id: 'start', kind: 'tap', lane: 'squat', direction: 'down', timeMs: 4000 }];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'ready.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('touhou');
  await page.getByLabel('选择曲绘图片').setInputFiles(coverFile);
  const cover = await page.locator('.draft-cover img').getAttribute('src');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return cover!;
}

async function songs(page: Page) {
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
  await page.locator('.collection-album').first().click();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
}

async function start(page: Page, title: string) {
  await page.getByRole('button', { name: `选择 ${title}`, exact: true }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '开始倒计时' })).toBeVisible();
}

test('song-specific cover, prepared frame, coordinated lanes, and GO starts playback before glitch ends', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await instrument(page);
  await page.goto('/');
  await page.getByRole('button', { name: /创作模式/ }).click();
  const first = await publish(page, 'Ready Pink', 'public/art/special/heart.png');
  const second = await publish(page, 'Ready Cyan', 'public/art/special/star-cyan.png');
  expect(first).not.toBe(second);
  await songs(page);
  await page.evaluate(() => {
    (window as unknown as { holdReadyFrame: boolean }).holdReadyFrame = true;
  });
  await start(page, 'Ready Pink');
  const countdown = page.getByRole('dialog', { name: '开始倒计时' });
  const video = page.locator('video');
  const videoNode = (await video.elementHandle())!;
  await expect(countdown).toHaveAttribute('data-phase', 'waiting');
  await expect(page.locator('.ready-room-shade')).toHaveCSS(
    'opacity',
    String(READY_COUNTDOWN.roomShade),
  );
  await expect(page.locator('.ready-lamp-cap')).toHaveCSS('opacity', '0.9');
  await expect(page.locator('.practice .lane-label').first()).toHaveCSS(
    'filter',
    'brightness(0.42)',
  );
  expect(
    await page
      .locator('.practice .play-lane')
      .first()
      .evaluate((node) => getComputedStyle(node, '::after').opacity),
  ).toBe('0.58');
  await expect(countdown.locator('.cover-art')).toHaveAttribute('src', first);
  await expect(countdown.locator('.cover-art')).toHaveCSS('object-fit', 'cover');
  await page.waitForTimeout(900);
  await expect(countdown.getByRole('timer')).toHaveText('3');
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    3,
    true,
  ]);
  await page.evaluate(() => {
    (window as unknown as { holdReadyFrame: boolean }).holdReadyFrame = false;
    document.querySelector('video')!.dispatchEvent(new Event('canplay'));
  });
  await expect(countdown).toHaveAttribute('data-phase', 'counting');
  await page.screenshot({ path: 'artifacts/ready-room-power-on-1080p.png' });
  await expect(countdown.locator('.ready-cover')).toHaveCSS('filter', 'blur(12px)');
  await expect(countdown.locator('.ready-number')).toHaveCSS('filter', 'none');
  const delays = await page
    .locator('.practice .highway-line')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationDelay));
  expect(delays).toEqual(['0s', '0.085s', '0.17s', '0.255s', '0.34s']);
  await expect(countdown.getByRole('timer')).toHaveText('2');
  await page.screenshot({ path: 'artifacts/ready-cover-1080p.png' });
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect(countdown.getByRole('timer')).toHaveText('1');
  const roomShade = Number(
    await page.locator('.ready-room-shade').evaluate((node) => getComputedStyle(node).opacity),
  );
  expect(roomShade).toBeGreaterThan(0);
  expect(roomShade).toBeLessThan(READY_COUNTDOWN.roomShade);
  await page.waitForFunction(
    () => document.querySelector('.ready-countdown')?.getAttribute('data-phase') === 'go',
  );
  await expect(page.locator('.ready-room-shade')).toHaveCSS('opacity', '0');
  await expect(page.locator('.ready-lamp-cap')).toHaveCSS('opacity', '0');
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect(countdown.locator('.ready-cover')).toHaveCSS('animation-name', 'ready-cover-glitch');
  await page.screenshot({ path: 'artifacts/ready-go-glitch-1080p.png' });
  await expect(countdown).toHaveCount(0);
  await expect(page.locator('.studio-startup-lighting')).toHaveCount(0);
  await expect(page.locator('.practice')).not.toHaveAttribute('data-ready');
  await expect(video).toHaveCSS('filter', 'none');
  await expect(page.locator('.practice .highway-line').first()).toHaveCSS('animation-name', 'none');
  expect(await videoNode.evaluate((node) => node.isConnected)).toBe(true);
  const proof = await page.evaluate(
    () => (window as unknown as { readyProof: Proof[] }).readyProof,
  );
  const numberOpacity = proof.filter((entry) => entry.kind === 'number-opacity');
  expect(numberOpacity.length).toBeGreaterThan(5);
  expect(numberOpacity.every((entry) => entry.opacity === 1)).toBe(true);
  const steps = proof.filter((entry) => entry.kind === 'step' && entry.phase !== 'waiting');
  expect(steps.map((entry) => entry.text)).toEqual(['3', '2', '1', 'GO!']);
  const playback = proof.find((entry) => entry.kind === 'play')!;
  const go = steps.at(-1)!;
  const removed = proof.find((entry) => entry.kind === 'removed')!;
  expect(playback.overlay).toBe(true);
  expect(playback.time).toBeCloseTo(3, 2);
  expect(playback.frameReady).toBeGreaterThanOrEqual(3);
  expect(playback.seeking).toBe(false);
  expect(Math.abs(playback.at - go.at)).toBeLessThan(75);
  expect(removed.at - playback.at).toBeGreaterThan(READY_COUNTDOWN.revealMs * 0.65);
  expect(Math.abs(playback.at - steps[0].at - 3 * READY_COUNTDOWN.beatMs)).toBeLessThan(150);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'BACK TO SELECT', exact: true }).click();
  await start(page, 'Ready Cyan');
  await expect(countdown.locator('.cover-art')).toHaveAttribute('src', second);
  await expect(countdown.getByRole('timer')).toHaveText('2');
  await page.keyboard.press('Backspace');
  await expect(countdown).toHaveCount(0);
  await page.waitForTimeout(2 * READY_COUNTDOWN.beatMs + READY_COUNTDOWN.revealMs + 100);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  expect(
    (await page.evaluate(() => (window as unknown as { readyProof: Proof[] }).readyProof)).filter(
      (entry) => entry.kind === 'play',
    ),
  ).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('missing cover uses the existing placeholder and reduced motion keeps countdown and playback', async ({
  page,
}) => {
  await instrument(page);
  await page.goto('/');
  await page.getByRole('button', { name: /创作模式/ }).click();
  await publish(page, 'Ready Legacy', 'public/art/special/heart.png');
  // A released edition without a jacket is valid legacy data.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('waifu-fit-player-library');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction('songs', 'readwrite');
          const store = tx.objectStore('songs');
          const request = store.getAll();
          request.onsuccess = () => {
            for (const song of request.result) {
              song.released.normal.cover = '';
              store.put(song);
            }
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
  );
  await page.reload();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await songs(page);
  await start(page, 'Ready Legacy');
  const countdown = page.getByRole('dialog', { name: '开始倒计时' });
  await expect(countdown.locator('.cover-placeholder')).toBeVisible();
  await expect(countdown.locator('.cover-art')).toHaveCount(0);
  await expect(countdown).toHaveAttribute('data-phase', 'counting');
  await expect(countdown.locator('.ready-number')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.practice .highway-line').first()).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.ready-room-shade')).toHaveCSS('opacity', '0');
  await expect(page.locator('.ready-light-wash')).toBeHidden();
  await page.waitForFunction(
    () => document.querySelector('.ready-countdown')?.getAttribute('data-phase') === 'go',
  );
  await expect(countdown.locator('.ready-cover')).toHaveCSS('animation-name', 'ready-reveal');
  await expect(countdown.locator('.ready-glitch')).toBeHidden();
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect(countdown).toHaveCount(0);
});
