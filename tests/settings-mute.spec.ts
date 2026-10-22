import { expect, test } from '@playwright/test';

test('three volume icons mute independently and restore using mouse, keyboard and reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    for (const [key, value] of [
      ['waifu-menu-volume', '0.42'],
      ['waifu-video-volume', '0.67'],
      ['waifu-fit-player-se-volume', '0.28'],
    ]) {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }
  });
  await page.goto('/');
  const gear = page.getByRole('button', { name: '全局设置', exact: true });
  const settings = page.getByRole('dialog', { name: '全局设置', exact: true });
  await gear.click();
  const channels = [
    ['菜单 BGM 音量', '0.42'],
    ['游戏／视频音量', '0.67'],
    ['音效（SE）音量', '0.28'],
  ];
  for (const [label, volume] of channels) {
    const slider = settings.getByRole('slider', { name: label, exact: true });
    await settings.getByRole('button', { name: `静音${label}`, exact: true }).click();
    await expect(slider).toHaveValue('0');
    await expect(
      settings.getByRole('button', { name: `恢复${label}`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(slider.locator('..').locator('output')).toHaveText('MUTED');
    for (const [other, otherVolume] of channels) {
      if (other !== label)
        await expect(settings.getByRole('slider', { name: other, exact: true })).toHaveValue(
          otherVolume,
        );
    }
    await page.keyboard.press('Enter');
    await expect(slider).toHaveValue(volume);
    await slider.focus();
    await page.keyboard.press('Enter');
    await expect(slider).toHaveValue('0');
    await expect(slider).toBeFocused();
    // Holding the key must not repeatedly toggle the channel.
    await page.keyboard.down('Enter');
    await expect(slider).toHaveValue(volume);
    await page.keyboard.down('Enter');
    await expect(slider).toHaveValue(volume);
    await page.keyboard.up('Enter');
  }
  const menu = settings.getByRole('slider', { name: channels[0][0], exact: true });
  await menu.fill('0.63');
  await menu.fill('0');
  await settings.getByRole('button', { name: `恢复${channels[0][0]}`, exact: true }).click();
  await expect(menu).toHaveValue('0.63');
  await page.keyboard.press('Space');
  await expect(menu).toHaveValue('0');
  for (const [label] of channels.slice(1)) {
    await settings.getByRole('button', { name: `静音${label}`, exact: true }).click();
  }
  await page.mouse.move(10, 10);
  await page.screenshot({ path: 'artifacts/settings-muted-1080p.png' });
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await page.reload();
  await gear.click();
  for (const [index, [label, volume]] of channels.entries()) {
    const slider = settings.getByRole('slider', { name: label, exact: true });
    await expect(slider).toHaveValue('0');
    await settings.getByRole('button', { name: `恢复${label}`, exact: true }).click();
    await expect(slider).toHaveValue(index === 0 ? '0.63' : volume);
  }
  await page.screenshot({ path: 'artifacts/settings-unmuted-1080p.png' });
  expect(errors).toEqual([]);
});
