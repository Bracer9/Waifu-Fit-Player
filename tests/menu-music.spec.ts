import { expect, test, type Page } from '@playwright/test';
import { writeFile, unlink } from 'node:fs/promises';
import { importDemo } from './helpers/project';

// This suite runs against Vite dev so the temporary assets enter its normal glob.
// Fixtures never enter the user's music library or the committed asset folder.
const fixtures = ['__qa_theme_a.wav', '__qa_theme_b.wav'];
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
      const envelope = 0.4 + 0.3 * Math.sin((i / rate) * Math.PI * 4);
      wav.writeInt16LE(
        Math.round(9000 * envelope * Math.sin((i / rate) * Math.PI * (880 + index * 440))),
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
};
async function sound(page: Page) {
  return page.evaluate(() => {
    const probe = window as Probes;
    const a = probe.menuAudio[0];
    return {
      src: a.getAttribute('src'),
      time: a.currentTime,
      paused: a.paused,
      loop: a.loop,
      volume: a.volume,
      count: probe.menuAudio.length,
      reads: probe.spectrumReads,
      context: probe.menuContexts[0]?.state,
    };
  });
}

test('居中音乐菜单、真实频谱、循环偏好与选曲试听互不叠音', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const probe = window as Probes;
    probe.menuAudio = [];
    probe.menuContexts = [];
    probe.spectrumReads = 0;
    const Audio = window.Audio,
      Context = window.AudioContext;
    window.Audio = class extends Audio {
      constructor(src?: string) {
        super(src);
        probe.menuAudio.push(this);
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
  await page.getByRole('button', { name: '选择主界面 BGM' }).click();
  await expect(page.getByRole('dialog', { name: '主界面音乐' })).toBeVisible();
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
  await expect.poll(async () => (await sound(page)).src).toContain('__qa_theme_b');
  await page.getByRole('button', { name: '随机', exact: true }).click();
  await page.evaluate(() => {
    (window as Probes).menuAudio[0].currentTime = 7.9;
  });
  await expect.poll(async () => (await sound(page)).src).toContain('__qa_theme_a');
  await page.getByLabel('菜单音乐音量', { exact: true }).fill('0.5');
  expect((await sound(page)).volume).toBe(0.5);
  await page.screenshot({ path: 'artifacts/menu-music-popup.png' });
  await page.getByRole('button', { name: '关闭主界面音乐' }).click();
  await page.screenshot({ path: 'artifacts/menu-music-home.png' });
  const button = await page.getByRole('button', { name: '选择主界面 BGM' }).boundingBox();
  expect(Math.abs(button!.x + button!.width / 2 - 720)).toBeLessThan(1);
  await expect(page.getByText('WAIFU FIT PLAYER — PERSONAL MUSIC COLLECTION')).toHaveCount(0);

  // Create a real released MP4-backed chart in this isolated browser profile.
  await importDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect((await sound(page)).src).toBeNull();
  expect((await sound(page)).context).toBe('suspended');
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('touhou');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await page.getByRole('button', { name: '选择主界面 BGM' }).click();
  await page.getByRole('button', { name: '单曲循环', exact: true }).click();
  await page.getByRole('button', { name: '关闭主界面音乐' }).click();
  await page.evaluate(() => {
    (window as Probes).menuAudio[0].currentTime = 2;
  });
  await page.getByRole('button', { name: /音游模式/ }).click();
  await expect.poll(async () => (await sound(page)).time).toBeGreaterThan(2);
  const reads = (await sound(page)).reads;
  await page.waitForTimeout(150);
  expect((await sound(page)).reads).toBe(reads);
  const theme = await sound(page);
  await page.locator('.collection-album').first().click();
  await expect.poll(async () => (await sound(page)).src).toBe('/demo.mp4');
  await expect.poll(async () => (await sound(page)).time).toBeGreaterThan(0);
  expect((await sound(page)).count).toBe(1);
  await page.getByRole('button', { name: '选择专辑', exact: true }).click();
  await expect.poll(async () => (await sound(page)).src).toBe(theme.src);
  await expect.poll(async () => (await sound(page)).time).toBeGreaterThanOrEqual(theme.time);
  await page.locator('.collection-album').first().click();
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveText('3');
  expect(await sound(page)).toMatchObject({
    src: null,
    paused: true,
    context: 'suspended',
    count: 1,
  });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  expect(await sound(page)).toMatchObject({ src: null, paused: true, context: 'suspended' });

  await page.reload();
  await page.getByRole('button', { name: '选择主界面 BGM' }).click();
  await expect(page.getByRole('button', { name: '单曲循环', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('菜单音乐音量', { exact: true })).toHaveValue('0.5');
  await page.getByRole('button', { name: '关闭主界面音乐' }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: 'artifacts/menu-music-720.png' });
  const compact = await page.getByRole('button', { name: '选择主界面 BGM' }).boundingBox();
  expect(Math.abs(compact!.x + compact!.width / 2 - 640)).toBeLessThan(1);
  expect(compact!.y + compact!.height).toBeLessThan(720);
  expect(errors).toEqual([]);
});
