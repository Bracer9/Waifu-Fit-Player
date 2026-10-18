import { lastDraft, openDemo } from './helpers/project';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blankChart, LANES, type Chart } from '../src/model';
const errors: string[] = [];
async function stepChoice(page: Page, target: 'draw' | 'selected', value: string) {
  const [direction, type] = value.split('-');
  if (direction !== 'free') {
    await page
      .getByRole('button', {
        name:
          target === 'draw'
            ? `放置方向${direction === 'left' ? 'L' : 'R'}`
            : `选中踏步方向 ${direction === 'left' ? '←' : '→'}`,
        exact: true,
      })
      .click();
    if (target === 'draw')
      await page
        .getByRole('button', { name: `录入用脚 ${direction === 'left' ? 'L' : 'R'}`, exact: true })
        .click();
  }
  await page
    .getByLabel(target === 'draw' ? '绘制类型' : '选中事件类型')
    .selectOption(direction === 'free' ? 'free-sway' : type);
}
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
  await openDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
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
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
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
  for (const name of ['新建', '打开作品', '更换视频', '保存草稿', '导出 JSON', '操作帮助'])
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
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(1.4);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime);
  await page.waitForTimeout(350);
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime)).toBe(
    paused,
  );
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 0.5;
  });
  await seek(page, 3);
  await expect(page.getByTestId('target-squat')).toHaveAttribute('data-state', 'sway');
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  expect(await videoNode.evaluate((v) => v.isConnected)).toBe(true);
  await expect(page.getByRole('button', { name: '打开作品', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/demo-editor.png', fullPage: true });
  expect(
    await page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime),
  ).toBeCloseTo(3, 1);
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).playbackRate)).toBe(
    0.5,
  );
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await seek(page, 23.5);
  await expect(page.getByTestId('special-cue')).toContainText('GET READY');
  await seek(page, 24.4);
  await expect(page.getByTestId('special-cue')).toContainText('SPECIAL!');
  await seek(page, 26);
  await expect(page.getByTestId('special-cue')).not.toContainText('SPECIAL!');
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 1;
  });
  await seek(page, 266.4);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).ended))
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('音符与跟练统一英文，兼容旧 SPECIAL 名称并保持大小屏布局', async ({ page }) => {
  const chart = await emptyEditor(page);
  chart.title = 'ENGLISH LABEL CHECK';
  chart.specialMove = { name: '比心 / HEART POSE', icon: 'heart', previewBeats: 4 };
  chart.specialEvents = [{ id: 'legacy-special', timeMs: 5000, endTimeMs: 10000 }];
  chart.notes = LANES.map((lane) => ({
    id: lane.id,
    lane: lane.id,
    direction: lane.id === 'step' ? 'right' : lane.directions[0],
    kind: 'hold',
    timeMs: 3000,
    endTimeMs: 6000,
    modifier: lane.id === 'calf_raise' || lane.id === 'side_crunch' ? 'sway' : 'none',
  }));
  chart.notes.push(
    { id: 'open-step', lane: 'step', direction: 'left', timeMs: 2000, kind: 'tap' },
    {
      id: 'free-sway',
      lane: 'step',
      direction: 'free',
      timeMs: 7000,
      endTimeMs: 10000,
      kind: 'hold',
      modifier: 'sway',
    },
  );
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'english-labels.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.locator('.timeline-event')).toHaveCount(8);
  expect((await exportChart(page)).specialMove?.name).toBe('比心 / HEART POSE');
  for (const caption of await page.locator('.event-caption').allTextContents())
    expect(caption).not.toMatch(/\p{Script=Han}/u);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await seek(page, 3.5);
  await expect(page.locator('.hold-caption')).toHaveText([
    'HOLD',
    'SWAY',
    'HOLD',
    'BALANCE HOLD',
    'FREE SWAY',
    'SWAY',
  ]);
  await expect(page.locator('.lane-label strong')).toHaveText(LANES.map((lane) => lane.english));
  await expect(page.getByTestId('special-cue')).toContainText('GET READY');
  await expect(page.getByTestId('special-cue')).toContainText('HEART POSE');
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 1080 });
    expect(await page.locator('.practice').innerText()).not.toMatch(/\p{Script=Han}/u);
    expect(
      await page.evaluate(() => ({
        x: document.documentElement.scrollWidth > innerWidth,
        y: document.documentElement.scrollHeight > innerHeight,
      })),
    ).toEqual({ x: false, y: false });
    for (const label of await page.locator('.lane-label strong').all()) {
      expect(await label.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    }
    await page.screenshot({ path: `artifacts/english-player-${width}.png`, fullPage: true });
  }
  await seek(page, 7.2);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-action', 'FREE SWAY');
  await expect(page.getByTestId('special-cue')).toContainText('SPECIAL!');
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  chart.title = 'LEGACY LABEL CHECK';
  chart.specialMove.name = '比心';
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'legacy-chinese.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  await expect(page.getByRole('heading', { name: 'LEGACY LABEL CHECK' })).toBeVisible();
  await seek(page, 7.2);
  await expect(page.getByTestId('special-cue')).toContainText('HEART POSE');
  expect((await exportChart(page)).specialMove?.name).toBe('比心');
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
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  const flying = page.getByTestId('special-flying');
  const bursts = page.getByTestId('special-burst');
  await seek(page, 2.9);
  await expect(flying).toHaveCount(0);
  await seek(page, 3.5);
  await expect(flying).toHaveCount(5);
  const positions = await flying.evaluateAll((els) =>
    els.map((el) => {
      const token = el as HTMLElement;
      // Glyph sizes may be fractional; offsetWidth rounds them to whole pixels.
      const x =
        new DOMMatrixReadOnly(getComputedStyle(token).transform).m41 +
        parseFloat(getComputedStyle(token).width) / 2;
      return x / token.closest<HTMLElement>('.note-highway')!.clientWidth;
    }),
  );
  for (const position of positions) expect(position).toBeCloseTo(0.22, 3);
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
  await expect(bursts.locator('.special-burst-sprite')).toHaveCount(5);
  await expect(bursts.locator('.special-shard')).toHaveCount(0);
  for (const lane of LANES)
    await expect(page.getByTestId(`lane-${lane.id}`).getByTestId('special-burst')).toHaveCount(1);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'holding');
  const burstFrames = () =>
    bursts
      .locator('.special-burst-sprite')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.cssText));
  const frozenFrame = await burstFrames();
  expect(frozenFrame).toHaveLength(5);
  await page.waitForTimeout(180);
  expect(await burstFrames()).toEqual(frozenFrame);
  await page.screenshot({ path: 'artifacts/special-burst-1920.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: 'artifacts/special-burst-1280.png', fullPage: true });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(bursts).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await seek(page, 9);
  await expect(page.getByTestId('special-holding')).toHaveCount(5);
  await expect(bursts).toHaveCount(0);
  await expect(page.locator('.special-hold-strip')).toHaveCount(5);
  const remaining = await page
    .locator('.special-hold-strip')
    .first()
    .evaluate((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return (m.a * 256) / (el.closest<HTMLElement>('.note-highway')!.clientWidth * 0.88);
    });
  expect(remaining).toBeCloseTo(0.5, 3);
  await expect(page.locator('.special-hold-ring')).toHaveCount(0);
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
  expect(await burstFrames()).toEqual(frozenFrame);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(bursts.locator('.special-reduced-echo')).toHaveCount(5);
  await expect(bursts.locator('.special-burst-sprite')).toHaveCount(0);
  await expect(bursts.locator('.special-wave').first()).not.toBeVisible();
  expect(await burstFrames()).not.toEqual(frozenFrame);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seek(page, 2);
  await expect(page.locator('.special-lane-effect')).toHaveCount(0);
  // The same song-level symbol drives all five rows; changing it does not duplicate chart events.
  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  for (const icon of ['star', 'sparkles']) {
    await page.getByLabel('SPECIAL 图标').selectOption(icon);
    await seek(page, 4.2);
    await expect(page.locator(`.special-token .lucide-${icon}`)).toHaveCount(5);
  }
  expect((await exportChart(page)).specialEvents).toEqual(chart.specialEvents);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.getByRole('status')).not.toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });

  await expect(flying).toHaveCount(5);
  await page.screenshot({ path: 'artifacts/special-sparkles-fullscreen.png', fullPage: true });
  await seek(page, 4.85);
  await page.screenshot({ path: 'artifacts/special-approach-fullscreen.png', fullPage: true });
  await seek(page, 10.1);
  await page.screenshot({ path: 'artifacts/special-release-fullscreen.png', fullPage: true });
});

test('鼠标做谱、长条属性、拖动缩放、撤销、复制和 JSON 往返', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '3 手臂', exact: true }).click();
  await page.getByRole('button', { name: '绘制手臂动作 →', exact: true }).click();
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
  await stepChoice(page, 'draw', 'right-tap');
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
  await stepChoice(page, 'selected', 'right-sway');
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
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.playbackRate = 0.5;
  });
  await seek(page, 10);
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('3');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(60);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  let chart = await exportChart(page);
  expect(chart.notes).toHaveLength(1);
  expect(chart.notes[0]).toMatchObject({ lane: 'punch', kind: 'tap', direction: 'left' });
  expect(chart.notes[0].timeMs).toBeGreaterThanOrEqual(10000);
  expect(chart.notes[0].timeMs).toBeLessThan(12000);
  await seek(page, 12);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('1');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.press('2');
  await page.waitForTimeout(650);
  await page.keyboard.up('ArrowDown');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
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
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.up('Control');
  await page.waitForTimeout(650);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('5');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
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
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(310);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(5);
  expect(chart.notes[4]).toMatchObject({
    kind: 'hold',
    modifier: 'none',
    timeMs: 18000,
    endTimeMs: 18500,
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('ArrowLeft');
  await seek(page, 50);
  await page.keyboard.up('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect((await exportChart(page)).notes).toHaveLength(5);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
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
  expect((await exportChart(page)).notes[0]).toMatchObject({ lane: 'punch', armAction: 'reach' });
  await dragLane(page.getByTestId('editor-note').first(), -2);
  await page.locator('.lane-picks [data-lane="punch"]').click();
  await page.getByRole('button', { name: '绘制手臂动作 ←', exact: true }).click();
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
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('.timeline-scroll').evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(2000);
  await lock.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(follow).toBeChecked();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await lock.click();
  await follow.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(follow).toBeChecked();
  await follow.uncheck();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(follow).not.toBeChecked();
  await lock.click();
  await expect(follow).toBeChecked();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  for (const [key, label] of [
    ['1', '1 蹲起'],
    ['2', '2 提踵'],
    ['3', '3 手臂'],
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
  await expect.poll(async () => (await lastDraft(page))?.notes.length).toBe(1);
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
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.getByRole('status')).not.toBeVisible();
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
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('BPM', { exact: true }).focus();
  await page.keyboard.press('ArrowUp');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  await page.getByLabel('BPM', { exact: true }).fill('133');
  await page.getByLabel('BPM', { exact: true }).press('Tab');
  await expect.poll(async () => (await lastDraft(page))?.tempoSegments[0]?.bpm).toBe(133);
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole('button', { name: /创作模式/ }).click();
  await expect(page.getByRole('heading', { name: '浏览器测试作品' })).toBeVisible();
  chart = await exportChart(page);
  expect(chart.notes).toHaveLength(4);
  expect(chart.tempoSegments[0].bpm).toBe(133);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});

test('STEP 鼠标做谱、反向与跨轨、保存重开、五轨配色和消失反馈', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '4 踏步', exact: true }).click();
  await stepChoice(page, 'draw', 'left-tap');
  await draw(page, 1000, 3);
  await stepChoice(page, 'draw', 'right-tap');
  await draw(page, 2000, 3, 3000);
  await stepChoice(page, 'draw', 'left-tap');
  await draw(page, 4000, 3, 5000);
  await stepChoice(page, 'selected', 'left-sway');
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
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect(await exportChart(page)).toEqual(chart);
  await expect(
    page.locator('.timeline-event[data-lane="step"][data-direction="right"] .event-glyph'),
  ).toHaveCSS('background-color', 'rgb(246, 78, 147)');
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
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
  await expect(page.getByTestId('lane-step').locator('.player-note .note-glyph')).toHaveAttribute(
    'data-symbol',
    'L',
  );
  await expect(page.getByTestId('lane-step').locator('.player-note')).toHaveCSS(
    'color',
    'rgb(53, 201, 219)',
  );
  await expect(
    page.getByTestId('lane-step').locator('.hold-head .note-glyph').first(),
  ).toHaveAttribute('data-symbol', 'R');
  await expect(page.getByTestId('lane-step').locator('.hold-head').first()).toHaveCSS(
    'color',
    pink,
  );
  await seek(page, 1.08);
  const impact = page.getByTestId('impact-step');
  await expect(impact).toHaveClass(/arrival/);
  await expect(impact.locator('.impact-particle')).toHaveCount(8);
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
  await seek(page, 1.6);
  await expect(impact).toHaveCount(0);
  await seek(page, 2.5);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'holding');
  await expect(page.getByTestId('target-step').locator('.note-glyph')).toHaveAttribute(
    'data-symbol',
    'R',
  );
  await expect(page.getByTestId('target-step')).toHaveCSS('color', pink);
  await seek(page, 4.5);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'sway');
  await expect(page.getByTestId('target-step').locator('.note-glyph')).toHaveAttribute(
    'data-symbol',
    'L',
  );
  await expect(page.getByTestId('target-step')).toHaveCSS('color', 'rgb(53, 201, 219)');
  await page.screenshot({ path: 'artifacts/step-sway.png', fullPage: true });
  await seek(page, 5.08);
  await expect(impact).toHaveClass(/release/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(impact.locator('.impact-particle').first()).not.toBeVisible();
  await expect(impact.locator('.impact-halo')).not.toBeVisible();
  await seek(page, 5.6);
  await expect(impact).toHaveCount(0);
  await seek(page, 0.5);
  await expect(impact).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await expect(lanes).toHaveCount(5);
  await expect(page.getByLabel('Video', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/step-fullscreen.png', fullPage: true });
});

test('STEP 单菜单动作互换、左右 HOLD 转 SWAY、跨度和撤销重做', async ({ page }) => {
  await emptyEditor(page);
  await page.getByRole('button', { name: '4 踏步', exact: true }).click();
  const drawing = page.getByLabel('绘制类型');
  const selected = page.getByLabel('选中事件类型');
  await expect(drawing.locator('option')).toHaveText([
    'TAP',
    'FOLLOW',
    'HOLD',
    'SWAY',
    'FREE SWAY',
  ]);
  await stepChoice(page, 'draw', 'right-hold');
  await page.getByLabel('绘制踏步跨度').selectOption('2');
  await draw(page, 1000, 3, 3000);
  const original = (await exportChart(page)).notes[0];
  await expect(page.getByLabel('选中音符方向')).toHaveCount(0);
  for (const value of ['left-hold', 'right-sway', 'left-sway', 'free-sway', 'right-hold']) {
    await stepChoice(page, 'selected', value);
    const note = (await exportChart(page)).notes[0];
    expect(note).toMatchObject({
      id: original.id,
      timeMs: 1000,
      endTimeMs: 3000,
      kind: 'hold',
      direction: value.split('-')[0],
      modifier: value.endsWith('sway') ? 'sway' : 'none',
    });
    if (value === 'free-sway') expect(note.distance).toBeUndefined();
  }
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(selected).toHaveValue('sway');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(selected).toHaveValue('hold');
  for (const value of ['left-tap', 'right-tap']) {
    await stepChoice(page, 'selected', value);
    const note = (await exportChart(page)).notes[0];
    expect(note).toMatchObject({
      id: original.id,
      kind: 'tap',
      direction: value.split('-')[0],
      timeMs: 1000,
    });
    expect(note).not.toHaveProperty('endTimeMs');
    expect(note).not.toHaveProperty('modifier');
  }
  await selected.selectOption('free-sway');
  await expect(page.getByLabel('结束 / ms')).toHaveValue('1500');
  await drawing.selectOption('free-sway');
  await expect(page.getByLabel('绘制踏步跨度')).toHaveCount(0);
  await draw(page, 4000, 3, 6000);
  const chart = await exportChart(page);
  expect(chart.notes[1]).toMatchObject({
    direction: 'free',
    kind: 'hold',
    modifier: 'sway',
    timeMs: 4000,
    endTimeMs: 6000,
  });
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'unified-step.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect(await exportChart(page)).toEqual(chart);
  if (await page.getByRole('button', { name: '关闭提示', exact: true }).isVisible())
    await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  await page.getByTestId('editor-note').last().click();
  await page.getByRole('button', { name: '4 踏步', exact: true }).click();
  await page.screenshot({ path: 'artifacts/unified-step-editor.png', fullPage: true });
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seek(page, 4.5);
  const target = page.getByTestId('target-step');
  await expect(target).toHaveAttribute('data-state', 'sway');
  await expect(target).toHaveAttribute('data-action', 'FREE SWAY');
  await expect(target.locator('.note-glyph')).toHaveAttribute('data-symbol', 'FREE');
  await expect(target).toHaveCSS('color', 'rgb(246, 78, 147)');
  await page.screenshot({ path: 'artifacts/independent-free-sway.png', fullPage: true });
  await seek(page, 6.1);
  await expect(page.getByTestId('lane-step').locator('.release-label')).toHaveText('RELEASE');
});

test('FOLLOW 自由放置、类型互换、Alt 录谱和保存重开，游戏显示虚线箭头', async ({ page }) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '4 踏步', exact: true }).click();
  const selected = page.getByLabel('选中事件类型');
  await stepChoice(page, 'draw', 'left-follow');
  await expect(page.getByLabel('绘制踏步跨度')).toHaveCount(0);
  await draw(page, 500, 3, 1800);
  await expect(page.getByTestId('extend-note')).toHaveCount(0);
  await expect(page.getByLabel('结束 / ms')).toHaveCount(0);
  await page.getByRole('button', { name: '反转方向', exact: true }).click();
  await expect(selected).toHaveValue('follow');
  await stepChoice(page, 'selected', 'left-tap');
  await expect(page.getByTestId('extend-note')).toBeVisible();
  await stepChoice(page, 'selected', 'left-follow');
  for (const [type, time] of [
    ['left-tap', 2500],
    ['left-follow', 3000],
    ['right-tap', 4000],
    ['right-follow', 4500],
  ] as const) {
    await stepChoice(page, 'draw', type);
    await draw(page, time, 3);
  }
  let chart = await exportChart(page);
  expect(chart.notes[0]).toMatchObject({
    timeMs: 500,
    kind: 'tap',
    direction: 'left',
    follow: true,
  });
  expect(chart.notes.filter((n) => n.follow)).toHaveLength(3);
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await seek(page, 6);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('Alt');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Alt');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  chart = await exportChart(page);
  expect(chart.notes.at(-1)).toMatchObject({ kind: 'tap', direction: 'right', follow: true });
  for (const note of chart.notes.filter((n) => n.follow)) {
    expect(note).not.toHaveProperty('endTimeMs');
    expect(note).not.toHaveProperty('distance');
  }
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'follow.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(chart)),
  });
  expect((await exportChart(page)).notes).toEqual(chart.notes);
  await page.screenshot({ path: 'artifacts/follow-editor.png' });
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });

  await seek(page, 1.2);
  const follows = page.getByTestId('lane-step').locator('.player-note .glyph--follow');
  await expect(follows).toHaveCount(2);
  await expect(follows.first().locator('.follow-color')).toHaveCSS('fill', 'none');
  await expect(follows.first().locator('.follow-color')).toHaveCSS('stroke', 'rgb(53, 201, 219)');
  await expect(follows.last().locator('.follow-color')).toHaveCSS('stroke', 'rgb(246, 78, 147)');
  await page.screenshot({ path: 'artifacts/follow-game-1920.png' });
  await page.getByTestId('lane-step').screenshot({ path: 'artifacts/follow-step-1920.png' });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(1.4);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
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
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect((await exportChart(page)).notes).toMatchObject([
    { lane: 'step', kind: 'tap', direction: 'left' },
  ]);
  await seek(page, 3);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await seek(page, 5);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('Control');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
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

test('导入旧谱彻底删除 C 三种形式，独立 FREE SWAY 和左右不受影响', async ({ page }) => {
  const chart = await emptyEditor(page);
  const kept = [
    { id: 'l', lane: 'step', direction: 'left', kind: 'tap', timeMs: 1000 },
    {
      id: 'r',
      lane: 'step',
      direction: 'right',
      kind: 'hold',
      modifier: 'none',
      timeMs: 5000,
      endTimeMs: 6000,
    },
    {
      id: 'free',
      lane: 'step',
      direction: 'free',
      kind: 'hold',
      modifier: 'sway',
      timeMs: 7000,
      endTimeMs: 8000,
    },
  ];
  const legacy = {
    ...chart,
    notes: [
      ...kept,
      { id: 'c', lane: 'step', direction: 'close', kind: 'tap', timeMs: 2000 },
      {
        id: 'ch',
        lane: 'step',
        direction: 'close',
        kind: 'hold',
        modifier: 'none',
        timeMs: 3000,
        endTimeMs: 3500,
      },
      {
        id: 'cs',
        lane: 'step',
        direction: 'close',
        kind: 'hold',
        modifier: 'sway',
        timeMs: 4000,
        endTimeMs: 4500,
      },
    ],
  };
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'legacy-step.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.getByTestId('editor-note')).toHaveCount(3);
  const saved = await exportChart(page);
  expect(saved.notes).toEqual(kept);
  expect(JSON.stringify(saved)).not.toContain('close');
  await page.getByRole('button', { name: '4 踏步', exact: true }).click();
  await expect(page.getByLabel('绘制类型').locator('option')).not.toContainText(['CLOSE']);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  for (const time of [2, 3.2, 4.2]) {
    await seek(page, time);
    await expect(page.locator('[data-direction="close"], .glyph--close')).toHaveCount(0);
    await expect(page.getByTestId('target-step')).toHaveAttribute('data-state', 'idle');
  }
});

test('STEP 独立自由 SWAY、Shift 两格、Ctrl+Shift 摇摆，组合键与切轨不改变正在录的音符', async ({
  page,
}) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await page.keyboard.press('4');
  const start = async (seconds: number) => {
    await seek(page, seconds);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
  };
  const stop = () => page.getByRole('button', { name: 'Pause', exact: true }).click();
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
    { lane: 'step', direction: 'free', kind: 'hold', modifier: 'sway' },
    { lane: 'step', direction: 'right', kind: 'tap', distance: 2 },
    { lane: 'step', direction: 'free', kind: 'hold', modifier: 'sway' },
    { lane: 'step', direction: 'left', kind: 'hold', modifier: 'sway', distance: 2 },
    { lane: 'step', direction: 'free', kind: 'hold', modifier: 'sway' },
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
  await page.getByRole('button', { name: /创作模式/ }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await chooser).setFiles('public/demo.mp4');
  await expect(page.getByRole('heading', { name: 'demo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await draw(page, 2000, 3);
  const chart = await exportChart(page);
  expect(chart.notes).toHaveLength(1);
  expect(chart.videoHint.fileName).toBe('demo.mp4');
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();

  await expect(page.getByLabel('Movement tracks')).toBeVisible();
  await expect(page.getByLabel('Video', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'WORKBENCH', exact: true }).click();
  const secondChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await secondChooser).setFiles('public/demo.mp4');
  await expect(page.getByTestId('editor-note')).toHaveCount(0);
  expect((await exportChart(page)).notes).toHaveLength(0);
});

test('五轨录谱方向键不被下拉框或滑块吞掉，保留点按长按与 Ctrl 摇摆', async ({ page }) => {
  await emptyEditor(page);
  await page.getByLabel('吸附', { exact: true }).selectOption('0');
  await draw(page, 500, 0);
  await page.getByRole('button', { name: '启用按键录谱', exact: true }).click();
  await seek(page, 1);
  await page.getByLabel('吸附', { exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.locator('video').evaluate((video) => {
    video.dataset.seekCount = '0';
    video.addEventListener('seeking', () => {
      video.dataset.seekCount = String(Number(video.dataset.seekCount) + 1);
    });
  });
  let count = 1;
  for (const [index, lane] of LANES.entries()) {
    await page.getByLabel('吸附', { exact: true }).focus();
    await page.keyboard.press(String(index + 1));
    await expect(page.locator(`.lane-picks [data-lane="${lane.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const keys = index < 2 ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    await page.getByLabel('选中事件类型').focus();
    await page.keyboard.press(keys[0]);
    await page.getByLabel('Playback position').focus();
    await page.keyboard.press(keys[1]);
    await page.getByLabel('Volume', { exact: true }).focus();
    await page.keyboard.down(keys[0]);
    await page.waitForTimeout(320);
    await page.keyboard.up(keys[0]);
    await page.getByLabel('吸附', { exact: true }).focus();
    await page.keyboard.down('Control');
    await page.keyboard.down(keys[1]);
    await page.waitForTimeout(320);
    await page.keyboard.up(keys[1]);
    await page.keyboard.up('Control');
    count += 4;
    await expect(page.locator('.timeline-footer')).toContainText(`${count} 音符`);
  }
  await expect(page.getByLabel('吸附', { exact: true })).toHaveValue('0');
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1);
  await expect(page.locator('video')).toHaveAttribute('data-seek-count', '0');
  await page.getByLabel('开始 / ms').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.timeline-footer')).toContainText(`${count} 音符`);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const chart = await exportChart(page);
  for (const [index, lane] of LANES.entries()) {
    const notes = chart.notes.filter((n) => n.lane === lane.id && n.timeMs > 500);
    expect(notes).toHaveLength(4);
    expect(notes.map((n) => n.kind)).toEqual(['tap', 'tap', 'hold', 'hold']);
    expect(notes[2]).toMatchObject({ modifier: 'none' });
    expect(notes[3]).toMatchObject({ modifier: 'sway' });
    const dirs = index < 2 ? ['up', 'down'] : ['left', 'right'];
    expect(notes.map((n) => n.direction)).toEqual([dirs[0], dirs[1], dirs[0], dirs[1]]);
  }
});
