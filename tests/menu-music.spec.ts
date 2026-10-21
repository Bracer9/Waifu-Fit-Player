import { expect, test, type Page } from '@playwright/test';
import { writeFile, unlink } from 'node:fs/promises';
import { insertAlbum, importDemo, holdStart } from './helpers/project';

// This suite runs against Vite dev so the temporary assets enter its normal glob.
// Fixtures never enter the user's music library or the committed asset folder.
const fixtures = ['__qa_theme_a.wav', '__qa_theme_b.wav', '__qa_theme_pulse.wav'];
const created: string[] = [];
test.beforeAll(async () => {
  for (let index = 0; index < fixtures.length; index++) {
    const rate = 16000,
      seconds = 8;
    const wav = Buffer.alloc(44 + rate * seconds * 2);
    wav.write('RIFF');
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(wav.length - 44, 40);
    for (let i = 0; i < rate * seconds; i++) {
      const phase = (i / rate) % 0.6;
      const envelope =
        index === 2
          ? phase < 0.12
            ? Math.sin((phase / 0.12) * Math.PI)
            : 0
          : 0.4 + 0.3 * Math.sin((i / rate) * Math.PI * 4);
      wav.writeInt16LE(
        Math.round(
          9000 *
            envelope *
            Math.sin((i / rate) * Math.PI * (index === 2 ? 180 : 880 + index * 440)),
        ),
        44 + i * 2,
      );
    }
    const path = `src/assets/menu-bgm/${fixtures[index]}`;
    await writeFile(path, wav, { flag: 'wx' });
    created.push(path);
  }
});
test.afterAll(async () => {
  await Promise.all(created.map((path) => unlink(path)));
});

type Probes = typeof window & {
  menuAudio: HTMLAudioElement[];
  menuContexts: AudioContext[];
  spectrumReads: number;
  levels: { index: number; volume: number; playing: number }[];
};
async function sound(page: Page) {
  return page.evaluate(() => {
    const probe = window as Probes;
    const a = probe.menuAudio.find((audio) => !audio.paused) ?? probe.menuAudio[0];
    return {
      src: a.getAttribute('src'),
      selectedTrack: localStorage.getItem('waifu-menu-track'),
      time: a.currentTime,
      paused: a.paused,
      loop: a.loop,
      volume: a.volume,
      count: probe.menuAudio.length,
      reads: probe.spectrumReads,
      context: probe.menuContexts[0]?.state,
      playing: probe.menuAudio.filter((audio) => !audio.paused).length,
      previewSource: probe.menuAudio[1]?.getAttribute('src'),
    };
  });
}

async function closeMusic(page: Page) {
  await page.mouse.move(10, 10);
  await expect(page.getByRole('region', { name: '主界面音乐' })).toBeHidden();
}

test('悬停音乐菜单、真实频谱、循环偏好与选曲试听互不叠音', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const probe = window as Probes;
    probe.menuAudio = [];
    probe.menuContexts = [];
    probe.spectrumReads = 0;
    probe.levels = [];
    const Audio = window.Audio,
      Context = window.AudioContext;
    window.Audio = class extends Audio {
      constructor(src?: string) {
        super(src);
        probe.menuAudio.push(this);
        const record = () =>
          probe.levels.push({
            index: probe.menuAudio.indexOf(this),
            volume: this.volume,
            playing: probe.menuAudio.filter((audio) => !audio.paused).length,
          });
        this.addEventListener('volumechange', record);
        this.addEventListener('play', record);
      }
    };
    window.AudioContext = class extends Context {
      constructor() {
        super();
        probe.menuContexts.push(this);
      }
    };
    const read = AnalyserNode.prototype.getByteFrequencyData;
    AnalyserNode.prototype.getByteFrequencyData = function (data) {
      probe.spectrumReads++;
      read.call(this, data);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  await expect(page.getByRole('slider', { name: '菜单 BGM 音量', exact: true })).toHaveValue('0.9');
  await page.getByLabel('游戏／视频音量', { exact: true }).fill('0.25');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '选择主界面 BGM' }).hover();
  await expect(page.getByRole('region', { name: '主界面音乐' })).toBeVisible();
  await page.getByRole('button', { name: /__qa_theme_a/ }).click();
  await expect.poll(async () => (await sound(page)).paused).toBe(false);
  await expect.poll(async () => (await sound(page)).reads).toBeGreaterThan(2);
  await page.getByRole('button', { name: '单曲循环', exact: true }).click();
  expect((await sound(page)).loop).toBe(true);
  await page.evaluate(() => {
    (window as Probes).menuAudio[0].currentTime = 7.9;
  });
  await expect.poll(async () => (await sound(page)).time).toBeLessThan(1);
  await expect(page.locator('.theme-track[aria-pressed="true"]')).toContainText('__qa_theme_a');
  await page.getByRole('button', { name: '列表循环', exact: true }).click();
  await page.evaluate(() => {
    (window as Probes).menuAudio[0].currentTime = 7.9;
  });
  await expect.poll(async () => (await sound(page)).selectedTrack).toContain('__qa_theme_b');
  await page.getByRole('button', { name: '随机', exact: true }).click();
  await page.evaluate(() => {
    (window as Probes).menuAudio[0].currentTime = 7.9;
  });
  await expect.poll(async () => (await sound(page)).selectedTrack).not.toContain('__qa_theme_b');
  await page.getByRole('button', { name: /__qa_theme_a/ }).click();
  await expect.poll(async () => (await sound(page)).selectedTrack).toContain('__qa_theme_a');
  await page.getByRole('slider', { name: '菜单 BGM 音量', exact: true }).fill('0.5');
  await expect.poll(async () => (await sound(page)).volume).toBe(0.5);
  const waveHeights = () =>
    page.locator('.music-pulse').evaluate((node: HTMLCanvasElement) => {
      const ratio = node.width / node.clientWidth;
      const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
      return Array.from({ length: 56 }, (_, i) => {
        const offset = 54 + (i * (node.clientWidth / 2 - 55.5)) / 55;
        const x = Math.floor((node.clientWidth / 2 - offset) * ratio);
        let height = 0;
        for (let y = 0; y < node.height; y++)
          if (pixels[(y * node.width + x) * 4 + 3] > 40) height++;
        return height / ratio;
      });
    });
  const peakBand = async () => {
    const heights = await waveHeights();
    return heights.indexOf(Math.max(...heights));
  };
  // The 440 Hz fixture must peak near its frequency, not across a travelling history.
  await expect.poll(peakBand).toBeGreaterThanOrEqual(17);
  await expect.poll(peakBand).toBeLessThanOrEqual(21);
  const spectrum = await waveHeights();
  expect(Math.max(...spectrum)).toBeGreaterThan(8);
  expect(spectrum.slice(35).every((height) => height <= 5)).toBe(true);
  await page.getByRole('button', { name: /__qa_theme_b/ }).click();
  // 660 Hz moves the peak toward the treble end.
  await expect.poll(peakBand).toBeGreaterThanOrEqual(22);
  await expect.poll(peakBand).toBeLessThanOrEqual(25);
  await page.getByRole('button', { name: /__qa_theme_a/ }).click();
  await expect.poll(peakBand).toBeLessThanOrEqual(21);
  await page.getByRole('button', { name: /__qa_theme_pulse/ }).click();
  await expect.poll(async () => (await sound(page)).selectedTrack).toContain('__qa_theme_pulse');
  const motion = await page.evaluate(async () => {
    const shape = document.querySelector('.ambient-shape.pink')!;
    const values: number[] = [];
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const sample = () => {
        values.push(new DOMMatrix(getComputedStyle(shape).transform).e / -44);
        if (performance.now() - start < 1800) requestAnimationFrame(sample);
        else resolve();
      };
      sample();
    });
    return values;
  });
  expect(Math.max(...motion)).toBeGreaterThan(Math.min(...motion) + 0.2);
  expect(Math.min(...motion)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...motion)).toBeLessThanOrEqual(1.0001);
  await page.getByRole('button', { name: '暂停菜单 BGM', exact: true }).click();
  await expect.poll(async () => (await sound(page)).paused).toBe(true);
  // Cards float independently even while the music-driven title and shapes settle.
  const floatingCard = page.locator('.mode-record-face').first();
  const position = await floatingCard.evaluate((node) => getComputedStyle(node).translate);
  await expect
    .poll(() => floatingCard.evaluate((node) => getComputedStyle(node).translate))
    .not.toBe(position);
  await expect(page.locator('.title-brand h1 b')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  const pausedAt = (await sound(page)).time;
  await page.getByRole('button', { name: '单曲循环', exact: true }).click();
  await closeMusic(page);
  await page.getByRole('button', { name: '选择主界面 BGM' }).hover();
  expect((await sound(page)).paused).toBe(true);
  expect((await sound(page)).time).toBe(pausedAt);
  expect((await sound(page)).context).toBe('suspended');
  await page.getByRole('button', { name: '播放菜单 BGM', exact: true }).click();
  await expect.poll(async () => (await sound(page)).time).toBeGreaterThan(pausedAt + 0.1);
  expect((await sound(page)).context).toBe('running');
  await page.screenshot({ path: 'artifacts/menu-music-popup.png' });
  await closeMusic(page);
  await page.screenshot({ path: 'artifacts/menu-music-home.png' });
  const button = await page.getByRole('button', { name: '选择主界面 BGM' }).boundingBox();
  expect(Math.abs(button!.x + button!.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(1);
  const wave = await page.locator('.music-pulse').boundingBox();
  const cards = await page.locator('.mode-records').boundingBox();
  expect(wave!.x).toBeCloseTo(cards!.x, 0);
  expect(wave!.width).toBeCloseTo(cards!.width, 0);
  await expect(page.locator('.headphone-button svg')).toHaveAttribute('width', '60');
  expect((await page.locator('.menu-settings > svg').boundingBox())!.width).toBe(96);
  await expect(page.getByText('WAIFU FIT PLAYER — PERSONAL MUSIC COLLECTION')).toHaveCount(0);

  // Create a real released MP4-backed chart in this isolated browser profile.
  await importDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect.poll(async () => (await sound(page)).playing).toBe(0);
  expect((await sound(page)).context).toBe('suspended');
  await expect(page.getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('0.25');
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('touhou');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await page.getByRole('button', { name: '选择主界面 BGM' }).hover();
  await page.getByRole('button', { name: '单曲循环', exact: true }).click();
  await closeMusic(page);
  await page.evaluate(() => {
    (window as Probes).menuAudio[0].currentTime = 2;
  });
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect(page.getByRole('region', { name: '选择专辑' })).toBeVisible();
  await expect.poll(async () => (await sound(page)).time).toBeGreaterThan(2);
  const reads = (await sound(page)).reads;
  await expect.poll(async () => (await sound(page)).reads).toBeGreaterThan(reads + 2);
  const beat = () =>
    page
      .locator('.ambient-shape.pink')
      .evaluate((node) => Number((node as HTMLElement).style.getPropertyValue('--music-beat')));
  await expect.poll(beat).toBeGreaterThan(0.05);
  const theme = await sound(page);
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await expect.poll(async () => (await sound(page)).src).toBe('/demo.mp4');
  await expect.poll(async () => (await sound(page)).time).toBeGreaterThan(0);
  await expect.poll(async () => (await sound(page)).volume).toBe(0.25);
  expect((await sound(page)).count).toBe(2);
  const previewReads = (await sound(page)).reads;
  await expect.poll(async () => (await sound(page)).reads).toBeGreaterThan(previewReads + 2);
  await expect.poll(beat).toBeGreaterThan(0.01);
  // The same meter follows the preview, not the now-paused theme track.
  await page.evaluate(() => (window as Probes).menuAudio[1].pause());
  await expect.poll(beat).toBe(0);
  await page.evaluate(() => (window as Probes).menuAudio[1].play());
  await expect.poll(beat).toBeGreaterThan(0.01);
  expect(await page.evaluate(() => (window as Probes).menuContexts.length)).toBe(1);
  await page.getByRole('button', { name: '选择专辑', exact: true }).click();
  await expect.poll(async () => (await sound(page)).src).toBe(theme.src);
  await expect.poll(async () => (await sound(page)).time).toBeGreaterThanOrEqual(theme.time);
  await expect.poll(async () => (await sound(page)).volume).toBe(0.5);
  const levels = await page.evaluate(() => (window as Probes).levels);
  expect(levels.some((sample) => sample.playing > 1)).toBe(false);
  expect(
    levels.filter((sample) => sample.index === 0 && sample.volume > 0 && sample.volume < 0.5)
      .length,
  ).toBeGreaterThan(3);
  expect(
    levels.filter((sample) => sample.index === 1 && sample.volume > 0 && sample.volume < 0.25)
      .length,
  ).toBeGreaterThan(3);
  await page.locator('.collection-album').first().click();
  await insertAlbum(page);
  await page.locator('.record-card[aria-current="true"] .record-select').click();
  await holdStart(page);
  await expect(page.getByRole('timer')).toHaveText('3');
  expect(await sound(page)).toMatchObject({
    paused: true,
    context: 'suspended',
    count: 2,
    playing: 0,
    previewSource: null,
  });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  expect(await sound(page)).toMatchObject({ paused: true, context: 'suspended', playing: 0 });
  await expect(page.getByRole('slider', { name: 'Volume', exact: true })).toHaveValue('0.25');
  await page.getByRole('slider', { name: 'Volume', exact: true }).fill('0.2');
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.volume)).toBe(0.2);

  await page.reload();
  await page.getByRole('button', { name: '选择主界面 BGM' }).hover();
  await expect(page.getByRole('button', { name: '单曲循环', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('slider', { name: '菜单 BGM 音量', exact: true })).toHaveValue('0.5');
  await closeMusic(page);
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  await expect(page.getByLabel('游戏／视频音量', { exact: true })).toHaveValue('0.2');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/menu-music-1080p.png' });
  const headphone = await page.getByRole('button', { name: '选择主界面 BGM' }).boundingBox();
  expect(
    Math.abs(headphone!.x + headphone!.width / 2 - page.viewportSize()!.width / 2),
  ).toBeLessThan(1);
  expect(headphone!.y + headphone!.height).toBeLessThan(page.viewportSize()!.height);
  await page.getByRole('button', { name: '选择主界面 BGM' }).hover();
  const popup = await page.getByRole('region', { name: '主界面音乐' }).boundingBox();
  expect(popup!.y).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: 'artifacts/menu-music-popup-1080p.png', animations: 'disabled' });
  expect(errors).toEqual([]);
});
