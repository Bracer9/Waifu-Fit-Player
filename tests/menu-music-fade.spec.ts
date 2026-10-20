import { expect, test } from '@playwright/test';
import { insertAlbum, importDemo } from './helpers/project';
import { blankChart } from '../src/model';

type FadeProbe = {
  audio: HTMLAudioElement[];
  samples: { index: number; at: number; volume: number }[];
  overlaps: number[];
};

test('专辑与单曲试听往返有完整的平滑淡出淡入，快速返回不中断恢复', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const Audio = window.Audio;
    const probe: FadeProbe = { audio: [], samples: [], overlaps: [] };
    Object.assign(window, { fadeProbe: probe });
    window.Audio = class extends Audio {
      constructor() {
        super();
        const index = probe.audio.push(this) - 1;
        this.addEventListener('volumechange', () => {
          probe.samples.push({ index, at: performance.now(), volume: this.volume });
        });
        this.addEventListener('play', () => {
          probe.overlaps.push(probe.audio.filter((audio) => !audio.paused).length);
        });
      }
    };
  });
  const levels = () =>
    page.evaluate(() =>
      (window as unknown as { fadeProbe: FadeProbe }).fadeProbe.audio.map((audio) => ({
        volume: audio.volume,
        paused: audio.paused,
        error: audio.error?.message,
      })),
    );
  const clear = () =>
    page.evaluate(() => {
      (window as unknown as { fadeProbe: FadeProbe }).fadeProbe.samples = [];
    });
  const verifyFade = async (outgoing: number, incoming: number) => {
    const samples = await page.evaluate(
      () => (window as unknown as { fadeProbe: FadeProbe }).fadeProbe.samples,
    );
    const middle = (index: number) =>
      samples.filter(
        (sample) => sample.index === index && sample.volume > 0.07 && sample.volume < 0.63,
      );
    const out = middle(outgoing);
    const into = middle(incoming);
    expect(out.length).toBeGreaterThan(8);
    expect(into.length).toBeGreaterThan(12);
    expect(out.at(-1)!.at - out[0].at).toBeGreaterThan(220);
    expect(into.at(-1)!.at - into[0].at).toBeGreaterThan(350);
    for (let i = 1; i < out.length; i++)
      expect(out[i].volume).toBeLessThanOrEqual(out[i - 1].volume);
    for (let i = 1; i < into.length; i++)
      expect(into[i].volume).toBeGreaterThanOrEqual(into[i - 1].volume);
  };
  await page.goto('/');
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  await page.getByRole('slider', { name: '菜单 BGM 音量', exact: true }).fill('0.7');
  await page.getByLabel('游戏／视频音量', { exact: true }).fill('0.7');
  await page.keyboard.press('Escape');
  await importDemo(page, {
    ...blankChart('Menu fade QA'),
    notes: [{ id: 'fade-note', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 1000 }],
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('touhou');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect.poll(async () => (await levels())[0].volume).toBe(0.7);
  await clear();
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await expect.poll(async () => (await levels())[1].volume).toBe(0.7);
  await verifyFade(0, 1);
  await clear();
  await page.getByRole('button', { name: '选择专辑', exact: true }).click();
  await expect.poll(async () => (await levels())[0].volume).toBe(0.7);
  await verifyFade(1, 0);
  // Reverse navigation while the outgoing track is still fading.
  await page.locator('.collection-album').first().click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await levels())[0]).toMatchObject({ volume: 0.7, paused: false });
  await expect.poll(async () => (await levels())[1].paused).toBe(true);
  const overlaps = await page.evaluate(
    () => (window as unknown as { fadeProbe: FadeProbe }).fadeProbe.overlaps,
  );
  expect(overlaps.every((count) => count <= 1)).toBe(true);
  expect((await levels()).every((audio) => !audio.error)).toBe(true);
  expect(errors).toEqual([]);
});
