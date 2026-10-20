import { expect, test } from '@playwright/test';

test('耳机悬停展开等宽三栏，拖动进度、移出折叠与键盘操作', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const Audio = window.Audio;
    Object.assign(window, { bgmPanelAudio: [] });
    window.Audio = class extends Audio {
      constructor() {
        super();
        (window as unknown as { bgmPanelAudio: HTMLAudioElement[] }).bgmPanelAudio.push(this);
      }
    };
  });
  const audio = () =>
    page.evaluate(() => {
      const bgm = (window as unknown as { bgmPanelAudio: HTMLAudioElement[] }).bgmPanelAudio[0];
      return {
        time: bgm.currentTime,
        paused: bgm.paused,
        duration: bgm.duration,
        volume: bgm.volume,
      };
    });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '选择主界面 BGM' });
  const panel = page.getByRole('region', { name: '主界面音乐' });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.hover();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS('opacity', '1');
  await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '关闭主界面音乐' })).toHaveCount(0);
  await expect(panel.locator('.music-panel-trace path').first()).toHaveCSS(
    'animation-name',
    'cover-orbit',
  );
  const layout = async (name: string) => {
    await expect
      .poll(async () => {
        const panelWidth = (await panel.boundingBox())!.width;
        const cardsWidth = (await page.locator('.mode-records').boundingBox())!.width;
        return Math.abs(panelWidth - cardsWidth);
      })
      .toBeLessThan(0.1);
    const bounds = (await panel.boundingBox())!;
    const cards = (await page.locator('.mode-records').boundingBox())!;
    const triggerBounds = (await trigger.boundingBox())!;
    expect(bounds.x).toBeCloseTo(cards.x, 0);
    expect(bounds.width).toBeCloseTo(cards.width, 0);
    expect(bounds.y).toBeGreaterThanOrEqual(cards.y + cards.height - 1);
    expect(bounds.y + bounds.height).toBeLessThan(triggerBounds.y);
    const sections = await panel
      .locator('.music-panel-section')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
    expect(Math.max(...sections) - Math.min(...sections)).toBeLessThan(1);
    expect(bounds.y).toBeGreaterThan(0);
    expect(triggerBounds.y + triggerBounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.screenshot({ path: `artifacts/bgm-panel-${name}.png` });
  };
  // Cross the full gap from the headphone into the panel without a click.
  const triggerBounds = (await trigger.boundingBox())!;
  const panelBounds = (await panel.boundingBox())!;
  await page.mouse.move(
    triggerBounds.x + triggerBounds.width / 2,
    panelBounds.y + panelBounds.height - 35,
    { steps: 12 },
  );
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await layout('desktop');
  await page.getByRole('button', { name: '单曲循环', exact: true }).click();
  await expect.poll(async () => (await audio()).paused).toBe(false);
  await expect.poll(async () => (await audio()).duration).toBeGreaterThan(1);
  await page.getByRole('button', { name: '暂停菜单 BGM' }).click();
  await expect.poll(async () => (await audio()).paused).toBe(true);
  const progress = page.getByRole('slider', { name: '菜单 BGM 进度' });
  const bar = (await progress.boundingBox())!;
  await page.mouse.move(bar.x + 9, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width * 0.65, bar.y + bar.height / 2, { steps: 15 });
  await page.mouse.up();
  const sought = await audio();
  expect(sought.time / sought.duration).toBeGreaterThan(0.6);
  expect(sought.time / sought.duration).toBeLessThan(0.7);
  expect(sought.paused).toBe(true);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await progress.press('ArrowRight');
  expect((await audio()).time).toBeGreaterThan(sought.time);
  await expect(page.locator('.mode-record:focus')).toHaveCount(0);
  await page.getByRole('button', { name: '播放菜单 BGM' }).click();
  await expect.poll(async () => (await audio()).time).toBeGreaterThan(sought.time + 0.2);
  await page.getByRole('slider', { name: '菜单 BGM 音量' }).fill('0.37');
  await expect.poll(async () => (await audio()).volume).toBe(0.37);
  await page.getByRole('button', { name: '随机', exact: true }).click();
  await expect(page.getByRole('button', { name: '随机', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.locator('.theme-track').nth(1).click();
  await expect(page.locator('.music-now-title')).toHaveText(
    await page.locator('.theme-track').nth(1).locator('span').innerText(),
  );
  await page.mouse.move(5, 5);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  // A click pins the hover panel; mute feedback follows its restored volume.
  await trigger.hover();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.headphone-pin-rays')).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: '静音菜单 BGM', exact: true }).click();
  await expect.poll(async () => (await audio()).volume).toBe(0);
  await expect(page.locator('.headphone-pin-rays')).toHaveAttribute('data-muted', '');
  await page.getByRole('button', { name: '取消菜单 BGM 静音', exact: true }).click();
  await expect.poll(async () => (await audio()).volume).toBe(0.37);
  await expect(page.locator('.headphone-pin-rays')).not.toHaveAttribute('data-muted', '');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.headphone-pin-rays')).toHaveCount(0);
  await expect(panel).toBeHidden();
  // Hidden controls never receive tab focus. Keyboard focus can reopen the panel.
  await page.getByRole('button', { name: '全局设置', exact: true }).focus();
  await trigger.focus();
  await expect(panel).toBeVisible();
  await trigger.press('Tab');
  await expect(page.getByRole('button', { name: '暂停菜单 BGM' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.setViewportSize({ width: 2560, height: 1440 });
  await trigger.hover();
  await expect(panel).toHaveCSS('opacity', '1');
  await layout('1440p');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await trigger.hover();
  await expect(panel).toHaveCSS('opacity', '1');
  await layout('1080p');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(panel).toHaveCSS('transition-duration', '0s');
  await expect(panel.locator('.music-panel-trace path').first()).toHaveCSS(
    'animation-name',
    'none',
  );
  expect(errors).toEqual([]);
});
