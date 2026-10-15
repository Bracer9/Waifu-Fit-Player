import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blankChart, LANES, type Chart } from '../src/model';
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  // Native OS pickers are covered by the handle integration tests; this suite exercises the file-input fallback.
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', {
      value: undefined,
      writable: true,
      configurable: true,
    }),
  );
  await page.goto('/');
});
test.afterEach(() => expect(errors).toEqual([]));
async function demo(page: Page) {
  await page.getByRole('button', { name: '体验示例作品', exact: true }).click();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
}
async function seek(page: Page, seconds: number) {
  await page.locator('video').evaluate((v, time) => {
    (v as HTMLVideoElement).currentTime = time;
  }, seconds);
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).seeking))
    .toBe(false);
}
async function exportChart(page: Page): Promise<Chart> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const file = await download;
  return JSON.parse(await readFile((await file.path())!, 'utf8'));
}
async function emptyEditor(page: Page) {
  await demo(page);
  await page.getByRole('button', { name: '返回工作台', exact: true }).click();
  const current = await exportChart(page);
  const chart = blankChart('浏览器测试作品');
  chart.videoHint = current.videoHint;
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'test.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: '浏览器测试作品' })).toBeVisible();
  return chart;
}
async function draw(page: Page, time: number, lane: number, end?: number) {
  const box = (await page.locator('.timeline-surface').boundingBox())!;
  const x = box.x + 124 + time * 0.1,
    y = box.y + 30 + lane * 54 + (lane === LANES.length ? 18 : 27);
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (end !== undefined) await page.mouse.move(box.x + 124 + end * 0.1, y, { steps: 8 });
  await page.mouse.up();
}

test('真实 MP4 播放、暂停、跳转、变速和单视频切换', async ({ page }) => {
  await demo(page);
  await expect(page.locator('video')).toHaveCount(1);
  const videoNode = (await page.locator('video').elementHandle())!;
  for (const name of ['新建', '打开作品', '更换视频', '保存', '导出 JSON', '操作帮助'])
    await expect(page.getByRole('button', { name, exact: true })).not.toBeVisible();
  await expect(page.getByRole('navigation')).not.toBeVisible();
  await expect(page.getByTestId('special-cue')).toHaveText('');
  const info = await page.locator('video').evaluate((v) => ({
    width: (v as HTMLVideoElement).videoWidth,
    height: (v as HTMLVideoElement).videoHeight,
    duration: (v as HTMLVideoElement).duration,
  }));
  expect(info.width).toBe(1920);
  expect(info.height).toBe(1080);
  expect(info.duration).toBeCloseTo(266.775, 1);
  await seek(page, 3);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'sway');
  await page.screenshot({ path: 'artifacts/demo-player.png', fullPage: true });
  await seek(page, 1);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'idle');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(1.4);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime);
  await page.waitForTimeout(350);
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime)).toBe(
    paused,
  );
  await page.getByLabel('播放速度').selectOption('0.5');
  await seek(page, 3);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'sway');
  await page.getByRole('button', { name: '返回工作台', exact: true }).click();
  expect(await videoNode.evaluate((v) => v.isConnected)).toBe(true);
  await expect(page.getByRole('button', { name: '打开作品', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/demo-editor.png', fullPage: true });
  expect(
    await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime),
  ).toBeCloseTo(3, 1);
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).playbackRate)).toBe(
    0.5,
  );
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  await seek(page, 23.5);
  await expect(page.getByTestId('special-cue')).toContainText('准备招牌动作');
  await seek(page, 24.4);
  await expect(page.getByTestId('special-cue')).toContainText('就是现在');
  await seek(page, 26);
  await expect(page.getByTestId('special-cue')).not.toContainText('就是现在');
  await page.getByLabel('播放速度').selectOption('1');
  await seek(page, 266.4);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).ended))
    .toBe(true);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
});

test('SPECIAL 五轨同步飞入与爆发，持续结束、暂停回拖、连续事件和减弱动态效果', async ({ page }) => {
  const chart = await emptyEditor(page);
  chart.title = 'SPECIAL 演出测试';
  chart.specialMove = { name: 'HEART POSE', icon: 'heart', previewBeats: 4 };
  chart.specialEvents = [
    { id: 'special-tap', timeMs: 5000 },
    { id: 'special-hold', timeMs: 8000, endTimeMs: 10000 },
    { id: 'special-next', timeMs: 10400 },
  ];
  chart.notes = [
    { id: 'normal', lane: 'punch', direction: 'right', kind: 'tap', timeMs: 5000 },
    {
      id: 'normal-hold',
      lane: 'step',
      direction: 'left',
      kind: 'hold',
      modifier: 'none',
      timeMs: 4000,
      endTimeMs: 6000,
    },
  ];
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'special-effects.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: chart.title })).toBeVisible();
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  const flying = page.getByTestId('special-flying');
  const bursts = page.getByTestId('special-burst');
  await seek(page, 2.9);
  await expect(flying).toHaveCount(0);
  await seek(page, 3.5);
  await expect(flying).toHaveCount(5);
  expect(
    await flying.evaluateAll((els) => els.map((el) => (el as HTMLElement).style.left)),
  ).toEqual(Array(5).fill('22%'));
  await seek(page, 4.2);
  await expect(page.locator('.special-token .lucide-heart')).toHaveCount(5);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.screenshot({
      path: `artifacts/special-flight-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await seek(page, 5.14);
  await expect(flying).toHaveCount(0);
  await expect(bursts).toHaveCount(5);
  await expect(bursts.locator('.special-shard')).toHaveCount(70);
  for (const lane of LANES)
    await expect(page.getByTestId(`lane-${lane.id}`).getByTestId('special-burst')).toHaveCount(1);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'holding');
  const frozenFrame = await bursts.evaluateAll((els) => els.map((el) => el.innerHTML));
  await page.waitForTimeout(180);
  expect(await bursts.evaluateAll((els) => els.map((el) => el.innerHTML))).toEqual(frozenFrame);
  await page.screenshot({ path: 'artifacts/special-burst-1920.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: 'artifacts/special-burst-1280.png', fullPage: true });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(bursts).toHaveCount(0);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await seek(page, 9);
  await expect(page.getByTestId('special-holding')).toHaveCount(5);
  await expect(bursts).toHaveCount(0);
  await expect(page.locator('.special-hold-ring circle').first()).toHaveAttribute(
    'stroke-dashoffset',
    '0.5',
  );
  await page.screenshot({ path: 'artifacts/special-hold.png', fullPage: true });
  await seek(page, 10.1);
  await expect(bursts).toHaveCount(5);
  await expect(bursts.first()).toHaveAttribute('data-kind', 'release');
  await expect(page.getByTestId('special-holding')).toHaveCount(0);
  await expect(flying).toHaveCount(5);
  await seek(page, 10.5);
  await expect(bursts).toHaveCount(10);
  await seek(page, 11.3);
  await expect(page.locator('.special-lane-effect')).toHaveCount(0);
  await seek(page, 5.14);
  expect(await bursts.evaluateAll((els) => els.map((el) => el.innerHTML))).toEqual(frozenFrame);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(bursts.locator('.special-shard').first()).not.toBeVisible();
  await expect(bursts.locator('.special-flare').first()).not.toBeVisible();
  await expect(bursts.locator('.special-echo').first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seek(page, 2);
  await expect(page.locator('.special-lane-effect')).toHaveCount(0);
  // The same song-level symbol drives all five rows; changing it does not duplicate chart events.
  await page.getByRole('button', { name: '返回工作台', exact: true }).click();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  for (const icon of ['star', 'sparkles']) {
    await page.getByLabel('SPECIAL 图标').selectOption(icon);
    await seek(page, 4.2);
    await expect(page.locator(`.special-token .lucide-${icon}`)).toHaveCount(5);
  }
  expect((await exportChart(page)).specialEvents).toEqual(chart.specialEvents);
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await expect(flying).toHaveCount(5);
  await page.screenshot({ path: 'artifacts/special-sparkles-fullscreen.png', fullPage: true });
});

test('鼠标做谱、长条属性、拖动缩放、撤销、复制和 JSON 往返', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '3 出拳', exact: true }).click();
  await page.getByRole('button', { name: '放置方向→', exact: true }).click();
  await draw(page, 3000, 2);
  await expect(page.getByTestId('editor-note')).toHaveCount(1);
  let chart = await exportChart(page);
  expect(chart.notes[0].direction).toBe('right');
  expect(chart.notes[0].timeMs).toBe(3000);
  await draw(page, 1000, 0, 2500);
  await expect(page.getByTestId('editor-note')).toHaveCount(2);
  await page.getByLabel('选中事件类型').selectOption('sway');
  chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({
    kind: 'hold',
    timeMs: 1000,
    endTimeMs: 2500,
    modifier: 'sway',
  });
  const hold = page.locator('.timeline-event.long');
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 14);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 14, { steps: 5 });
  await page.mouse.up();
  chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({ timeMs: 1500, endTimeMs: 3000 });
  const endBox = (await hold.locator('[data-handle="end"]').boundingBox())!;
  await page.mouse.move(endBox.x + 3, endBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(endBox.x + 53, endBox.y + 10, { steps: 5 });
  await page.mouse.up();
  chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({ timeMs: 1500, endTimeMs: 3500 });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByLabel('结束 / ms')).toHaveValue('3000');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByLabel('结束 / ms')).toHaveValue('3500');
  await page.getByRole('button', { name: '复制到后面', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(3);
  await page.getByRole('button', { name: '删除选中', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'roundtrip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect(await exportChart(page)).toEqual(chart);
});

test('选中单个 TAP 直接拉长为 HOLD，支持 STEP、吸附、取消和一次撤销', async ({ page }) => {
  await emptyEditor(page);
  await draw(page, 1000, 0);
  const tap = (await exportChart(page)).notes[0];
  const handle = page.getByTestId('extend-note');
  await expect(handle).toBeVisible();
  await handle.click();
  expect((await exportChart(page)).notes).toEqual([tap]);
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await page.screenshot({ path: 'artifacts/tap-extend-handle.png', fullPage: true });
  const surface = page.locator('.timeline-surface');
  const handleBox = (await handle.boundingBox())!;
  const surfaceBox = (await surface.boundingBox())!;
  await page.mouse.move(handleBox.x + 6, handleBox.y + 10);
  await page.mouse.down();
  // 2470 ms snaps to 2500 ms, while the original 1000 ms start remains fixed.
  await page.mouse.move(surfaceBox.x + 124 + 247, handleBox.y + 10, { steps: 8 });
  await expect(page.getByTestId('editor-note')).toHaveClass(/long/);
  await page.mouse.up();
  const extended = { ...tap, kind: 'hold', endTimeMs: 2500, modifier: 'none' };
  expect((await exportChart(page)).notes).toEqual([extended]);
  await expect(page.getByLabel('开始 / ms')).toHaveValue('1000');
  await expect(page.getByLabel('结束 / ms')).toHaveValue('2500');
  await expect(handle).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual([tap]);
  await expect(handle).toBeVisible();
  await page.getByRole('button', { name: '重做', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual([extended]);
  await page.getByRole('button', { name: '4 踏步', exact: true }).click();
  await page.getByRole('button', { name: '放置方向R', exact: true }).click();
  await draw(page, 4000, 3);
  const step = (await exportChart(page)).notes[1];
  await expect(handle).toBeVisible();
  const stepBox = (await handle.boundingBox())!;
  // Moving vertically or returning to the original grip keeps a TAP.
  await page.mouse.move(stepBox.x + 6, stepBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(stepBox.x + 6, stepBox.y + 30, { steps: 3 });
  await page.mouse.up();
  expect((await exportChart(page)).notes[1]).toEqual(step);
  await page.mouse.move(stepBox.x + 6, stepBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(stepBox.x + 100, stepBox.y + 10, { steps: 4 });
  await page.mouse.move(stepBox.x + 6, stepBox.y + 10, { steps: 4 });
  await page.mouse.up();
  expect((await exportChart(page)).notes[1]).toEqual(step);
  // Native pointer cancellation must also discard the conversion preview.
  await page.mouse.move(stepBox.x + 6, stepBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(stepBox.x + 100, stepBox.y + 10, { steps: 4 });
  await surface.dispatchEvent('pointercancel');
  await page.mouse.up();
  expect((await exportChart(page)).notes[1]).toEqual(step);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.mouse.move(stepBox.x + 6, stepBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(surfaceBox.x + 124 + 583, stepBox.y + 10, { steps: 6 });
  await page.mouse.up();
  let chart = await exportChart(page);
  expect(chart.notes[1]).toEqual({ ...step, kind: 'hold', endTimeMs: 5830, modifier: 'none' });
  await page.getByLabel('选中事件类型').selectOption('sway');
  chart = await exportChart(page);
  expect(chart.notes[1]).toMatchObject({ lane: 'step', direction: 'right', modifier: 'sway' });
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'extended.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect(await exportChart(page)).toEqual(chart);
  await draw(page, 6500, 1);
  await page.keyboard.down('Shift');
  await page
    .getByTestId('editor-note')
    .first()
    .click({ position: { x: 15, y: 14 } });
  await page.keyboard.up('Shift');
  await expect(page.locator('.timeline-event.selected')).toHaveCount(2);
  await expect(handle).toHaveCount(0);
});

test('分段节拍、唯一 SPECIAL 重复事件、网格修改不移动音符', async ({ page }) => {
  await emptyEditor(page);
  await draw(page, 2000, 1);
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  await page.getByLabel('BPM', { exact: true }).fill('150');
  await page.getByLabel('BPM', { exact: true }).press('Tab');
  await seek(page, 34);
  await page.getByRole('button', { name: '当前位置新增段', exact: true }).click();
  await page.getByLabel('拍号').selectOption('3/4');
  await expect(page.getByLabel('本段 Offset / ms')).toHaveValue('34000');
  let chart = await exportChart(page);
  expect(chart.tempoSegments).toHaveLength(2);
  expect(chart.notes[0].timeMs).toBe(2000);
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await page.getByLabel('启用本曲 SPECIAL').check();
  await page.getByLabel('招牌动作名称').fill('HEART POSE');
  await page.getByLabel('招牌动作名称').press('Tab');
  await draw(page, 4000, LANES.length, 4800);
  await page.getByRole('button', { name: '复制到后面', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.specialMove?.name).toBe('HEART POSE');
  expect(chart.specialEvents).toHaveLength(2);
  expect(chart.specialEvents.every((e) => e.endTimeMs! > e.timeMs)).toBe(true);
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'special.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect(await exportChart(page)).toEqual(chart);
});

test('自动 TAP / HOLD / Ctrl+SWAY、12345 切轨、慢放时长与未完成录入取消', async ({ page }) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByLabel('播放速度').selectOption('0.5');
  await seek(page, 10);
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.keyboard.press('3');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(60);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  let chart = await exportChart(page);
  expect(chart.notes).toHaveLength(1);
  expect(chart.notes[0]).toMatchObject({ lane: 'punch', kind: 'tap', direction: 'left' });
  expect(chart.notes[0].timeMs).toBeGreaterThanOrEqual(10000);
  expect(chart.notes[0].timeMs).toBeLessThan(12000);
  await seek(page, 12);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.keyboard.press('1');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.press('2');
  await page.waitForTimeout(650);
  await page.keyboard.up('ArrowDown');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(2);
  expect(chart.notes[1]).toMatchObject({ lane: 'squat', kind: 'hold', modifier: 'none' });
  expect((chart.notes[1] as any).endTimeMs - chart.notes[1].timeMs).toBeGreaterThan(200);
  expect((chart.notes[1] as any).endTimeMs - chart.notes[1].timeMs).toBeLessThan(1000);
  await expect(page.getByRole('button', { name: '2 提踵', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await seek(page, 14);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.up('Control');
  await page.waitForTimeout(650);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('5');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  expect(chart.notes[2]).toMatchObject({
    lane: 'calf_raise',
    kind: 'hold',
    modifier: 'sway',
    direction: 'up',
  });
  expect(chart.notes[3]).toMatchObject({ lane: 'side_crunch', kind: 'tap', direction: 'right' });
  await page.getByLabel('吸附', { exact: true }).selectOption('1');
  await seek(page, 18);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(310);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(5);
  expect(chart.notes[4]).toMatchObject({
    kind: 'hold',
    modifier: 'none',
    timeMs: 18000,
    endTimeMs: 18500,
  });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.keyboard.down('ArrowLeft');
  await seek(page, 50);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  expect((await exportChart(page)).notes).toHaveLength(5);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.keyboard.down('ArrowLeft');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.keyboard.up('ArrowLeft');
  expect((await exportChart(page)).notes).toHaveLength(5);
});

test('方向翻转按钮和 F、多选撤销、同轴跨轨拖动与长条属性保留', async ({ page }) => {
  await emptyEditor(page);
  await draw(page, 1000, 0, 2000);
  await page.getByLabel('选中事件类型').selectOption('sway');
  await page.getByRole('button', { name: '反转方向', exact: true }).click();
  expect((await exportChart(page)).notes[0]).toMatchObject({ direction: 'up', modifier: 'sway' });
  await page.keyboard.press('f');
  expect((await exportChart(page)).notes[0].direction).toBe('down');
  const dragLane = async (note: ReturnType<Page['getByTestId']>, rows: number) => {
    const box = (await note.boundingBox())!;
    await page.mouse.move(box.x + 15, box.y + 14);
    await page.mouse.down();
    await page.mouse.move(box.x + 15, box.y + 14 + rows * 54, { steps: 6 });
    await page.mouse.up();
  };
  await dragLane(page.getByTestId('editor-note').first(), 1);
  let chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({
    lane: 'calf_raise',
    direction: 'down',
    timeMs: 1000,
    endTimeMs: 2000,
    modifier: 'sway',
  });
  await page.keyboard.press('Control+z');
  expect((await exportChart(page)).notes[0].lane).toBe('squat');
  await page.keyboard.press('Control+Shift+z');
  await dragLane(page.getByTestId('editor-note').first(), -1);
  expect((await exportChart(page)).notes[0].lane).toBe('squat');
  await dragLane(page.getByTestId('editor-note').first(), 2);
  expect((await exportChart(page)).notes[0].lane).toBe('squat');
  await draw(page, 3000, 2);
  await dragLane(page.getByTestId('editor-note').last(), 2);
  expect((await exportChart(page)).notes[1].lane).toBe('side_crunch');
  await dragLane(page.getByTestId('editor-note').last(), -2);
  expect((await exportChart(page)).notes[1].lane).toBe('punch');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('f');
  chart = await exportChart(page);
  expect(chart.notes.map((n) => n.direction)).toEqual(['up', 'right']);
  await page.keyboard.press('Control+z');
  expect((await exportChart(page)).notes.map((n) => n.direction)).toEqual(['down', 'left']);
});

test('跟随默认锁定，编辑与空格暂停不取消，解锁后可手动关闭', async ({ page }) => {
  await emptyEditor(page);
  const lock = page.getByRole('button', { name: '锁定跟随', exact: true });
  const follow = page.getByRole('checkbox', { name: '跟随', exact: true });
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(follow).toBeChecked();
  await expect(follow).toBeDisabled();
  await draw(page, 1000, 0);
  await expect(follow).toBeChecked();
  await seek(page, 30);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(() => page.locator('.timeline-scroll').evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(2000);
  await lock.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(follow).toBeChecked();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await lock.click();
  await follow.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await expect(follow).toBeChecked();
  await follow.uncheck();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await expect(follow).not.toBeChecked();
  await lock.click();
  await expect(follow).toBeChecked();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  for (const [key, label] of [
    ['1', '1 蹲起'],
    ['2', '2 提踵'],
    ['3', '3 出拳'],
    ['4', '4 踏步'],
    ['5', '5 侧收腹'],
  ]) {
    await page.keyboard.press(key);
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
});

test('非法谱面不丢编辑、未保存保护、自动草稿、720p 和 1080p 布局', async ({ page }) => {
  await emptyEditor(page);
  await draw(page, 2000, 0);
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByTestId('editor-note')).toHaveCount(1);
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":999}'),
  });
  await expect(page.getByRole('status')).toContainText('不支持此谱面版本');
  await expect(page.getByTestId('editor-note')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('waifu-fit-player-draft-v1')))
    .not.toBeNull();
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await expect(page.locator('.timeline-scroll')).toBeVisible();
    await page.screenshot({ path: `artifacts/editor-${viewport.width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.screenshot({ path: `artifacts/player-${viewport.width}.png`, fullPage: true });
  }
});

test('框选、键盘粘贴、输入框隔离和浏览器草稿恢复', async ({ page }) => {
  await emptyEditor(page);
  await draw(page, 1000, 0);
  await draw(page, 1500, 1);
  await page.getByRole('button', { name: '选择工具', exact: true }).click();
  const box = (await page.locator('.timeline-surface').boundingBox())!;
  await page.mouse.move(box.x + 195, box.y + 34);
  await page.mouse.down();
  await page.mouse.move(box.x + 315, box.y + 135, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.timeline-event.selected')).toHaveCount(2);
  await page.keyboard.press('Control+c');
  await seek(page, 5);
  await page.keyboard.press('Control+v');
  let chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  expect(chart.notes.slice(2).map((n) => n.timeMs)).toEqual([5000, 5500]);
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.getByRole('button', { name: '节拍段', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByLabel('BPM', { exact: true }).focus();
  await page.keyboard.press('ArrowUp');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  await page.getByLabel('BPM', { exact: true }).fill('133');
  await page.getByLabel('BPM', { exact: true }).press('Tab');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('waifu-fit-player-draft-v1') || '{}').tempoSegments?.[0]
            ?.bpm,
      ),
    )
    .toBe(133);
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: /恢复上次的本地草稿/ }).click();
  await expect(page.getByRole('heading', { name: '浏览器测试作品' })).toBeVisible();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  expect(chart.tempoSegments[0].bpm).toBe(133);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
});

test('STEP 鼠标做谱、反向与跨轨、保存重开、五轨配色和消失反馈', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '4 踏步', exact: true }).click();
  await page.getByRole('button', { name: '放置方向L', exact: true }).click();
  await draw(page, 1000, 3);
  await page.getByRole('button', { name: '放置方向R', exact: true }).click();
  await draw(page, 2000, 3, 3000);
  await page.getByRole('button', { name: '放置方向L', exact: true }).click();
  await draw(page, 4000, 3, 5000);
  await page.getByLabel('选中事件类型').selectOption('sway');
  await page.getByRole('button', { name: '反转方向', exact: true }).click();
  expect((await exportChart(page)).notes[2]).toMatchObject({
    lane: 'step',
    direction: 'right',
    modifier: 'sway',
  });
  await page.keyboard.press('Control+z');
  let chart = await exportChart(page);
  expect(chart.notes).toMatchObject([
    { lane: 'step', direction: 'left', kind: 'tap', timeMs: 1000 },
    {
      lane: 'step',
      direction: 'right',
      kind: 'hold',
      timeMs: 2000,
      endTimeMs: 3000,
      modifier: 'none',
    },
    {
      lane: 'step',
      direction: 'left',
      kind: 'hold',
      timeMs: 4000,
      endTimeMs: 5000,
      modifier: 'sway',
    },
  ]);
  // STEP ↔ side crunch ↔ punch preserves a long note, including SWAY.
  const longNote = page.getByTestId('editor-note').last();
  for (const [rows, lane] of [
    [1, 'side_crunch'],
    [-2, 'punch'],
    [1, 'step'],
  ] as const) {
    const box = (await longNote.boundingBox())!;
    await page.mouse.move(box.x + 15, box.y + 14);
    await page.mouse.down();
    await page.mouse.move(box.x + 15, box.y + 14 + rows * 54, { steps: 6 });
    await page.mouse.up();
    expect((await exportChart(page)).notes[2]).toMatchObject({
      lane,
      direction: 'left',
      modifier: 'sway',
      timeMs: 4000,
      endTimeMs: 5000,
    });
  }
  chart = await exportChart(page);
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await page.screenshot({ path: 'artifacts/step-editor.png', fullPage: true });
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'step.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: '浏览器测试作品' })).toBeVisible();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  expect(await exportChart(page)).toEqual(chart);
  await expect(
    page.locator('.timeline-event[data-lane="step"][data-direction="right"] .event-glyph'),
  ).toHaveCSS('background-color', 'rgb(246, 78, 147)');
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  const lanes = page.locator('.play-lane');
  if (await page.getByRole('button', { name: '关闭提示', exact: true }).isVisible())
    await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  expect(
    await lanes.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-lane'))),
  ).toEqual(['squat', 'calf_raise', 'punch', 'step', 'side_crunch']);
  const pink = await page
    .locator('.play-button')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  for (const lane of ['squat', 'punch'])
    await expect(page.getByTestId(`lane-${lane}`).locator('.lane-label')).toHaveCSS(
      'background-color',
      pink,
    );
  for (const lane of ['calf_raise', 'side_crunch'])
    await expect(page.getByTestId(`lane-${lane}`).locator('.lane-label')).toHaveCSS(
      'background-color',
      'rgb(57, 197, 187)',
    );
  await seek(page, 0.5);
  await expect(page.getByTestId('lane-step').locator('.player-note')).toHaveText('L');
  await expect(page.getByTestId('lane-step').locator('.player-note')).toHaveCSS(
    'background-color',
    'rgb(53, 201, 219)',
  );
  await expect(page.getByTestId('lane-step').locator('.hold-head').first()).toHaveText('R');
  await expect(page.getByTestId('lane-step').locator('.hold-head').first()).toHaveCSS(
    'background-color',
    pink,
  );
  await seek(page, 1.08);
  const impact = page.getByTestId('impact-step');
  await expect(impact).toHaveClass(/arrival/);
  await expect(impact.locator('.impact-particle')).toHaveCount(4);
  const frozen = await impact.getAttribute('style');
  const ringTransform = await impact.locator('.impact-ring').getAttribute('style');
  await page.waitForTimeout(150);
  expect(await impact.getAttribute('style')).toBe(frozen);
  expect(await impact.locator('.impact-ring').getAttribute('style')).toBe(ringTransform);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    for (const target of await page.locator('.hit-target').all()) {
      const bounds = (await target.boundingBox())!;
      const row = (await target.locator('..').boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(row.y - 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(row.y + row.height + 1);
    }
    await page.screenshot({ path: `artifacts/step-player-${viewport.width}.png`, fullPage: true });
  }
  await seek(page, 1.4);
  await expect(impact).toHaveCount(0);
  await seek(page, 2.5);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'holding');
  await expect(page.getByTestId('target-step')).toHaveText('R');
  await expect(page.getByTestId('target-step')).toHaveCSS('background-color', pink);
  await seek(page, 4.5);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'sway');
  await expect(page.getByTestId('target-step')).toHaveText('L');
  await expect(page.getByTestId('target-step')).toHaveCSS('background-color', 'rgb(53, 201, 219)');
  await page.screenshot({ path: 'artifacts/step-sway.png', fullPage: true });
  await seek(page, 5.08);
  await expect(impact).toHaveClass(/release/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(impact.locator('.impact-particle').first()).not.toBeVisible();
  await expect(impact.locator('.impact-halo')).not.toBeVisible();
  await seek(page, 5.5);
  await expect(impact).toHaveCount(0);
  await seek(page, 0.5);
  await expect(impact).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await expect(lanes).toHaveCount(5);
  await expect(page.getByLabel('舞蹈视频')).toBeVisible();
  await page.screenshot({ path: 'artifacts/step-fullscreen.png', fullPage: true });
});

test('类型菜单直接绘制 SWAY，HOLD 与 SWAY 互转保留时长，切到 C 保留自由摇摆', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '4 踏步', exact: true }).click();
  await page.getByRole('button', { name: '放置方向R', exact: true }).click();
  await page.getByLabel('绘制踏步跨度').selectOption('2');
  const drawingType = page.getByLabel('绘制类型');
  const selectedType = page.getByLabel('选中事件类型');
  await expect(drawingType.locator('option')).toHaveText([
    '普通 TAP',
    '单脚支撑 HOLD',
    '重心摇摆 SWAY',
  ]);
  await expect(page.getByRole('checkbox', { name: /SWAY/ })).toHaveCount(0);
  await drawingType.selectOption('sway');
  await draw(page, 1000, 3, 2500);
  const original = (await exportChart(page)).notes[0];
  expect(original).toMatchObject({
    lane: 'step',
    direction: 'right',
    distance: 2,
    kind: 'hold',
    modifier: 'sway',
    timeMs: 1000,
    endTimeMs: 2500,
  });
  await expect(selectedType).toHaveValue('sway');
  await selectedType.selectOption('hold');
  expect((await exportChart(page)).notes[0]).toEqual({ ...original, modifier: 'none' });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(selectedType).toHaveValue('sway');
  expect((await exportChart(page)).notes[0]).toEqual(original);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(selectedType).toHaveValue('hold');
  await selectedType.selectOption('sway');
  expect((await exportChart(page)).notes[0]).toEqual(original);
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await page.screenshot({ path: 'artifacts/sway-type-menus.png', fullPage: true });
  // TAP conversions retain identity/direction/distance and only create a new end when needed.
  await selectedType.selectOption('tap');
  const tap = (await exportChart(page)).notes[0];
  expect(tap).toEqual({
    id: original.id,
    lane: 'step',
    direction: 'right',
    distance: 2,
    kind: 'tap',
    timeMs: 1000,
  });
  await selectedType.selectOption('sway');
  expect((await exportChart(page)).notes[0]).toEqual({
    ...tap,
    kind: 'hold',
    modifier: 'sway',
    endTimeMs: 1500,
  });
  await page.getByRole('button', { name: '放置方向C', exact: true }).click();
  await expect(drawingType).toHaveValue('sway');
  await expect(drawingType.locator('option')).toHaveText(['普通 TAP', '慢速合腿', '自由摇摆 SWAY']);
  await draw(page, 4000, 3, 5000);
  await expect(selectedType).toHaveValue('sway');
  expect((await exportChart(page)).notes[1]).toMatchObject({
    direction: 'close',
    kind: 'hold',
    modifier: 'sway',
    timeMs: 4000,
    endTimeMs: 5000,
  });
  await page.getByRole('button', { name: '放置方向R', exact: true }).click();
  await expect(drawingType).toHaveValue('sway');
  await drawingType.selectOption('tap');
  await draw(page, 6000, 3);
  await draw(page, 7000, 3, 8000);
  const chart = await exportChart(page);
  expect(chart.notes[2]).toMatchObject({ kind: 'tap', distance: 2 });
  expect(chart.notes[3]).toMatchObject({ kind: 'hold', modifier: 'none', distance: 2 });
});

test('C 自由 SWAY 原地绘制、HOLD 转换、保存重开和跟练提示', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '4 踏步', exact: true }).click();
  await page.getByRole('button', { name: '放置方向C', exact: true }).click();
  await page.getByLabel('绘制类型').selectOption('sway');
  await draw(page, 1000, 3, 3000);
  await expect(page.locator('.step-checks summary')).toContainText('检查通过');
  await expect(page.getByTestId('editor-note')).toHaveClass(/sway/);
  const original = (await exportChart(page)).notes[0];
  expect(original).toMatchObject({
    lane: 'step',
    direction: 'close',
    kind: 'hold',
    modifier: 'sway',
    timeMs: 1000,
    endTimeMs: 3000,
  });
  expect(original.distance).toBeUndefined();
  await page.getByLabel('选中事件类型').selectOption('hold');
  await expect(page.getByLabel('结束 / ms')).toHaveValue('3000');
  await expect(page.locator('.step-checks summary')).toContainText('需检查');
  await page.getByLabel('选中事件类型').selectOption('sway');
  await expect(page.locator('.step-checks summary')).toContainText('检查通过');
  expect((await exportChart(page)).notes[0]).toEqual(original);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByLabel('选中事件类型')).toHaveValue('hold');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByLabel('选中事件类型')).toHaveValue('sway');
  const chart = await exportChart(page);
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'free-sway.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect(await exportChart(page)).toEqual(chart);
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await seek(page, 1.5);
  const target = page.getByTestId('target-step');
  await expect(target).toHaveText('C');
  await expect(target).toHaveAttribute('data-state', 'sway');
  await expect(target).toHaveAttribute('data-action', '自由摇摆');
  await expect(target).toHaveCSS('background-color', 'rgb(165, 138, 212)');
  await expect(page.getByTestId('lane-step').locator('.hold-caption')).toHaveText('自由摇摆');
  await page.screenshot({ path: 'artifacts/step-free-sway.png', fullPage: true });
  await seek(page, 3.1);
  await expect(page.getByTestId('lane-step').locator('.release-label')).toHaveText('释放');
});

test('STEP 按键录入 TAP、HOLD 和 Ctrl+SWAY，拒绝上方向', async ({ page }) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.keyboard.press('4');
  await expect(page.getByRole('button', { name: '4 踏步', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await seek(page, 1);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  expect((await exportChart(page)).notes).toMatchObject([
    { lane: 'step', kind: 'tap', direction: 'left' },
  ]);
  await seek(page, 3);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await seek(page, 5);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('Control');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const chart = await exportChart(page);
  expect(chart.notes).toHaveLength(3);
  expect(chart.notes[1]).toMatchObject({
    lane: 'step',
    kind: 'hold',
    direction: 'right',
    modifier: 'none',
  });
  expect(chart.notes[2]).toMatchObject({
    lane: 'step',
    kind: 'hold',
    direction: 'left',
    modifier: 'sway',
  });
  for (const note of chart.notes.slice(1)) {
    expect(note.kind === 'hold' && note.endTimeMs - note.timeMs).toBeGreaterThan(250);
    expect(note.kind === 'hold' && note.endTimeMs - note.timeMs).toBeLessThan(1200);
  }
});

test('C 慢合腿、两格编辑与站位提示，保存后播放动作和配色一致', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '4 踏步', exact: true }).click();
  await draw(page, 1000, 3, 1500);
  await page.getByRole('button', { name: '放置方向C', exact: true }).click();
  await expect(page.getByLabel('绘制踏步跨度')).toHaveCount(0);
  await expect(page.getByLabel('绘制类型').locator('option[value="sway"]')).toHaveText(
    '自由摇摆 SWAY',
  );
  await draw(page, 2000, 3);
  const grip = (await page.getByTestId('extend-note').boundingBox())!;
  const surface = (await page.locator('.timeline-surface').boundingBox())!;
  await page.mouse.move(grip.x + 6, grip.y + 10);
  await page.mouse.down();
  await page.mouse.move(surface.x + 124 + 250, grip.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByLabel('选中事件类型').locator('option[value="sway"]')).toHaveText(
    '自由摇摆 SWAY',
  );
  await expect(page.getByLabel('选中事件类型').locator('option:checked')).toHaveText('慢速合腿');
  await page.getByRole('button', { name: '放置方向R', exact: true }).click();
  await page.getByLabel('绘制踏步跨度').selectOption('2');
  await draw(page, 3000, 3);
  await page.keyboard.press('d');
  await expect(page.getByLabel('选中踏步跨度', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: '切换选中踏步跨度', exact: true }).click();
  await expect(page.getByLabel('选中踏步跨度', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: '放置方向C', exact: true }).click();
  await draw(page, 4000, 3);
  await page.getByRole('button', { name: '放置方向L', exact: true }).click();
  await draw(page, 5000, 3, 6000);
  await page.getByLabel('选中事件类型').selectOption('sway');
  await page.getByLabel('选中音符方向').selectOption('close');
  let chart = await exportChart(page);
  expect(chart.notes[4]).toMatchObject({ direction: 'close', modifier: 'sway', kind: 'hold' });
  expect(chart.notes[4].distance).toBeUndefined();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.getByRole('button', { name: '放置方向C', exact: true }).click();
  await draw(page, 6500, 3);
  chart = await exportChart(page);
  expect(chart.notes).toMatchObject([
    { direction: 'left', kind: 'hold', timeMs: 1000, endTimeMs: 1500, modifier: 'none' },
    { direction: 'close', kind: 'hold', timeMs: 2000, endTimeMs: 2500, modifier: 'none' },
    { direction: 'right', kind: 'tap', timeMs: 3000, distance: 2 },
    { direction: 'close', kind: 'tap', timeMs: 4000 },
    {
      direction: 'left',
      kind: 'hold',
      timeMs: 5000,
      endTimeMs: 6000,
      distance: 2,
      modifier: 'sway',
    },
    { direction: 'close', kind: 'tap', timeMs: 6500 },
  ]);
  await expect(page.locator('.step-checks summary')).toContainText('检查通过');
  // A batch distance change leaves C intact and is one undoable edit.
  await page.keyboard.press('Control+a');
  await page.getByLabel('选中踏步跨度', { exact: true }).selectOption('1');
  expect((await exportChart(page)).notes.every((n) => n.distance === undefined)).toBe(true);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.getByRole('button', { name: '选择工具', exact: true }).click();
  await draw(page, 7500, 3);
  await page.getByTestId('editor-note').nth(2).click();
  await page.keyboard.press('f');
  await expect(page.getByLabel('选中踏步跨度', { exact: true })).toHaveValue('2');
  await expect(page.locator('.step-checks summary')).toContainText('需检查');
  await page.locator('.step-checks summary').click();
  await page.getByRole('button', { name: /00:03\.000 L2 会超出三格毯子/ }).click();
  await expect(page.getByLabel('开始 / ms')).toHaveValue('3000');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('.step-checks summary')).toContainText('检查通过');
  await page.locator('.step-checks summary').click();
  chart = await exportChart(page);
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await page.screenshot({ path: 'artifacts/step-close-editor.png', fullPage: true });
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'step-close.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: '浏览器测试作品' })).toBeVisible();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  expect(await exportChart(page)).toEqual(chart);
  await expect(
    page.locator('.timeline-event[data-direction="close"] .event-glyph').first(),
  ).toHaveCSS('background-color', 'rgb(165, 138, 212)');
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  const target = page.getByTestId('target-step');
  await seek(page, 1.25);
  await expect(target).toHaveAttribute('data-action', '左脚支撑');
  await seek(page, 2.25);
  await expect(target).toHaveText('C');
  await expect(target).toHaveAttribute('data-action', '慢速合腿');
  await expect(target).toHaveCSS('background-color', 'rgb(165, 138, 212)');
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.screenshot({
      path: `artifacts/step-close-player-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await seek(page, 2.58);
  await expect(page.getByTestId('lane-step').locator('.release-label')).toHaveText('并拢');
  await seek(page, 5.5);
  await expect(target).toHaveText('L2');
  await expect(target).toHaveAttribute('data-state', 'sway');
  await expect(target).toHaveAttribute('data-action', '重心摇摆');
  await page.screenshot({ path: 'artifacts/step-double-sway.png', fullPage: true });
});

test('STEP 录 C、Shift 两格、Ctrl+Shift 摇摆，组合键与切轨不改变正在录的音符', async ({ page }) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.keyboard.press('4');
  const start = async (seconds: number) => {
    await seek(page, seconds);
    await page.getByRole('button', { name: '播放', exact: true }).click();
  };
  const stop = () => page.getByRole('button', { name: '暂停', exact: true }).click();
  await start(1);
  await page.keyboard.press('ArrowLeft');
  await stop();
  await start(2);
  await page.keyboard.press('ArrowDown');
  await stop();
  await start(3);
  await page.keyboard.press('Shift+ArrowRight');
  await stop();
  await start(4);
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('Control');
  await stop();
  await start(5);
  await page.keyboard.down('Shift');
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await page.keyboard.press('5');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowLeft');
  await stop();
  await page.keyboard.press('4');
  await start(6);
  await page.keyboard.press('ArrowDown');
  await stop();
  await start(7);
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  await stop();
  await page.keyboard.press('3');
  await start(8);
  await page.keyboard.press('Shift+ArrowLeft');
  await stop();
  const chart = await exportChart(page);
  expect(chart.notes).toMatchObject([
    { lane: 'step', direction: 'left', kind: 'tap' },
    { lane: 'step', direction: 'close', kind: 'tap' },
    { lane: 'step', direction: 'right', kind: 'tap', distance: 2 },
    { lane: 'step', direction: 'close', kind: 'hold', modifier: 'sway' },
    { lane: 'step', direction: 'left', kind: 'hold', modifier: 'sway', distance: 2 },
    { lane: 'step', direction: 'close', kind: 'tap' },
    { lane: 'step', direction: 'right', kind: 'hold', modifier: 'none', distance: 2 },
    { lane: 'punch', direction: 'left', kind: 'tap' },
  ]);
  for (const i of [0, 1, 3, 5, 7]) expect(chart.notes[i].distance).toBeUndefined();
  for (const i of [3, 4, 6]) {
    const note = chart.notes[i];
    expect(note.kind === 'hold' && note.endTimeMs - note.timeMs).toBeGreaterThan(250);
  }
});

test('实际本地 MP4 导入，新建第二首与全屏保留工作区', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '创建新谱面', exact: true }).click();
  await (await chooser).setFiles('public/demo.mp4');
  await expect(page.getByRole('heading', { name: 'demo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await draw(page, 2000, 3);
  const chart = await exportChart(page);
  expect(chart.notes).toHaveLength(1);
  expect(chart.videoHint.fileName).toBe('demo.mp4');
  await page.getByRole('button', { name: '跟练模式', exact: true }).click();
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.fullscreenElement?.classList.contains('album-workspace')),
    )
    .toBe(true);
  await expect(page.getByLabel('跟练五轨')).toBeVisible();
  await expect(page.getByLabel('舞蹈视频')).toBeVisible();
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await page.getByRole('button', { name: '返回工作台', exact: true }).click();
  const secondChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await secondChooser).setFiles('public/demo.mp4');
  await expect(page.getByTestId('editor-note')).toHaveCount(0);
  expect((await exportChart(page)).notes).toHaveLength(0);
});
