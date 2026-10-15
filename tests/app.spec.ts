import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { blankChart, type Chart } from '../src/model';
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
    y = box.y + 30 + lane * 54 + (lane === 4 ? 18 : 27);
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
  await page.getByLabel('保持时自由摇摆 SWAY').check();
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
  await draw(page, 4000, 4, 4800);
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

test('自动 TAP / HOLD / Ctrl+SWAY、1234 切轨、慢放时长与未完成录入取消', async ({ page }) => {
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
  await page.keyboard.press('4');
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
  await page.getByLabel('保持时自由摇摆 SWAY').check();
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
  await dragLane(page.getByTestId('editor-note').last(), 1);
  expect((await exportChart(page)).notes[1].lane).toBe('side_crunch');
  await dragLane(page.getByTestId('editor-note').last(), -1);
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
    ['4', '4 侧收腹'],
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
  await expect(page.getByLabel('跟练四轨')).toBeVisible();
  await expect(page.getByLabel('舞蹈视频')).toBeVisible();
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  await page.getByRole('button', { name: '返回工作台', exact: true }).click();
  const secondChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await secondChooser).setFiles('public/demo.mp4');
  await expect(page.getByTestId('editor-note')).toHaveCount(0);
  expect((await exportChart(page)).notes).toHaveLength(0);
});
