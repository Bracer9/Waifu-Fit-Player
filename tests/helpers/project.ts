import { createHash } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { demoChart } from '../../src/demo';
import type { Chart } from '../../src/model';

// Import the test chart through the same local-project entry point as real charts.
export async function importDemo(page: Page, chart?: Chart) {
  await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
  const metadata = await (await page.request.get('/demo-media.json')).json();
  const next = chart ?? demoChart(metadata.fileName);
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

export async function openDemo(page: Page) {
  await importDemo(page);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
}

/** Album confirmation opens the player; inserting is a separate command. */
export async function insertAlbum(page: Page) {
  const button = page.getByRole('button', { name: /INSERT ALBUM/ });
  await expect(button).toBeEnabled();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect(page.locator('.music-menu.songs')).toBeVisible();
  } finally {
    await page.mouse.up();
  }
  await expect(page.locator('.music-menu.songs')).toBeVisible();
  await expect(page.locator('.menu-curtain')).toHaveCount(0);
}

export async function holdStart(page: Page) {
  const button = page.getByRole('button', { name: '按住 Enter 开始游戏', exact: true });
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
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const last = JSON.parse(localStorage.getItem('waifu-last-draft') || 'null');
        if (!last) return resolve(undefined);
        const opening = indexedDB.open('waifu-fit-player-library');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const request = db.transaction('songs').objectStore('songs').get(last.id);
          request.onsuccess = () => {
            resolve(request.result?.drafts[last.chartType]?.chart);
            db.close();
          };
        };
      }),
  );
}
