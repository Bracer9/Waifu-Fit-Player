import { expect, test } from '@playwright/test';
import { blankChart } from '../src/model';
import { importDemo, insertAlbum } from './helpers/project';

test('album preview muffles music, runs one quiet motor, and restores dry sound on insertion', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const probe = {
      contexts: [] as AudioContext[],
      filters: [] as BiquadFilterNode[],
      gains: [] as GainNode[],
      media: [] as HTMLMediaElement[],
      previewLoads: 0,
      voices: [] as { node: AudioBufferSourceNode; ended: boolean }[],
    };
    Object.assign(window, { playerAudioProbe: probe });
    const Context = window.AudioContext;
    window.AudioContext = class extends Context {
      constructor() {
        super();
        probe.contexts.push(this);
      }
      createBiquadFilter() {
        const node = super.createBiquadFilter();
        probe.filters.push(node);
        return node;
      }
      createGain() {
        const node = super.createGain();
        probe.gains.push(node);
        return node;
      }
      createMediaElementSource(element: HTMLMediaElement) {
        probe.media.push(element);
        if (probe.media.length === 2)
          element.addEventListener('emptied', () => probe.previewLoads++);
        return super.createMediaElementSource(element);
      }
      createBufferSource() {
        const node = super.createBufferSource();
        const record = { node, ended: false };
        probe.voices.push(record);
        node.addEventListener('ended', () => {
          record.ended = true;
        });
        return node;
      }
    };
  });
  await page.goto('/');
  for (const album of ['pop', 'anime']) {
    await importDemo(page, {
      ...blankChart(`Studio preview ${album}`),
      ...(album === 'anime' ? { playRange: { startMs: 4000, endMs: 54000 } } : {}),
      notes: [{ id: 'n', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 5000 }],
    });
    await page.getByRole('button', { name: '曲目', exact: true }).click();
    await page.getByLabel('所属专辑').selectOption(album);
    await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
    await page.getByRole('button', { name: '确认发布', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: '音游模式', exact: true }).click();
  await page.locator('.collection-album').nth(1).click();
  await expect(page.getByRole('button', { name: '暂停专辑试听', exact: true })).toBeEnabled();
  const state = () =>
    page.evaluate(() => {
      const p = (
        window as unknown as {
          playerAudioProbe: {
            contexts: AudioContext[];
            filters: BiquadFilterNode[];
            gains: GainNode[];
            media: HTMLMediaElement[];
            previewLoads: number;
            voices: { node: AudioBufferSourceNode; ended: boolean }[];
          };
        }
      ).playerAudioProbe;
      return {
        contexts: p.contexts.length,
        loops: p.voices.filter((v) => v.node.loop && !v.ended).length,
        voices: p.voices.length,
        running: p.contexts[0]?.state,
        clock: p.contexts[0]?.currentTime,
        previewSource: p.media[1]?.src,
        previewTime: p.media[1]?.currentTime,
        previewVolume: p.media[1]?.volume,
        previewLoads: p.previewLoads,
        dry: p.gains[0]?.gain.value,
        wet: p.gains[2]?.gain.value,
      };
    });
  await expect.poll(async () => (await state()).loops).toBe(1);
  const progress = page.getByRole('slider', { name: '专辑试听进度', exact: true });
  const seek = async (seconds: number) => {
    const box = (await progress.boundingBox())!;
    await page.mouse.click(box.x + 6 + ((box.width - 12) * seconds) / 30, box.y + box.height / 2);
  };
  await expect(progress).toHaveAttribute('max', '30');
  expect((await state()).previewTime).toBeGreaterThanOrEqual(14);
  expect((await state()).previewTime).toBeLessThan(18);
  const response = await page.evaluate(() => {
    const p = (window as unknown as { playerAudioProbe: { filters: BiquadFilterNode[] } })
      .playerAudioProbe;
    const frequencies = new Float32Array([100, 5000]);
    const values = [1, 1];
    for (const filter of p.filters) {
      const magnitude = new Float32Array(2);
      filter.getFrequencyResponse(frequencies, magnitude, new Float32Array(2));
      values[0] *= magnitude[0];
      values[1] *= magnitude[1];
    }
    return values;
  });
  expect(response[0]).toBeGreaterThan(0.8);
  expect(response[1] / response[0]).toBeLessThan(0.01);
  await expect.poll(async () => (await state()).dry).toBeCloseTo(0.25, 2);
  await expect.poll(async () => (await state()).wet).toBeCloseTo(0.585, 2);
  await page.getByRole('button', { name: '暂停专辑试听', exact: true }).click();
  await expect(page.getByRole('button', { name: '播放专辑试听', exact: true })).toBeEnabled();
  const pausedClock = (await state()).clock;
  await seek(20);
  await expect.poll(async () => Math.abs((await state()).previewTime - 34)).toBeLessThan(0.2);
  const normalVolume = (await state()).previewVolume;
  await seek(29.65);
  await expect.poll(async () => (await state()).previewVolume).toBeLessThan(normalVolume * 0.7);
  await seek(20);
  await expect.poll(async () => (await state()).previewVolume).toBeCloseTo(normalVolume, 2);
  await seek(29.8);
  await expect.poll(async () => (await state()).clock).toBeGreaterThan(pausedClock + 0.6);
  expect((await state()).loops).toBe(1);
  await page.getByRole('button', { name: '播放专辑试听', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停专辑试听', exact: true })).toBeEnabled();
  await expect.poll(async () => (await state()).previewTime).toBeLessThan(17); // Loops at 44s back to 14s.
  const firstSource = (await state()).previewSource;
  await page.locator('.collection-album').nth(2).click();
  await expect(page.locator('.album-deck h2')).toHaveText('Studio preview pop');
  await expect.poll(async () => (await state()).previewSource).not.toBe(firstSource);
  await expect(page.getByRole('button', { name: '暂停专辑试听', exact: true })).toBeEnabled();
  await expect(progress).toHaveAttribute('max', '30');
  expect((await state()).previewTime).toBeGreaterThanOrEqual(15);
  expect((await state()).previewTime).toBeLessThan(19);
  expect((await state()).loops).toBe(1);
  expect((await state()).voices).toBe(2);
  // ALL TRACKS has two different songs: reaching the preview end must shuffle to the other one.
  await page.locator('.collection-album').first().click();
  await expect(page.getByRole('button', { name: '暂停专辑试听', exact: true })).toBeEnabled();
  const beforeShuffle = (await state()).previewSource;
  await seek(29.8);
  await expect.poll(async () => (await state()).previewSource).not.toBe(beforeShuffle);
  await expect(page.getByRole('button', { name: '暂停专辑试听', exact: true })).toBeEnabled();
  expect((await state()).voices).toBe(2);
  // Even switching through an empty album must keep the same motor and context alive.
  await page.locator('.collection-album').nth(3).click();
  await expect(page.getByRole('button', { name: '播放专辑试听', exact: true })).toBeDisabled();
  await expect.poll(async () => (await state()).running).toBe('running');
  await page.locator('.collection-album').nth(2).click();
  await expect(page.getByRole('button', { name: '暂停专辑试听', exact: true })).toBeEnabled();
  expect((await state()).loops).toBe(1);
  expect((await state()).voices).toBe(2); // Original loop + original startup; no restarts.
  await seek(10);
  await expect.poll(async () => Math.abs((await state()).previewTime - 25)).toBeLessThan(1);
  const beforeInsert = await state();
  await insertAlbum(page);
  await expect.poll(async () => (await state()).dry).toBeGreaterThan(0.99);
  await expect.poll(async () => (await state()).wet).toBeLessThan(0.01);
  await expect.poll(async () => (await state()).loops).toBe(0);
  const afterInsert = await state();
  expect(afterInsert.previewSource).toBe(beforeInsert.previewSource);
  expect(afterInsert.previewLoads).toBe(beforeInsert.previewLoads);
  expect(afterInsert.previewTime).toBeGreaterThanOrEqual(beforeInsert.previewTime);
  expect(afterInsert.previewTime).toBeLessThan(beforeInsert.previewTime + 8);
  // The song carousel keeps looping the middle clip; only HOLD starts the full preview.
  await page.evaluate(() => {
    const probe = (window as unknown as { playerAudioProbe: { media: HTMLMediaElement[] } })
      .playerAudioProbe;
    probe.media[1].currentTime = 44.85;
  });
  await expect.poll(async () => (await state()).previewTime).toBeLessThan(18);
  await page.locator('.record-select').click();
  await expect(page.locator('.start-briefing')).toHaveAttribute('data-motion', 'ready');
  await expect.poll(async () => (await state()).previewTime).toBeLessThan(5);
  await page.keyboard.press('Escape');
  await expect(page.locator('.start-briefing')).toHaveCount(0);
  await expect.poll(async () => (await state()).previewTime).toBeGreaterThanOrEqual(15);
  expect((await state()).previewTime).toBeLessThan(19);
  expect((await state()).contexts).toBe(1);
  expect(errors).toEqual([]);
});
