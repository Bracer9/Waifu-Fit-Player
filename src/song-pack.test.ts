import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
  symlink,
  stat,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findMapVideo, scanMaps } from '../scripts/maps-library';
import { blankChart } from './model';
import {
  mergeMapSongs,
  PACK_FORMAT,
  packPath,
  parseSongPack,
  playablePackChart,
  type SongPack,
} from './song-pack';
import type { Song } from './library';
import { createZip } from './zip';

let temporary: string;
beforeEach(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'wfp-pack-test-'));
});
afterEach(async () => {
  if (!path.resolve(temporary).startsWith(path.join(path.resolve(tmpdir()), 'wfp-pack-test-')))
    throw new Error('Unexpected test directory');
  await rm(temporary, { recursive: true, force: true });
});
const id = '11111111-2222-4333-a444-555555555555';
const chart = () => ({
  ...blankChart('曲包 / Song'),
  tempoSegments: [{ id: 'tempo', anchorMs: 0, bpm: 120, meter: '4/4' as const }],
  videoHint: { fileName: 'video.mp4', durationMs: 20000 },
  videoOffsetMs: 120,
  playRange: { startMs: 2000, endMs: 18000 },
  notes: [
    {
      id: 'n1',
      lane: 'punch' as const,
      direction: 'left' as const,
      kind: 'tap' as const,
      timeMs: 4000,
    },
  ],
});
const manifest = (): SongPack => ({
  format: PACK_FORMAT,
  version: 1,
  id,
  title: '曲包 / Song',
  video: 'video.mp4',
  cover: 'cover.png',
  album: { id: 'anime', name: '动漫' },
  charts: { fitness: 'fitness.wfp.json', dance: 'dance.wfp.json' },
});
async function fixture(folder: string) {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'song.json'), JSON.stringify(manifest()));
  await writeFile(path.join(folder, 'video.mp4'), 'fake video');
  await writeFile(path.join(folder, 'cover.png'), 'fake image');
  await writeFile(
    path.join(folder, 'fitness.wfp.json'),
    JSON.stringify({ ...chart(), chartType: 'fitness', intensity: 'high' }),
  );
  await writeFile(
    path.join(folder, 'dance.wfp.json'),
    JSON.stringify({ ...chart(), chartType: 'dance', danceDifficulty: 7 }),
  );
}

describe('renamed local videos', () => {
  it('finds a renamed loose MP4 without a chart and refuses ambiguous or modified files', async () => {
    const folder = path.join(temporary, 'song');
    await mkdir(folder);
    const original = path.join(folder, 'original.mp4');
    await writeFile(original, 'video');
    const info = await stat(original);
    const timestamp = Math.trunc(info.mtimeMs);
    const renamed = path.join(folder, 'new name.mp4');
    await rename(original, renamed);
    expect(await findMapVideo(temporary, info.size, timestamp)).toEqual({
      fileName: 'new name.mp4',
      url: '/__wfp/map-file/song/new%20name.mp4',
    });
    const duplicate = path.join(folder, 'copy.mp4');
    await writeFile(duplicate, 'video');
    await utimes(duplicate, info.atime, new Date(timestamp));
    expect(await findMapVideo(temporary, info.size, timestamp)).toBeUndefined();
    await rm(duplicate);
    await writeFile(renamed, 'different video');
    expect(await findMapVideo(temporary, info.size, timestamp)).toBeUndefined();
    await expect(findMapVideo(temporary, -1, timestamp)).rejects.toThrow();
  });
  it('does not search hidden directories or follow links outside maps', async () => {
    const outside = path.join(temporary, 'outside.mp4');
    await writeFile(outside, 'video');
    const info = await stat(outside);
    const maps = path.join(temporary, 'maps');
    await mkdir(path.join(maps, '.hidden'), { recursive: true });
    await writeFile(path.join(maps, '.hidden/video.mp4'), 'video');
    try {
      await symlink(outside, path.join(maps, 'link.mp4'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    }
    expect(await findMapVideo(maps, info.size, Math.trunc(info.mtimeMs))).toBeUndefined();
  });
});

describe('portable song folders', () => {
  it('keeps the optional cover effect in exported album metadata and rejects invalid settings', () => {
    const pack = manifest();
    pack.album.coverEffect = 'none';
    expect(parseSongPack(JSON.parse(JSON.stringify(pack))).album.coverEffect).toBe('none');
    expect(() =>
      parseSongPack({ ...pack, album: { ...pack.album, coverEffect: 'other' } }),
    ).toThrow('特效');
  });
  it('loads both editions and their metadata without rewriting notes or timing; relocation keeps IDs', async () => {
    const root = path.join(temporary, 'maps'),
      folder = path.join(root, '曲包');
    await fixture(folder);
    const credits = { music: '音楽作者', video: 'Video Studio', mapper: 'Mapper / 製作者' };
    const exportedChart = playablePackChart({ ...chart(), credits, danceDifficulty: 7 }, 'dance');
    await writeFile(path.join(folder, 'dance.wfp.json'), JSON.stringify(exportedChart));
    const loaded = await scanMaps(root);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.songs).toHaveLength(1);
    expect(loaded.videos).toHaveLength(1);
    const song = loaded.songs[0];
    expect(song.drafts).toEqual({});
    expect(song.released.fitness?.chart).toMatchObject({
      ...chart(),
      chartType: 'fitness',
      intensity: 'high',
      videoHint: { durationMs: 20000, assetId: loaded.videos[0].id },
    });
    expect(song.released.dance?.chart.danceDifficulty).toBe(7);
    expect(song.released.dance?.chart.credits).toEqual(credits);
    expect(song.released.dance?.cover).toContain(encodeURIComponent('曲包'));
    expect(song.released.fitness?.albumId).toBe('anime');
    const moved = path.join(temporary, 'elsewhere');
    await rename(root, moved);
    await rename(path.join(moved, '曲包'), path.join(moved, 'renamed'));
    const again = await scanMaps(moved);
    expect(again.songs[0].id).toBe(id);
    expect(again.videos[0].id).toBe(loaded.videos[0].id);
    expect(again.videos[0].url).toContain('/renamed/');
    expect(again.songs[0].released.dance?.chart.credits).toEqual(credits);
  });
  it('supports an old loose JSON and missing optional metadata, matching the named video only', async () => {
    const folder = path.join(temporary, 'legacy');
    await mkdir(folder);
    const old = chart();
    await writeFile(path.join(folder, 'old.wfp.json'), JSON.stringify(old));
    await writeFile(path.join(folder, 'video.mp4'), 'video');
    await writeFile(path.join(folder, 'other.mp4'), 'wrong video');
    const loaded = await scanMaps(temporary);
    expect(loaded.songs[0].released.dance?.chart.chartType).toBe('dance');
    expect(loaded.songs[0].released.dance?.albumId).toBe('all');
    expect(loaded.videos[0].fileName).toBe('video.mp4');
    expect(loaded.songs[0].released.dance?.chart.danceDifficulty).toBeUndefined();
    await rm(path.join(folder, 'video.mp4'));
    const missing = await scanMaps(temporary);
    expect(missing.songs).toHaveLength(0);
    expect(missing.warnings[0]).toContain('没有找到');
  });
  it('isolates malformed packs and rejects duplicate identities and escaping resources', async () => {
    await fixture(path.join(temporary, 'good'));
    await fixture(path.join(temporary, 'duplicate'));
    await mkdir(path.join(temporary, 'broken'));
    await writeFile(path.join(temporary, 'broken/song.json'), '{bad json');
    const loaded = await scanMaps(temporary);
    expect(loaded.songs).toHaveLength(1);
    expect(loaded.warnings).toHaveLength(2);
    for (const name of [
      '../video.mp4',
      '/etc/passwd',
      'C:\\video.mp4',
      'https://a/video.mp4',
      'a/../../file',
      '%2e%2e/../video.mp4',
    ])
      expect(() => packPath(name)).toThrow();
    expect(() => parseSongPack({ ...manifest(), charts: {} })).toThrow();
  });
  it('does not follow a resource symlink outside its song folder', async () => {
    const folder = path.join(temporary, 'song');
    await fixture(folder);
    await writeFile(path.join(temporary, 'outside.mp4'), 'outside');
    await rm(path.join(folder, 'video.mp4'));
    try {
      await symlink(path.join(temporary, 'outside.mp4'), path.join(folder, 'video.mp4'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    expect((await scanMaps(temporary)).songs).toHaveLength(0);
  });
  it('duplicate loose JSON folders do not make the rest of the library disappear', async () => {
    for (const name of ['first', 'copy']) {
      const folder = path.join(temporary, name);
      await mkdir(folder);
      await writeFile(
        path.join(folder, 'dance.wfp.json'),
        JSON.stringify({ ...chart(), songId: id }),
      );
      await writeFile(path.join(folder, 'video.mp4'), 'video');
    }
    const loaded = await scanMaps(temporary);
    expect(loaded.songs).toHaveLength(1);
    expect(loaded.warnings).toHaveLength(1);
    expect(loaded.warnings[0]).toContain('重复');
  });
  it('preserves drafts, withdrawn releases and local removals when folders rescan', async () => {
    await fixture(path.join(temporary, 'song'));
    const packs = (await scanMaps(temporary)).songs;
    const local: Song = {
      id,
      drafts: {
        dance: { ...packs[0].released.dance!, chart: { ...chart(), title: 'My unsaved draft' } },
      },
      released: {},
    };
    expect(mergeMapSongs([local], packs)).toEqual([local]);
    expect(mergeMapSongs([{ id, hidden: true, drafts: {}, released: {} }], packs)).toEqual([]);
    expect(mergeMapSongs([], [])).toEqual([]);
    const legacyLocal = { ...packs[0], id: 'other-id' };
    expect(mergeMapSongs([legacyLocal], packs)).toEqual([legacyLocal]);
  });
});

it('writes a standard UTF-8 store ZIP with correct CRC32, offsets and original file bytes', async () => {
  const zip = await createZip([
    { name: '曲包/check.txt', blob: new Blob(['123456789']) },
    { name: '曲包/empty.txt', blob: new Blob([]) },
  ]);
  const buffer = Buffer.from(await zip.arrayBuffer());
  expect(buffer.readUInt32LE(0)).toBe(0x04034b50);
  expect(buffer.readUInt16LE(6)).toBe(0x800);
  expect(buffer.readUInt32LE(14)).toBe(0xcbf43926);
  const nameLength = buffer.readUInt16LE(26);
  expect(buffer.subarray(30, 30 + nameLength).toString()).toBe('曲包/check.txt');
  expect(buffer.subarray(30 + nameLength, 39 + nameLength).toString()).toBe('123456789');
  const end = buffer.length - 22;
  expect(buffer.readUInt32LE(end)).toBe(0x06054b50);
  expect(buffer.readUInt16LE(end + 10)).toBe(2);
  expect(buffer.readUInt32LE(buffer.readUInt32LE(end + 16))).toBe(0x02014b50);
  await writeFile(path.join(temporary, 'test.zip'), buffer);
  expect(await readFile(path.join(temporary, 'test.zip'))).toEqual(buffer);
  await expect(createZip([{ name: '../escape', blob: new Blob() }])).rejects.toThrow();
});
