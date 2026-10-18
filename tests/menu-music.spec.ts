import { expect, test } from '@playwright/test';

test('菜单音乐持久化、音量不重启曲目，切入创作模式释放音频', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.Audio;
    const instances: HTMLAudioElement[] = [];
    Object.assign(window, { testMenuAudio: instances });
    window.Audio = class extends original {
      constructor(src?: string) {
        super(src);
        instances.push(this);
      }
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  const wav = Buffer.alloc(44 + 8000 * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(16000, 40);
  for (const label of ['主菜单背景音乐', '选曲背景音乐']) {
    await page
      .getByLabel(label, { exact: true })
      .setInputFiles({ name: 'menu.wav', mimeType: 'audio/wav', buffer: wav });
  }
  await expect(page.getByText('menu.wav', { exact: true })).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: '全局设置', exact: true }).click();
  await expect(page.getByText('menu.wav', { exact: true })).toHaveCount(2);
  const count = () =>
    page.evaluate(
      () => (window as typeof window & { testMenuAudio: HTMLAudioElement[] }).testMenuAudio.length,
    );
  const before = await count();
  await page.getByLabel('菜单音乐音量', { exact: true }).fill('0.5');
  expect(await count()).toBe(before);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: /音游模式/ }).click();
  await page.locator('.collection-album').first().click();
  expect(await count()).toBe(before + 1);
  await page.getByRole('button', { name: '创作模式', exact: true }).click();
  await expect(page.getByRole('button', { name: '新建', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as typeof window & { testMenuAudio: HTMLAudioElement[] }).testMenuAudio.every(
        (audio) => audio.paused && !audio.getAttribute('src'),
      ),
    ),
  ).toBe(true);
});
