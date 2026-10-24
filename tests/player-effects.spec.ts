import { editInStudio } from './helpers/project';
import { test, expect, seek, exportChart, emptyEditor } from './helpers/editor';
import { LANES } from '../src/model';

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
    'HOLD',
    'LEG HOLD',
    'SPIN',
    'SWAY',
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
  }
  await seek(page, 7.2);
  await expect(page.getByTestId('target-step')).toHaveAttribute('data-action', 'SPIN');
  await expect(page.getByTestId('special-cue')).toContainText('SPECIAL!');
  await editInStudio(page);
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
  await page.setViewportSize({ width: 1280, height: 720 });
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
  await editInStudio(page);
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
  await seek(page, 4.85);
  await seek(page, 10.1);
});
