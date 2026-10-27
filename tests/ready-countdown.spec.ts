import { putSongs, readSongs } from './helpers/library';
import { insertAlbum, holdStart } from './helpers/project';
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
  paused?: boolean;
  covered?: boolean;
  progress?: number;
  countdownPhase?: string;
};

async function instrument(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
    Object.assign(window, { readyProof: [], holdReadyFrame: false });
    const state = window as unknown as { readyProof: Proof[]; holdReadyFrame: boolean };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName !== 'data-render-preparing') continue;
        const root = record.target as HTMLElement;
        if (!root.hasAttribute('data-render-preparing')) continue;
        const video = document.querySelector('video');
        const entrance = document.querySelector('.game-entrance');
        state.readyProof.push({
          kind: 'render-preparation',
          at: performance.now(),
          time: video?.currentTime,
          paused: video?.paused,
          covered: !!entrance && Number(getComputedStyle(entrance).opacity) > 0.99,
        });
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-render-preparing'],
    });
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
      const progress = document.querySelector('.game-entrance [role="progressbar"]');
      if (progress && document.querySelector('.practice[data-render-preparing]')) {
        const video = document.querySelector('video');
        state.readyProof.push({
          kind: 'preparation-progress',
          at: performance.now(),
          progress: Number(progress.getAttribute('aria-valuenow')),
          time: video?.currentTime,
          paused: video?.paused,
          countdownPhase:
            document.querySelector('.ready-countdown')?.getAttribute('data-phase') ?? '',
        });
      }
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
      attributeFilter: ['data-phase', 'aria-valuenow'],
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
  chart.chartType = 'fitness';
  chart.danceDifficulty = 3;
  chart.playRange = { startMs: 3000, endMs: 18000 };
  chart.notes = [{ id: 'start', kind: 'tap', lane: 'squat', direction: 'down', timeMs: 4000 }];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'ready.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('anime');
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
  await insertAlbum(page);
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
}

async function start(page: Page, title: string) {
  await page.getByRole('button', { name: `选择 ${title}`, exact: true }).click();
  await holdStart(page);
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
  await expect(page.locator('.ready-progress-fill')).toHaveCSS(
    'background-color',
    'rgb(53, 201, 219)',
  );
  const countdown = page.getByRole('dialog', { name: '开始倒计时' });
  const video = page.locator('video');
  const videoNode = (await video.elementHandle())!;
  const preparation = page.getByRole('progressbar', { name: '进曲准备进度' });
  await expect(preparation).toBeVisible();
  await expect(page.locator('.game-entrance')).toHaveAttribute('data-phase', 'hold');
  expect(Number(await preparation.getAttribute('aria-valuenow'))).toBeLessThan(100);
  await page.waitForTimeout(150);
  expect(Number(await preparation.getAttribute('aria-valuenow'))).toBeLessThan(100);
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    3,
    true,
  ]);
  await page.screenshot({ path: 'artifacts/stage-startup/preparing-stage.png' });
  await expect(countdown).toHaveAttribute('data-phase', 'waiting');
  await expect(page.locator('[data-note-id="start"]')).toBeVisible();
  await expect(page.locator('.ready-room-shade')).toHaveCSS(
    'opacity',
    String(READY_COUNTDOWN.roomShade),
  );
  await expect(page.locator('.ready-lamp-cap')).toHaveCSS('opacity', '0.9');
  await expect(page.locator('.practice .lane-label').first()).toHaveCSS('filter', 'none');
  expect(
    await page
      .locator('.practice .lane-label')
      .first()
      .evaluate((node) => getComputedStyle(node, '::before').opacity),
  ).toBe('0.58');
  expect(
    await page
      .locator('.practice .play-lane')
      .first()
      .evaluate((node) => getComputedStyle(node, '::after').opacity),
  ).toBe('0.58');
  await expect(countdown.locator('.cover-art')).toHaveAttribute('src', first);
  await expect(countdown.locator('.cover-art')).toHaveCSS('object-fit', 'cover');
  await page.waitForTimeout(900);
  await expect(countdown.locator('.ready-number')).toBeHidden();
  expect(await video.evaluate((v: HTMLVideoElement) => [v.currentTime, v.paused])).toEqual([
    3,
    true,
  ]);
  await page.evaluate(() => {
    (window as unknown as { holdReadyFrame: boolean }).holdReadyFrame = false;
    document.querySelector('video')!.dispatchEvent(new Event('canplay'));
  });
  await expect(countdown).toHaveAttribute('data-phase', 'counting');
  await expect(page.locator('[data-render-preparing]')).toHaveCount(0);
  const gauge = await countdown.locator('.ready-progress-fill').evaluate((element) => {
    const animation = element
      .getAnimations()
      .find((item) => (item as CSSAnimation).animationName === 'ready-progress-fill')!;
    const timing = animation.effect!.getComputedTiming();
    const previousTime = animation.currentTime;
    animation.pause();
    const samples = [0.25, 0.5, 0.75].map((fraction) => {
      animation.currentTime = Number(timing.delay) + Number(timing.duration) * fraction;
      return 1 - parseFloat(getComputedStyle(element).clipPath.split(' ')[1]) / 100;
    });
    animation.currentTime = previousTime;
    animation.play();
    return { duration: timing.duration, delay: timing.delay, samples };
  });
  expect(gauge.duration).toBe(READY_COUNTDOWN.beatMs * 3);
  expect(gauge.delay).toBe(READY_COUNTDOWN.introMs);
  expect(gauge.samples[0]).toBeCloseTo(0.378, 2);
  expect(gauge.samples[1]).toBeCloseTo(0.685, 2);
  expect(gauge.samples[2]).toBeCloseTo(0.907, 2);
  await expect(countdown.locator('.ready-number')).toBeHidden();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.screenshot({ path: 'artifacts/ready-room-power-on-1080p.png' });
  await expect(countdown.locator('.ready-cover')).toHaveCSS('filter', 'blur(12px)');
  await expect(countdown.locator('.ready-number')).toHaveCSS('filter', 'none');
  const delays = await page
    .locator('.practice .highway-line')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationDelay));
  expect(delays).toEqual(['0s', '0.085s', '0.17s', '0.255s', '0.34s']);
  await expect(countdown.getByRole('timer')).toHaveText('3');
  await expect(page.locator('[data-note-id="start"]')).toBeVisible();
  // The lamp and room finish lighting during the lead-in, before the counted beats.
  await expect(page.locator('.ready-room-shade')).toHaveCSS('opacity', '0');
  await expect(page.locator('.ready-lamp-cap')).toHaveCSS('opacity', '0');
  await expect(countdown.getByRole('timer')).toHaveText('2');
  await page.screenshot({ path: 'artifacts/ready-cover-1080p.png' });
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect(countdown.getByRole('timer')).toHaveText('1');
  await page.waitForFunction(
    () => document.querySelector('.ready-countdown')?.getAttribute('data-phase') === 'go',
  );
  await expect(page.locator('.ready-room-shade')).toHaveCSS('opacity', '0');
  await expect(page.locator('.ready-lamp-cap')).toHaveCSS('opacity', '0');
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect(page.locator('[data-render-preparing]')).toHaveCount(0);
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
  const renderPreparation = proof.filter((entry) => entry.kind === 'render-preparation');
  const progress = proof.filter((entry) => entry.kind === 'preparation-progress');
  expect(progress.some((entry) => entry.progress === 100)).toBe(true);
  expect(
    progress.every(
      (entry) => entry.paused && entry.time === 3 && entry.countdownPhase === 'waiting',
    ),
  ).toBe(true);
  expect(renderPreparation.length).toBeGreaterThan(0);
  expect(
    renderPreparation.every((entry) => entry.covered && entry.paused && entry.time === 3),
  ).toBe(true);
  expect(numberOpacity.length).toBeGreaterThan(5);
  expect(numberOpacity.every((entry) => entry.opacity === 1)).toBe(true);
  const intro = proof.find(
    (entry) => entry.kind === 'step' && entry.phase === 'counting' && entry.text === '',
  )!;
  const steps = proof.filter(
    (entry) => entry.kind === 'step' && entry.phase !== 'waiting' && entry.text !== '',
  );
  expect(steps.map((entry) => entry.text)).toEqual(['3', '2', '1', 'GO!']);
  expect(Math.abs(steps[0].at - intro.at - READY_COUNTDOWN.introMs)).toBeLessThan(120);
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
  await expect(page.locator('[data-render-preparing]')).toHaveCount(0);
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
  const items = await readSongs(page);
  for (const song of items) song.released.fitness!.cover = '';
  await putSongs(page, items);
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
  expect(
    await page
      .locator('.practice .lane-label')
      .first()
      .evaluate((node) => getComputedStyle(node, '::before').opacity),
  ).toBe('0');
  await page.waitForFunction(
    () => document.querySelector('.ready-countdown')?.getAttribute('data-phase') === 'go',
  );
  await expect(countdown.locator('.ready-cover')).toHaveCSS('animation-name', 'ready-reveal');
  await expect(countdown.locator('.ready-glitch')).toBeHidden();
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await expect(countdown).toHaveCount(0);
});
