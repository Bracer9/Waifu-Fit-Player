import { createHash } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { demoChart } from '../../src/demo';
import type { Chart } from '../../src/model';

// Import the test chart through the same local-project entry point as real charts.
export async function importDemo(page: Page, chart?: Chart) {
  await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
  const metadata = await (await page.request.get('/demo-media.json')).json();
  const next = chart ?? demoChart(metadata.fileName);
  // General interaction tests use a bounded chart and fixed 60-second media.
  // Endurance tests pass their full chart explicitly.
  if (!chart) {
    next.notes = next.notes.filter(
      (note) => (note.kind === 'hold' ? note.endTimeMs : note.timeMs) < metadata.durationMs,
    );
    next.specialEvents = next.specialEvents.filter(
      (event) => (event.endTimeMs ?? event.timeMs) < metadata.durationMs,
    );
  }
  next.videoHint.fileName = metadata.fileName;
  next.videoHint.durationMs = metadata.durationMs;
  next.videoHint.assetId = `demo-${createHash('sha256')
    .update(JSON.stringify([metadata.fileName, metadata.size, metadata.lastModified]))
    .digest('hex')}`;
  await page.getByLabel('导入谱面文件').setInputFiles({
    name: 'test.wfp.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(next)),
  });
  await expect(page.getByRole('button', { name: '试玩谱面', exact: true })).toBeEnabled();
  return next;
}

export async function openDemo(page: Page, chart?: Chart) {
  await importDemo(page, chart);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
}

/** The current gameplay editor entry lives inside the pause menu. */
export async function editInStudio(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'PAUSED', exact: true });
  if (!(await dialog.isVisible()))
    await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
  await dialog.getByRole('button', { name: 'EDIT IN STUDIO', exact: true }).click();
  await expect(page.locator('.editor')).toBeVisible();
}

/** Album confirmation opens the player; inserting is a separate command. */
export async function insertAlbum(page: Page) {
  const button = page.getByRole('button', { name: /INSERT ALBUM/ });
  await expect(button).toBeEnabled();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
}

export async function holdStart(page: Page) {
  const button = page.getByRole('button', { name: '按住 Enter 开始游戏', exact: true });
  await expect(page.locator('.start-briefing')).toHaveAttribute('data-motion', 'ready');
  await expect(button).toBeVisible();
  // The whole bar follows the music, so its bounds intentionally never settle.
  // Move a real pointer to its centre instead of waiting for hover's stable-box check.
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await page.waitForFunction(
      () => document.querySelector('.start-briefing')?.getAttribute('data-state') === 'complete',
    );
  } finally {
    await page.mouse.up();
  }
}

export async function lastDraft(page: Page): Promise<Chart | undefined> {
  const last = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('waifu-last-draft') || 'null'),
  );
  if (!last) return undefined;
  const library = await (await page.request.get('/__wfp/maps')).json();
  return library.songs.find((song: { id: string }) => song.id === last.id)?.drafts[last.chartType]
    ?.chart;
}
