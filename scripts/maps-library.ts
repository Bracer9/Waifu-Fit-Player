import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { CHART_TYPES } from '../src/chart-types';
import type { Song, Album } from '../src/library';
import {
  emptyMapLibrary,
  parseSongPack,
  playablePackChart,
  type MapLibrary,
} from '../src/song-pack';

const hash = (value: string) => createHash('sha256').update(value.normalize('NFC')).digest('hex');
const fileUrl = (relative: string) =>
  '/__wfp/map-file/' + relative.split('/').map(encodeURIComponent).join('/');
const within = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const mime: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
};
const json = async (file: string) =>
  JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));

export async function scanMaps(directory: string): Promise<MapLibrary> {
  const result = emptyMapLibrary();
  const root = await realpath(directory).catch(() => null);
  if (!root) return result;
  const usedIds = new Set<string>();
  const resources = new Map<string, string>();
  const resolve = async (folder: string, name: string, extensions: string[]) => {
    const file = await realpath(path.resolve(folder, name));
    if (
      !within(folder, file) ||
      !within(root, file) ||
      !(await stat(file)).isFile() ||
      !extensions.includes(path.extname(file).toLowerCase())
    )
      throw new Error(`资源无效：${name}`);
    const relative = path.relative(root, file).split(path.sep).join('/');
    resources.set(file, relative);
    return file;
  };
  const video = async (folder: string, name: string, alias?: string, songId?: string) => {
    const file = await resolve(folder, name, ['.mp4']);
    const relative = resources.get(file)!;
    const key = songId
      ? `${songId}/${path.relative(folder, file).split(path.sep).join('/')}`
      : relative;
    const id = 'pack-' + hash(key);
    let entry = result.videos.find((v) => v.id === id);
    if (!entry) {
      entry = { id, fileName: path.basename(file), url: fileUrl(relative), aliases: [] };
      result.videos.push(entry);
    }
    if (alias && !entry.aliases!.includes(alias)) entry.aliases!.push(alias);
    return entry;
  };
  const picture = async (folder: string, name?: string) =>
    name
      ? fileUrl(resources.get(await resolve(folder, name, ['.png', '.webp', '.jpg', '.jpeg']))!)
      : '';
  const add = (song: Song) => {
    if (usedIds.has(song.id)) throw new Error('与其他曲包的歌曲 ID 重复，已跳过。');
    usedIds.add(song.id);
    result.songs.push(song);
  };
  const registerAlbum = (album: Album) => {
    if (!result.albums.some((a) => a.id === album.id)) result.albums.push(album);
  };
  const manifest = async (folder: string) => {
    const pack = parseSongPack(await json(path.join(folder, 'song.json')));
    if (usedIds.has(pack.id)) throw new Error('与其他曲包的歌曲 ID 重复，已跳过。');
    const song: Song = { id: pack.id, drafts: {}, released: {} };
    for (const type of CHART_TYPES) {
      const raw = pack.charts[type];
      if (!raw) continue;
      const entry = typeof raw === 'string' ? { file: raw } : raw;
      const file = await resolve(folder, entry.file, ['.json']);
      const chart = playablePackChart(await json(file), type);
      const asset = await video(
        folder,
        entry.video ?? pack.video,
        chart.videoHint.assetId,
        pack.id,
      );
      const group = entry.album ?? pack.album;
      const cover = await picture(folder, entry.cover ?? pack.cover);
      const albumCover = await picture(folder, group.cover);
      registerAlbum({ ...group, cover: albumCover });
      song.released[type] = {
        chart: {
          ...chart,
          songId: pack.id,
          videoHint: { ...chart.videoHint, assetId: asset.id, fileName: asset.fileName },
        },
        albumId: group.id,
        cover,
        updatedAt: (await stat(file)).mtimeMs,
      };
    }
    add(song);
  };
  const legacy = async (folder: string, files: string[]) => {
    const charts = files.filter((name) => /\.wfp\.json$/i.test(name));
    if (!charts.length) return;
    const song: Song = { id: '', drafts: {}, released: {} };
    const relative = path.relative(root, folder).split(path.sep).join('/');
    const digest = hash(relative || '.');
    song.id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    for (const name of charts) {
      try {
        const chart = playablePackChart(await json(await resolve(folder, name, ['.json'])));
        if (!Object.keys(song.released).length && chart.songId) song.id = chart.songId;
        if (chart.songId && chart.songId !== song.id)
          throw new Error('同目录包含不同歌曲 ID，请分别放入歌曲文件夹。');
        const type = chart.chartType ?? 'dance';
        if (song.released[type])
          throw new Error(`同目录有多份 ${type} 谱面，请使用 song.json 明确指定。`);
        const matches = files.filter(
          (f) => f.normalize('NFC') === chart.videoHint.fileName.normalize('NFC'),
        );
        if (matches.length !== 1) throw new Error('没有找到 videoHint.fileName 指定的视频。');
        const asset = await video(folder, matches[0], chart.videoHint.assetId, song.id);
        const covers = files.filter((f) => /cover.*\.(png|webp|jpe?g)$/i.test(f));
        const cover = covers.length === 1 ? await picture(folder, covers[0]) : '';
        song.released[type] = {
          chart: {
            ...chart,
            songId: song.id,
            videoHint: { ...chart.videoHint, assetId: asset.id, fileName: asset.fileName },
          },
          albumId: 'all',
          cover,
          updatedAt: (await stat(path.join(folder, name))).mtimeMs,
        };
      } catch (error) {
        result.warnings.push(`${path.join(relative, name)}：${(error as Error).message}`);
      }
    }
    if (Object.keys(song.released).length) add(song);
  };
  const walk = async (folder: string, depth: number) => {
    if (depth > 12) return;
    const entries = await readdir(folder, { withFileTypes: true }).catch((error) => {
      result.warnings.push(`${path.relative(root, folder)}：无法读取目录（${error.code}）。`);
      return [];
    });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort();
    if (files.includes('song.json')) {
      try {
        await manifest(folder);
      } catch (error) {
        result.warnings.push(
          `${path.relative(root, folder)}/song.json：${(error as Error).message}`,
        );
      }
      return;
    }
    try {
      await legacy(folder, files);
    } catch (error) {
      result.warnings.push(`${path.relative(root, folder)}：${(error as Error).message}`);
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name)))
      if (entry.isDirectory() && !entry.name.startsWith('.'))
        await walk(path.join(folder, entry.name), depth + 1);
  };
  await walk(root, 0);
  const editions = result.songs.flatMap((song) => Object.values(song.released));
  const usedVideos = new Set(editions.map((edition) => edition.chart.videoHint.assetId));
  const usedAlbums = new Set(editions.map((edition) => edition.albumId));
  result.videos = result.videos.filter((video) => usedVideos.has(video.id));
  result.albums = result.albums.filter((album) => usedAlbums.has(album.id));
  return result;
}

async function serveFile(
  directory: string,
  relative: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const root = await realpath(directory);
  const file = await realpath(path.resolve(root, relative));
  const type = mime[path.extname(file).toLowerCase()];
  if (!within(root, file) || !type) {
    res.writeHead(404).end();
    return;
  }
  const info = await stat(file);
  if (!info.isFile()) {
    res.writeHead(404).end();
    return;
  }
  let start = 0,
    end = info.size - 1;
  const headers: Record<string, string | number> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!range || (!range[1] && !range[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
      return;
    }
    start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(end, Number(range[2])) : end;
    if (start > end || start >= info.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
      return;
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1);
  res.writeHead(req.headers.range ? 206 : 200, headers);
  if (req.method === 'HEAD' || !info.size) {
    res.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/** Read-only localhost resources: no uploads, extraction, filesystem writes or arbitrary paths. */
export function mapsLibraryPlugin(): Plugin {
  const directory = path.resolve(process.env.WFP_MAPS_DIR ?? 'maps');
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = req.url?.split('?')[0] ?? '';
    if (pathname !== '/__wfp/maps' && !pathname.startsWith('/__wfp/map-file/')) {
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    void (async () => {
      if (pathname === '/__wfp/maps') {
        const data = await scanMaps(directory);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
      } else
        await serveFile(
          directory,
          decodeURIComponent(pathname.slice('/__wfp/map-file/'.length)),
          req,
          res,
        );
    })().catch(() => {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    });
  };
  return {
    name: 'wfp-local-maps',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
