import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { blankChart } from '../src/model';
import { scanMaps } from '../scripts/maps-library';
import { importDemo } from './helpers/project';
import { putSongs, readSongs } from './helpers/library';

test('multi-select exports one ZIP, round-trips duplicate titles and leaves drafts unchanged', async ({
  page,
}) => {
  await page.goto('/');
  await importDemo(page, {
    ...blankChart('Batch song'),
    notes: [{ id: 'original-note', lane: 'squat', direction: 'down', kind: 'tap', timeMs: 4000 }],
  });
  const initial = (await readSongs(page))[0];
  initial.released.dance = { ...initial.drafts.dance!, albumId: 'anime' };
  initial.released.fitness = {
    ...initial.released.dance,
    chart: { ...initial.released.dance.chart, chartType: 'fitness', intensity: 'medium' },
  };
  const other = structuredClone(initial);
  other.id = crypto.randomUUID();
  for (const edition of [...Object.values(other.drafts), ...Object.values(other.released)]) {
    edition.chart.songId = other.id;
    edition.chart.title = 'batch song'; // Collision on Windows / default macOS filesystems.
  }
  const draft = structuredClone(initial);
  draft.id = crypto.randomUUID();
  draft.released = {};
  draft.drafts.dance!.chart.songId = draft.id;
  draft.drafts.dance!.chart.title = 'Draft only';
  await putSongs(page, [initial, other, draft]);
  await page.reload();
  await page.locator('.create-mode').click();
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '本地作品', exact: true });
  const button = dialog.getByRole('button', { name: /^导出所选/ });
  await expect(button).toBeDisabled();
  const contrast = async (selector: string) =>
    dialog.locator(selector).evaluate((node) => {
      const style = getComputedStyle(node);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      const luminance = (color: string) => {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data)
          .slice(0, 3)
          .map((channel) => {
            const value = Number(channel) / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
        return r * 0.2126 + g * 0.7152 + b * 0.0722;
      };
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
  expect(await contrast('.song-export-toolbar')).toBeGreaterThan(4.5);
  expect(await contrast('.song-export-toolbar button')).toBeGreaterThan(4.5);
  await page.screenshot({ path: 'artifacts/song-pack-batch-light-empty.png' });
  await expect(
    dialog.getByRole('checkbox', { name: '选择导出 Draft only', exact: true }),
  ).toBeDisabled();
  const first = dialog.getByRole('checkbox', { name: '选择导出 Batch song', exact: true });
  await first.check();
  const all = dialog.getByRole('checkbox', { name: '全选可导出曲目' });
  await expect(all).toBeChecked({ indeterminate: true });
  await all.check();
  await expect(button).toHaveText('导出所选（2）');
  await all.uncheck();
  await expect(button).toBeDisabled();
  await all.check();
  await page.screenshot({ path: 'artifacts/song-pack-batch-manager.png' });
  expect(await contrast('.song-export-toolbar button')).toBeGreaterThan(4.5);
  await dialog.getByRole('button', { name: '关闭本地作品' }).click();
  await page.getByRole('button', { name: '切换日夜主题' }).click();
  await expect(page.locator('.app')).toHaveAttribute('data-workbench-theme', 'dark');
  await page.getByRole('button', { name: '本地作品', exact: true }).click();
  await expect(button).toBeDisabled();
  expect(await contrast('.song-export-toolbar')).toBeGreaterThan(4.5);
  expect(await contrast('.song-export-toolbar button')).toBeGreaterThan(4.5);
  await page.screenshot({ path: 'artifacts/song-pack-batch-dark-empty.png' });
  await all.check();
  expect(await contrast('.song-export-toolbar button')).toBeGreaterThan(4.5);
  await page.setViewportSize({ width: 1440, height: 900 });
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
  await page.screenshot({ path: 'artifacts/song-pack-batch-manager-1440.png' });
  const before = await readSongs(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  const completed = page.waitForResponse(
    async (response) =>
      response.url().includes('/__wfp/export-packs/') &&
      response.request().method() === 'GET' &&
      (await response.json()).state === 'done',
  );
  await button.click();
  const job = await (await completed).json();
  expect(downloads).toBe(0);
  expect(path.basename(job.path)).toMatch(/^Waifu-Fit-Player-2-songs-.*\.wfp\.zip$/);
  const bytes = await readFile(job.path);
  const destination = await mkdtemp(path.join(tmpdir(), 'wfp-batch-export-'));
  try {
    const names: string[] = [];
    // Read the central directory: streamed ZIP entries carry their CRC in data descriptors.
    const end = bytes.length - 22;
    for (let offset = bytes.readUInt32LE(end + 16); bytes.readUInt32LE(offset) === 0x02014b50;) {
      const nameSize = bytes.readUInt16LE(offset + 28);
      const extra = bytes.readUInt16LE(offset + 30);
      const comment = bytes.readUInt16LE(offset + 32);
      const name = bytes.subarray(offset + 46, offset + 46 + nameSize).toString();
      names.push(name);
      const target = path.resolve(destination, name);
      expect(target.startsWith(destination + path.sep)).toBe(true);
      offset += 46 + nameSize + extra + comment;
    }
    execFileSync('tar', ['-xf', job.path, '-C', destination]);
    expect(names.filter((name) => name.endsWith('song.json'))).toHaveLength(2);
    expect(names.filter((name) => name.endsWith('.mp4'))).toHaveLength(2);
    const restored = await scanMaps(destination);
    expect(restored.warnings).toEqual([]);
    expect(restored.songs.map((song) => song.id).sort()).toEqual([initial.id, other.id].sort());
    for (const song of restored.songs) {
      expect(Object.keys(song.released).sort()).toEqual(['dance', 'fitness']);
      expect(song.released.dance!.chart.notes[0].id).toBe('original-note');
      expect(song.released.dance!.albumId).toBe('anime');
      expect(song.drafts).toEqual({});
    }
    const video = names.find((name) => name.endsWith('.mp4'))!;
    expect(await readFile(path.join(destination, video))).toEqual(
      await readFile('tests/fixtures/player/demo.mp4'),
    );
    expect(await readSongs(page)).toEqual(before);
  } finally {
    // Only the fresh, uniquely named temporary extraction directory is removed.
    await rm(destination, { recursive: true, force: true });
    await rm(job.path, { force: true });
  }
});
