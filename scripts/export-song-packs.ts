import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CHART_TYPES } from '../src/chart-types';
import { DEFAULT_ALBUMS, latestEdition } from '../src/library';
import { PACK_FORMAT, playablePackChart, type MapLibrary, type SongPack } from '../src/song-pack';
import { zipHeaders, zipEnd } from '../src/zip';

type Entry = { name: string; size: number; file?: string; bytes?: Buffer };
type Plan = { entries: Entry[]; fileName: string };
const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

export async function preparePack(
  directory: string,
  library: MapLibrary,
  ids: string[],
  single = false,
): Promise<Plan> {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string'))
    throw new Error('请选择已发布曲目。');
  const root = await realpath(directory);
  const entries: Entry[] = [];
  const folders = new Set<string>();
  const source = async (url: string): Promise<Omit<Entry, 'name'>> => {
    if (url.startsWith('data:image/')) {
      const match = /^data:image\/(png|webp|jpeg);base64,([a-zA-Z0-9+/=\s]+)$/.exec(url);
      if (!match) throw new Error('封面图片格式无效。');
      const bytes = Buffer.from(match[2], 'base64');
      return { bytes, size: bytes.length };
    }
    if (!url.startsWith('/__wfp/map-file/')) throw new Error('资源尚未保存在 maps 中。');
    const file = await realpath(
      path.resolve(root, decodeURIComponent(url.slice('/__wfp/map-file/'.length))),
    );
    const relative = path.relative(root, file);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
      throw new Error('资源超出 maps 目录。');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('资源不是文件。');
    return { file, size: info.size };
  };
  const selected = [...new Set(ids)];
  for (const id of selected) {
    const song = library.songs.find((s) => s.id === id && !s.hidden);
    if (!song || !CHART_TYPES.some((type) => song.released[type]))
      throw new Error('所选曲目不存在或尚未发布，请重新打开本地作品。');
    const title = latestEdition({ ...song, drafts: {} }).chart.title;
    let base =
      Array.from(title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim())
        .slice(0, 64)
        .join('')
        .replace(/[. ]+$/, '') || 'Song';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `Song-${base}`;
    let folder = base;
    for (let n = 2; folders.has(folder.normalize('NFC').toLowerCase()); n++)
      folder = `${base} (${n})`;
    folders.add(folder.normalize('NFC').toLowerCase());
    const add = (name: string, resource: Omit<Entry, 'name'>) => {
      entries.push({ name: `${folder}/${name}`, ...resource });
      return name;
    };
    const json = (name: string, value: unknown) => {
      const bytes = Buffer.from(JSON.stringify(value, null, 2));
      return add(name, { bytes, size: bytes.length });
    };
    const pictures = new Map<string, string>(),
      videos = new Map<string, string>();
    const picture = async (url: string, prefix: string) => {
      if (!url) return undefined;
      if (pictures.has(url)) return pictures.get(url)!;
      const resource = await source(url);
      const extension = url.startsWith('data:')
        ? /^data:image\/(\w+)/.exec(url)![1].replace('jpeg', 'jpg')
        : path.extname(resource.file!).slice(1);
      if (!['png', 'jpg', 'jpeg', 'webp'].includes(extension)) throw new Error('封面格式无效。');
      const name = add(`${prefix}.${extension}`, resource);
      pictures.set(url, name);
      return name;
    };
    const charts: SongPack['charts'] = {};
    try {
      for (const type of CHART_TYPES) {
        const edition = song.released[type];
        if (!edition) continue;
        const chart = playablePackChart(edition.chart, type);
        const assetId = chart.videoHint.assetId;
        const asset = library.videos.find((v) => v.id === assetId || v.aliases?.includes(assetId!));
        if (!asset) throw new Error('视频文件未找到。');
        let video = videos.get(asset.id);
        if (!video) {
          video = add(
            videos.size ? `video-${videos.size + 1}.mp4` : 'video.mp4',
            await source(asset.url),
          );
          videos.set(asset.id, video);
        }
        const group =
          library.albums.find((a) => a.id === edition.albumId) ??
          DEFAULT_ALBUMS.find((a) => a.id === edition.albumId);
        if (!group) throw new Error('专辑未找到。');
        const album = {
          id: group.id,
          name: group.name,
          cover: await picture(group.cover, `${type}-album`),
          ...(group.coverEffect !== undefined ? { coverEffect: group.coverEffect } : {}),
        };
        const cover = await picture(edition.cover, `${type}-cover`);
        const { assetId: _localId, ...hint } = chart.videoHint;
        json(`${type}.wfp.json`, {
          ...chart,
          songId: song.id,
          videoHint: { ...hint, fileName: video },
        });
        charts[type] = { file: `${type}.wfp.json`, video, cover, album };
      }
      const first = Object.values(charts)[0] as Exclude<
        NonNullable<SongPack['charts']['dance']>,
        string
      >;
      json('song.json', {
        format: PACK_FORMAT,
        version: 1,
        id: song.id,
        title,
        video: first.video,
        cover: first.cover,
        album: first.album,
        charts,
      });
    } catch (error) {
      throw new Error(`「${title}」无法导出：${(error as Error).message}`);
    }
  }
  return {
    entries,
    fileName: single
      ? `${entries[0].name.split('/')[0]}.wfp.zip`
      : `Waifu-Fit-Player-${selected.length}-songs.wfp.zip`,
  };
}

/** One bounded file stream; ZIP data descriptors let checksums follow each payload. */
export async function* packStream(entries: Entry[]) {
  const central: Uint8Array[] = [];
  let offset = 0,
    centralSize = 0,
    zip64 = false;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const headers = zipHeaders(name, entry.size, 0, offset);
    const h = new DataView(headers.local.buffer);
    h.setUint16(6, 0x808, true);
    if (entry.size < 0xffffffff) {
      h.setUint32(18, 0, true);
      h.setUint32(22, 0, true);
    }
    yield headers.local;
    let crc = 0xffffffff,
      read = 0;
    const stream = entry.file
      ? createReadStream(entry.file, { highWaterMark: 256 * 1024 })
      : Readable.from([entry.bytes!]);
    try {
      for await (const value of stream) {
        const bytes = value as Buffer;
        read += bytes.length;
        if (read > entry.size) throw new Error('导出期间文件发生变化。');
        for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
        yield bytes;
      }
    } finally {
      stream.destroy();
    }
    if (read !== entry.size) throw new Error('导出期间文件大小发生变化。');
    crc = (crc ^ 0xffffffff) >>> 0;
    const large = entry.size >= 0xffffffff;
    const descriptor = Buffer.alloc(large ? 24 : 16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    if (large) {
      descriptor.writeBigUInt64LE(BigInt(read), 8);
      descriptor.writeBigUInt64LE(BigInt(read), 16);
    } else {
      descriptor.writeUInt32LE(read, 8);
      descriptor.writeUInt32LE(read, 12);
    }
    yield descriptor;
    const directory = zipHeaders(name, entry.size, crc, offset).directory;
    new DataView(directory.buffer).setUint16(8, 0x808, true);
    central.push(directory);
    centralSize += directory.length;
    zip64 ||= headers.zip64;
    offset += headers.local.length + entry.size + descriptor.length;
  }
  yield* central;
  yield zipEnd(entries.length, centralSize, offset, zip64);
}

export function packLength(entries: Entry[]) {
  let offset = 0,
    central = 0,
    zip64 = false;
  for (const entry of entries) {
    const h = zipHeaders(new TextEncoder().encode(entry.name), entry.size, 0, offset);
    offset += h.local.length + entry.size + (entry.size >= 0xffffffff ? 24 : 16);
    central += h.directory.length;
    zip64 ||= h.zip64;
  }
  return offset + central + zipEnd(entries.length, central, offset, zip64).length;
}

type ExportJob = {
  state: 'working' | 'done' | 'error';
  progress: number;
  path?: string;
  error?: string;
};
export function exportHandler(directory: string, scan: () => Promise<MapLibrary>) {
  const jobs = new Map<string, ExportJob>();
  const output = process.env.WFP_MAPS_DIR
    ? path.join(directory, '.exports')
    : path.resolve('exports');
  return async (req: IncomingMessage, res: ServerResponse) => {
    const reply = (status: number, body: unknown) =>
      res
        .writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify(body));
    try {
      if (req.method === 'POST' && req.url?.split('?')[0] === '/__wfp/export-packs') {
        if (
          req.headers['x-wfp-workspace'] !== '1' ||
          (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
        ) {
          reply(403, { error: '请求来源无效。' });
          return;
        }
        if ([...jobs.values()].some((job) => job.state === 'working')) {
          reply(409, { error: '已有曲包正在导出，请等待完成。' });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024 * 1024) throw new Error('导出选择过大。');
          chunks.push(Buffer.from(chunk));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const plan = await preparePack(directory, await scan(), body.songIds, body.single === true);
        await mkdir(output, { recursive: true });
        const id = randomUUID();
        const fileName =
          plan.fileName.replace(/\.wfp\.zip$/, '') +
          '-' +
          new Date().toISOString().replace(/[:.]/g, '-') +
          '-' +
          id.slice(0, 8) +
          '.wfp.zip';
        const target = path.join(output, fileName),
          temporary = target + '.partial';
        const job: ExportJob = { state: 'working', progress: 0 };
        if (jobs.size >= 8) jobs.delete(jobs.keys().next().value!);
        jobs.set(id, job);
        const total = packLength(plan.entries);
        void (async () => {
          try {
            let written = 0;
            async function* tracked() {
              for await (const bytes of packStream(plan.entries)) {
                written += bytes.length;
                job.progress = Math.min(0.99, written / total);
                yield bytes;
              }
            }
            await pipeline(Readable.from(tracked()), createWriteStream(temporary, { flags: 'wx' }));
            if ((await stat(temporary)).size !== total) throw new Error('生成的曲包大小不完整。');
            await rename(temporary, target);
            job.progress = 1;
            job.path = target;
            job.state = 'done';
          } catch (error) {
            await rm(temporary, { force: true }).catch(() => {});
            job.error = (error as Error).message;
            job.state = 'error';
          }
        })();
        reply(202, { jobId: id });
      } else if (req.method === 'GET') {
        const id = req.url?.split('?')[0].split('/').at(-1) ?? '';
        const job = jobs.get(id);
        reply(job ? 200 : 404, job ?? { error: '导出任务不存在。' });
      } else reply(405, { error: '请求方式无效。' });
    } catch (error) {
      reply(400, { error: (error as Error).message });
    }
  };
}
