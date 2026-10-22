import { test, expect, emptyEditor, draw, exportChart } from './helpers/editor';
import type { Page } from '@playwright/test';

async function resize(page: Page, dx: number, dy: number, cancel?: 'Escape' | 'blur') {
  const handle = page.getByRole('button', { name: '调整视频预览大小', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  if (cancel === 'Escape') await page.keyboard.press('Escape');
  if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
}

async function geometry(page: Page) {
  return page.locator('.editing').evaluate((root) => {
    const rect = (selector: string) => {
      const node = root.querySelector(selector)!;
      const box = node.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
      };
    };
    return {
      stage: rect('.stage-grid'),
      left: rect('.stage-left'),
      video: rect('.video-panel'),
      transport: rect('.transport'),
      editor: rect('.editor'),
      timeline: rect('.timeline-panel'),
      inspector: rect('.inspector'),
      viewport: rect('.video-viewport'),
    };
  });
}

async function expectWorkspaceFits(page: Page) {
  const layout = await page.evaluate(() => {
    const timeline = document.querySelector('.timeline-scroll')!;
    const surface = document.querySelector('.timeline-surface')!;
    const workspace = document.querySelector('.editing')!.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      workspaceWidth: workspace.width,
      bottom: document.querySelector('.workspace-bottom')!.getBoundingClientRect().bottom,
      timelineHeight: timeline.clientHeight,
      surfaceHeight: surface.getBoundingClientRect().height,
    };
  });
  expect(layout.pageWidth).toBe(layout.width);
  expect(layout.pageHeight).toBe(layout.height);
  expect(layout.workspaceWidth).toBeGreaterThan(layout.width - 60);
  expect(layout.bottom).toBeLessThanOrEqual(layout.height);
  if (layout.height >= 1080)
    expect(layout.timelineHeight).toBeGreaterThanOrEqual(layout.surfaceHeight);
}

test('dragging the preview enlarges the real video within the workspace without restarting playback or changing timeline editing', async ({
  page,
}) => {
  await emptyEditor(page);
  const before = await geometry(page);
  const video = (await page.locator('video').elementHandle())!;
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.25);
  await resize(page, -220, 150);
  const after = await geometry(page);
  expect(after.video.width).toBeGreaterThan(before.video.width + 150);
  // Height is capped by the full timeline, even when the pointer drags farther.
  expect(after.video.height).toBeGreaterThanOrEqual(before.video.height);
  await expectWorkspaceFits(page);
  expect(after.left.width).toBeGreaterThanOrEqual(419);
  expect(after.timeline.width).toBeCloseTo(before.timeline.width, 0);
  expect(after.transport.top).toBeGreaterThanOrEqual(after.stage.bottom);
  expect(after.editor.top).toBeGreaterThanOrEqual(after.transport.bottom);
  expect(after.inspector.left).toBeGreaterThanOrEqual(after.timeline.right - 1);
  expect(
    await video.evaluate(
      (node) => node === document.querySelector('video') && !(node as HTMLVideoElement).paused,
    ),
  ).toBe(true);
  const time = await video.evaluate((node) => (node as HTMLVideoElement).currentTime);
  await expect
    .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
    .toBeGreaterThan(time + 0.1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: '切换日夜主题', exact: true }).click();
  expect((await geometry(page)).video.height).toBeCloseTo(after.video.height, 0);
  await page.screenshot({ path: 'artifacts/editor-preview-resized-1920.png', fullPage: true });
  await resize(page, 80, -60, 'Escape');
  expect((await geometry(page)).video.height).toBeCloseTo(after.video.height, 0);
  await resize(page, 60, -40, 'blur');
  expect((await geometry(page)).video.width).toBeCloseTo(after.video.width, 0);
  await expect(page.locator('[data-preview-resizing]')).toHaveCount(0);
  await draw(page, 1000, 'squat');
  expect((await exportChart(page)).notes[0]).toMatchObject({ lane: 'squat', timeMs: 1000 });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByTestId('editor-note')).toHaveCount(0);
  await page.getByRole('button', { name: '恢复视频预览默认大小', exact: true }).click();
  const reset = await geometry(page);
  expect(reset.video.width).toBeCloseTo(before.video.width, 0);
  expect(reset.video.height).toBeCloseTo(before.video.height, 0);
  await expect(page.locator('.stage-grid')).not.toHaveAttribute('data-preview-custom');
});

test('preview bounds, persistence, small windows and keyboard reset preserve usable controls', async ({
  page,
}) => {
  await emptyEditor(page);
  const video = (await page.locator('video').elementHandle())!;
  await resize(page, -700, 500);
  const large = await geometry(page);
  expect(large.left.width).toBeGreaterThanOrEqual(419);
  expect(large.stage.height).toBeLessThanOrEqual(680);
  await expectWorkspaceFits(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1920);
  await page.reload();
  await emptyEditor(page);
  expect((await geometry(page)).video.width).toBeCloseTo(large.video.width, 0);
  expect((await geometry(page)).video.height).toBeCloseTo(large.video.height, 0);
  // Reload intentionally creates a new media node; subsequent resizing must not.
  const currentVideo = (await page.locator('video').elementHandle())!;
  await page.setViewportSize({ width: 1280, height: 800 });
  const small = await geometry(page);
  expect(small.left.width).toBeGreaterThanOrEqual(319);
  expect(small.video.width).toBeGreaterThanOrEqual(319);
  expect(small.video.right).toBeLessThanOrEqual(1280);
  await expectWorkspaceFits(page);
  expect(small.transport.top).toBeGreaterThanOrEqual(small.stage.bottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  expect(await currentVideo.evaluate((node) => node === document.querySelector('video'))).toBe(
    true,
  );
  await page.screenshot({ path: 'artifacts/editor-preview-resized-1280.png', fullPage: true });
  const handle = page.getByRole('button', { name: '调整视频预览大小', exact: true });
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  expect((await geometry(page)).video.width).toBeLessThan(small.video.width - 15);
  await page.keyboard.press('Home');
  await expect(page.locator('.stage-grid')).not.toHaveAttribute('data-preview-custom');
  await page.getByRole('button', { name: '曲目', exact: true }).click();
  await expect(page.getByLabel('所属专辑')).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await resize(page, -100, 60);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await expect(page.locator('.practice')).toBeVisible();
  await expect(page.getByRole('button', { name: '调整视频预览大小', exact: true })).toHaveCount(0);
  await expect(page.locator('.stage-grid')).not.toHaveAttribute('data-preview-custom');
  await video.dispose();
});
