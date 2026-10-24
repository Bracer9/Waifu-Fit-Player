// Headless browser review against the isolated copy. Never opens the user's
// browser or starts a process on their 5173 game port.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
const out = path.resolve(
    process.env.WFP_FITNESS_STUDY_DIR ?? 'artifacts/fitness-retrain-2026-10-24',
  ),
  info = JSON.parse(await readFile(path.join(out, 'preflight-save.json'), 'utf8'));
const config = process.env.WFP_FITNESS_STUDY_DIR
  ? JSON.parse(await readFile(path.join(out, 'review-input.json'), 'utf8'))
  : {};
process.env.WFP_MAPS_DIR = info.labRoot;
delete process.env.WFP_TEST_TOKEN;
const server = await createServer({ server: { host: '127.0.0.1', port: 4186, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4186/');
  await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0, { timeout: 20000 });
  await page.locator('.create-mode').click();
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  const manager = page.getByRole('dialog', { name: '本地作品', exact: true });
  const row = manager
    .locator('.managed-edition')
    .filter({ has: page.locator('b', { hasText: 'FITNESS' }) });
  await row.getByRole('combobox').selectOption({ label: info.name });
  await page.screenshot({ path: path.join(out, 'review-draft-picker.png') });
  await row.getByRole('button', { name: '继续草稿', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog', { name: '定位作品的视频', exact: true })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  if (exported.notes.length !== info.notes) throw Error('Opened wrong version');
  const candidateBytes = await readFile(
    path.join(out, config.candidate ?? 'phrase-training-3.json'),
  );
  const expected = JSON.parse(candidateBytes.toString('utf8')).chart;
  expect(exported.notes).toEqual(expected.notes);
  await page.getByRole('button', { name: '试玩谱面', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => v.currentTime), { timeout: 20000 })
    .toBeGreaterThan(0.5);
  const playingTime = await page.locator('video').evaluate((v) => v.currentTime);
  for (const [label, time] of config.reviewTimes ?? [
    ['hold', 47],
    ['tame', 58],
    ['sway', 184],
  ]) {
    await page.locator('video').evaluate((v, time) => {
      v.currentTime = time;
      v.pause();
    }, time);
    await expect
      .poll(() => page.locator('video').evaluate((v) => v.currentTime))
      .toBeCloseTo(time, 0);
    await expect
      .poll(() => page.locator('video').evaluate((v) => !v.seeking && v.readyState >= 2), {
        timeout: 15000,
      })
      .toBe(true);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, `review-${label}.png`) });
  }
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(
    path.join(out, 'browser-review.json'),
    JSON.stringify(
      {
        name: info.name,
        id: info.id,
        notes: exported.notes.length,
        candidateSha256: createHash('sha256').update(candidateBytes).digest('hex'),
        playable: true,
        playingTime,
        errors,
        isolatedMaps: info.labRoot,
        serverPort: 4186,
      },
      null,
      2,
    ),
  );
  console.log('Named draft loads, exports identical notes and plays; screenshots captured.');
} finally {
  await browser.close();
  await server.close();
}
