import { expect, test } from '@playwright/test';
import { importDemo } from './helpers/project';

test('真实 MP3 连续进出单曲试听，恢复 BGM 无错误或下载', async ({ page }) => {
  const downloads: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.addInitScript(() => {
    const Audio = window.Audio;
    Object.assign(window, { audioEvents: [], menuProbe: [] });
    window.Audio = class extends Audio {
      constructor() {
        super();
        (window as unknown as { menuProbe: HTMLAudioElement[] }).menuProbe.push(this);
        this.addEventListener('error', () => {
          (window as unknown as { audioEvents: unknown[] }).audioEvents.push({
            src: this.src,
            error: this.error?.message,
          });
        });
      }
    };
  });
  const sound = () =>
    page.evaluate(() => {
      const w = window as unknown as { menuProbe: HTMLAudioElement[]; audioEvents: unknown[] };
      const audio = w.menuProbe.find((a) => !a.paused) ?? w.menuProbe[0];
      return {
        src: audio.getAttribute('src'),
        time: audio.currentTime,
        paused: audio.paused,
        count: w.menuProbe.length,
        playing: w.menuProbe.filter((a) => !a.paused).length,
        error: audio.error?.message,
        events: w.audioEvents,
      };
    });
  await page.goto('/');
  await importDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('所属专辑').selectOption('touhou');
  await page.getByRole('button', { name: '发布到曲库', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '主菜单', exact: true }).click();
  await page.getByRole('button', { name: '选择主界面 BGM' }).click();
  const tracks = page.locator('.theme-track');
  test.skip((await tracks.count()) === 0, '需要游戏 BGM 资源');
  await tracks.first().click();
  await page.getByRole('button', { name: '单曲循环', exact: true }).click();
  await expect.poll(async () => (await sound()).time).toBeGreaterThan(0);
  const theme = (await sound()).src;
  await page.getByRole('button', { name: '关闭主界面音乐' }).click();
  await expect.poll(async () => (await sound()).time).toBeGreaterThan(2.5);
  await page.screenshot({ path: 'artifacts/menu-music-real-track.png', animations: 'disabled' });
  await page.waitForTimeout(350);
  await page.screenshot({
    path: 'artifacts/menu-music-real-track-later.png',
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /音游模式/ }).click();
  for (let i = 0; i < 6; i++) {
    await page.locator('.collection-album').first().click();
    await expect.poll(async () => (await sound()).src).toBe('/demo.mp4');
    await expect.poll(async () => (await sound()).time).toBeGreaterThan(0.1);
    expect(await sound()).toMatchObject({ count: 2, playing: 1 });
    await page.getByRole('button', { name: '选择专辑', exact: true }).click();
    await expect.poll(async () => (await sound()).src).toBe(theme);
    const resumed = (await sound()).time;
    await expect
      .poll(async () => (await sound()).time)
      .toBeGreaterThan(resumed + 0.15)
      .catch(async (error) => {
        console.log('BGM restore failed', i, await sound());
        throw error;
      });
    expect((await sound()).events).toEqual([]);
    expect(await sound()).toMatchObject({ count: 2, playing: 1 });
  }
  expect(downloads).toEqual([]);
  expect(errors).toEqual([]);
});
