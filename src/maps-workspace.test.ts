import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MapsWorkspace } from '../scripts/maps-workspace';
import { scanMaps } from '../scripts/maps-library';
import { blankChart } from './model';
import type { Song } from './library';

let root: string;
let workspace: MapsWorkspace;
const id = '11111111-2222-4333-a444-555555555555';
const assetId = 'aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee';
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'wfp-workspace-'));
  await mkdir(path.join(root, '愛包'));
  await writeFile(path.join(root, '愛包', 'renamed.mp4'), 'video-fixture');
  await utimes(path.join(root, '愛包', 'renamed.mp4'), 1700000000, 1700000000);
  workspace = new MapsWorkspace(root);
});
afterEach(async () => {
  if (!root.startsWith(path.join(tmpdir(), 'wfp-workspace-')))
    throw new Error('Unexpected test root');
  await rm(root, { recursive: true, force: true });
});
const attach = () =>
  workspace.attach({
    id,
    title: '愛包',
    assetId,
    source: '/__wfp/map-file/%E6%84%9B%E5%8C%85/renamed.mp4',
  });
const song = (): Song => ({
  id,
  drafts: {
    dance: {
      chart: {
        ...blankChart('愛包'),
        songId: id,
        videoHint: { assetId, fileName: 'old.mp4', durationMs: 20000 },
      },
      albumId: 'pop',
      cover: '',
      updatedAt: 100,
    },
  },
  released: {},
});

describe('maps is the project store', () => {
  it('saves an empty draft beside its existing MP4 and opens in a new server without browser data', async () => {
    const original = await readFile(path.join(root, '愛包', 'renamed.mp4'));
    const adopted = await attach();
    expect(adopted.location.folder).toBe('愛包');
    const saved = await workspace.saveSong(song(), adopted.location.revision);
    expect(saved.song.drafts.dance?.chart.videoHint.fileName).toBe('renamed.mp4');
    expect(saved.song.drafts.dance?.chart.notes).toEqual([]);
    const chart = JSON.parse(
      await readFile(path.join(root, '愛包', 'wfp-dance-draft.json'), 'utf8'),
    );
    expect(chart.schemaVersion).toBe(1);
    expect(chart.title).toBe('愛包');
    expect(await readFile(path.join(root, '愛包', 'renamed.mp4'))).toEqual(original);
    const fresh = await scanMaps(root);
    expect(fresh.warnings).toEqual([]);
    expect(fresh.songs[0]).toEqual(saved.song);
    expect(fresh.locations?.[id]?.workspace).toBe(true);
  });
  it('keeps published and draft charts separate, writes covers, and preserves external chart edits', async () => {
    await attach();
    const next = song();
    next.drafts.dance!.cover = 'data:image/png;base64,aW1hZ2U=';
    next.released.dance = structuredClone(next.drafts.dance!);
    next.released.dance.chart.title = 'Released';
    const saved = await workspace.saveSong(next);
    expect(saved.song.released.dance?.chart.title).toBe('Released');
    expect(saved.song.drafts.dance?.cover).toContain('/__wfp/map-file/');
    const file = path.join(root, '愛包', 'wfp-dance-draft.json');
    const changed = JSON.parse(await readFile(file, 'utf8'));
    changed.title = 'External edit';
    await writeFile(file, JSON.stringify(changed));
    const reloaded = await new MapsWorkspace(root).readProject('愛包');
    expect(reloaded.song.drafts.dance?.chart.title).toBe('External edit');
    await expect(workspace.saveSong(saved.song, saved.location.revision)).rejects.toThrow('未覆盖');
    expect(JSON.parse(await readFile(file, 'utf8')).title).toBe('External edit');
  });
  it('recovers MP4 renames with a stable ID, persists the new filename, and rejects ambiguity', async () => {
    await attach();
    const saved = await workspace.saveSong(song());
    await rename(path.join(root, '愛包', 'renamed.mp4'), path.join(root, '愛包', '最新#1.mp4'));
    const renamed = await new MapsWorkspace(root).readProject('愛包');
    expect(renamed.videos[0].id).toBe(saved.videos[0].id);
    expect(renamed.song.drafts.dance?.chart.videoHint.fileName).toBe('最新#1.mp4');
    await workspace.saveSong(renamed.song, renamed.location.revision);
    expect(
      JSON.parse(await readFile(path.join(root, '愛包', 'wfp-dance-draft.json'), 'utf8')).videoHint
        .fileName,
    ).toBe('最新#1.mp4');
    // Identical metadata in another candidate must not silently bind a missing reference.
    await copyFile(path.join(root, '愛包', '最新#1.mp4'), path.join(root, '愛包', 'copy.mp4'));
    await rename(path.join(root, '愛包', '最新#1.mp4'), path.join(root, '愛包', 'again.mp4'));
    // A second actual same-size, same-time candidate is created by restoring the timestamp.
    await utimes(path.join(root, '愛包', 'copy.mp4'), 1700000000, 1700000000);
    const missing = await workspace.readProject('愛包');
    expect(missing.videos).toEqual([]);
    expect(missing.song.drafts.dance?.chart.videoHint.fileName).toBe('最新#1.mp4');
  });
  it('migrates only once, backs up replaced JSON, and leaves source author files intact', async () => {
    await writeFile(path.join(root, '愛包', 'author.wfp.json'), 'original-author-json');
    await attach();
    const first = await workspace.saveSong(song(), undefined, undefined, true);
    first.song.drafts.dance!.chart.title = 'Disk newer';
    await workspace.saveSong(first.song, first.location.revision);
    const repeated = await workspace.saveSong(song(), undefined, undefined, true);
    expect(repeated.song.drafts.dance?.chart.title).toBe('Disk newer');
    expect(
      JSON.parse(
        await readFile(path.join(root, '愛包', '.wfp-backup', 'wfp-dance-draft.json'), 'utf8'),
      ).title,
    ).toBe('愛包');
    expect(await readFile(path.join(root, '愛包', 'author.wfp.json'), 'utf8')).toBe(
      'original-author-json',
    );
  });
  it('rejects a later invalid edition before replacing any chart and persists removal on disk', async () => {
    await attach();
    const first = await workspace.saveSong(song());
    const invalid = structuredClone(first.song);
    invalid.drafts.dance!.chart.title = 'Must not write';
    invalid.released.dance = structuredClone(invalid.drafts.dance!);
    invalid.released.dance.chart.videoHint.assetId = '99999999-8888-4777-a666-555555555555';
    await expect(workspace.saveSong(invalid, first.location.revision)).rejects.toThrow(
      '视频尚未存入',
    );
    expect((await workspace.readProject('愛包')).song.drafts.dance?.chart.title).toBe('愛包');
    await workspace.saveSong(
      { id, hidden: true, drafts: {}, released: {} },
      first.location.revision,
    );
    expect((await scanMaps(root)).songs[0].hidden).toBe(true);
    expect(await readFile(path.join(root, '愛包', 'renamed.mp4'), 'utf8')).toBe('video-fixture');
  });
  it('persists albums and rejects paths outside maps', async () => {
    const album = { id: 'custom', name: 'Custom', cover: 'data:image/png;base64,YQ==' };
    await workspace.saveAlbum(album);
    expect(await new MapsWorkspace(root).albums()).toEqual([album]);
    expect(await workspace.saveAlbum({ ...album, name: 'stale browser' }, true)).toEqual(album);
    await expect(
      workspace.attach({ id, title: 'x', assetId, source: '/__wfp/map-file/../package.json' }),
    ).rejects.toThrow();
  });
  it('recovers an interrupted multi-file save before reading and never shares a mutable cover between draft and release', async () => {
    await attach();
    const first = song();
    first.drafts.dance!.cover = 'data:image/png;base64,aW1hZ2U=';
    first.released.dance = structuredClone(first.drafts.dance!);
    const saved = await workspace.saveSong(first);
    const publishedCover = saved.song.released.dance!.cover;
    saved.song.drafts.dance!.cover = 'data:image/png;base64,bmV3LWltYWdl';
    const updated = await workspace.saveSong(saved.song, saved.location.revision);
    expect(updated.song.released.dance!.cover).toBe(publishedCover);
    expect(updated.song.drafts.dance!.cover).not.toBe(publishedCover);
    const metadata = JSON.parse(await readFile(path.join(root, '愛包', 'project.json'), 'utf8'));
    const file = 'wfp-dance-draft.json';
    const chart = JSON.parse(await readFile(path.join(root, '愛包', file), 'utf8'));
    chart.title = 'Recovered after interruption';
    await writeFile(
      path.join(root, '愛包', '.wfp-save.json'),
      JSON.stringify({ project: metadata, charts: [{ file, data: JSON.stringify(chart) }] }),
    );
    await writeFile(path.join(root, '愛包', file), '{partial');
    const recovered = await new MapsWorkspace(root).readProject('愛包');
    expect(recovered.song.drafts.dance?.chart.title).toBe('Recovered after interruption');
    expect(recovered.song.released.dance?.cover).toBe(publishedCover);
  });
});
