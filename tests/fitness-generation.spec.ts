import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Chart } from '../src/model';

async function exportChart(page: import('@playwright/test').Page): Promise<Chart> {
  const task = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await task).path())!, 'utf8'));
}
test('one click generates and saves Fitness while preserving Dance, with a report and guarded replacement', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showOpenFilePicker', { value: undefined }),
  );
  await page.goto('/');
  await expect(page.locator('.liquid-menu-curtain[data-intro]')).toHaveCount(0);
  await page.locator('.create-mode').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await (await chooser).setFiles('tests/fixtures/fitness-148.mp4');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page
    .locator('.inspector-tabs')
    .getByRole('button', { name: '节拍段', exact: true })
    .click();
  await page.getByLabel('BPM', { exact: true }).fill('134.25');
  await page.getByLabel('BPM', { exact: true }).press('Enter');
  await page.getByLabel('本段 Offset / ms', { exact: true }).fill('1357');
  await page.getByLabel('本段 Offset / ms', { exact: true }).press('Enter');
  const dance = await exportChart(page);
  const before = await (await page.request.get('/__wfp/maps')).json();
  const original = before.songs.find((s: { id: string }) => s.id === dance.songId);
  await page.getByRole('button', { name: '一键 FITNESS', exact: true }).click();
  const report = page.getByRole('dialog', { name: 'FITNESS 生成完成', exact: true });
  await expect(report.getByRole('status')).toContainText('已保存', { timeout: 90000 });
  await page.screenshot({ path: 'artifacts/fitness-generator-2026-10-23/ui-report.png' });
  await report.getByRole('button', { name: '关闭', exact: true }).click();
  const generated = await exportChart(page);
  expect(generated.chartType).toBe('fitness');
  expect(generated.tempoSegments).toEqual(dance.tempoSegments);
  expect(generated.tempoSegments[0]).toMatchObject({ bpm: 134.25, anchorMs: 1357 });
  expect(generated.notes.length).toBeGreaterThan(20);
  expect(generated.specialEvents).toEqual([]);
  expect(generated.notes.some((n) => n.lane === 'step')).toBe(false);
  const after = await (await page.request.get('/__wfp/maps')).json();
  const saved = after.songs.find((s: { id: string }) => s.id === dance.songId);
  expect(saved.drafts.dance.chart).toEqual(original.drafts.dance.chart);
  expect(saved.released).toEqual(original.released);
  expect(saved.drafts.fitness.chart).toEqual(generated);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '一键 FITNESS', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'FITNESS 生成完成' }).getByRole('status'),
  ).toContainText('未写入', { timeout: 90000 });
  await page
    .getByRole('dialog', { name: 'FITNESS 生成完成' })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  expect(await exportChart(page)).toEqual(generated);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/fitness.worker*', async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    await page.getByRole('button', { name: '一键 FITNESS', exact: true }).click();
    await page.getByRole('button', { name: '取消生成', exact: true }).click();
    expect(await exportChart(page)).toEqual(generated);
  } finally {
    release();
  }
});
