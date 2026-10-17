import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readdir, realpath, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage } from 'node:http';
import busboy from 'busboy';
import type { Connect, Plugin } from 'vite';

const endpoint = '/api/video-export';

function run(binary: string, args: string[], signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      signal,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let error = '';
    let failure: Error | undefined;
    child.stderr.on('data', (chunk: Buffer) => {
      error = (error + chunk.toString()).slice(-3000);
    });
    child.on('error', (reason) => {
      failure = reason;
    });
    child.on('close', (code) =>
      code === 0 && !failure
        ? resolve()
        : reject(failure ?? new Error(error || 'FFmpeg 未能完成合成。')),
    );
  });
}

async function findFFmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    'ffmpeg',
    // Also support the existing local Conda installation without changing PATH.
    path.join(homedir(), 'miniconda3', 'Library', 'bin', 'ffmpeg.exe'),
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    try {
      await run(candidate, ['-version']);
      return candidate;
    } catch {
      /* try next location */
    }
  }
  throw new Error('未找到 FFmpeg。请将 FFmpeg 加入 PATH，或设置 FFMPEG_PATH 后重新启动项目。');
}

async function matchingAudio(maps: string, videoName: string) {
  if (!videoName || path.basename(videoName) !== videoName) return null;
  const matches: string[] = [];
  async function visit(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === videoName)) matches.push(dir);
    for (const entry of entries) if (entry.isDirectory()) await visit(path.join(dir, entry.name));
  }
  try {
    await visit(maps);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  // Ambiguous video names must be resolved by the user, not guessed.
  if (matches.length !== 1) return null;
  const files = (await readdir(matches[0], { withFileTypes: true })).filter(
    (entry) => entry.isFile() && /\.mp3$/i.test(entry.name),
  );
  const stem = path.parse(videoName).name.toLowerCase();
  const audio =
    files.find((entry) => path.parse(entry.name).name.toLowerCase() === stem) ??
    (files.length === 1 ? files[0] : null);
  return audio
    ? { name: audio.name, path: path.relative(maps, path.join(matches[0], audio.name)) }
    : null;
}

async function localAudio(maps: string, relative: string) {
  const root = await realpath(maps);
  const resolved = await realpath(path.resolve(root, relative));
  const within = path.relative(root, resolved);
  if (within.startsWith('..') || path.isAbsolute(within) || !/\.mp3$/i.test(resolved)) {
    throw new Error('默认 MP3 必须位于 maps 目录内。');
  }
  return resolved;
}

async function receiveFiles(req: IncomingMessage, dir: string, signal: AbortSignal) {
  const form = busboy({
    headers: req.headers,
    limits: { files: 2, fields: 3, parts: 5, fieldSize: 4096 },
  });
  const fields: Record<string, string> = {};
  const files = new Set<string>();
  const writes: Promise<void>[] = [];
  form.on('field', (name, value, info) => {
    if (!['audioPath', 'leadMs', 'duration'].includes(name) || info.valueTruncated) {
      form.destroy(new Error('导出参数无效。'));
    } else fields[name] = value;
  });
  form.on('file', (name, file) => {
    if (!['video', 'audio'].includes(name) || files.has(name)) {
      file.resume();
      form.destroy(new Error('导出文件无效。'));
      return;
    }
    files.add(name);
    const write = pipeline(file, createWriteStream(path.join(dir, name)), { signal });
    writes.push(write);
    void write.catch((error: Error) => form.destroy(error));
  });
  for (const limit of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) {
    form.on(limit, () => form.destroy(new Error('导出文件或参数过多。')));
  }
  try {
    await pipeline(req, form, { signal });
    await Promise.all(writes);
  } catch (error) {
    await Promise.allSettled(writes);
    throw error;
  }
  if (!files.has('video') || (!files.has('audio') && !fields.audioPath)) {
    throw new Error('缺少录制画面或 MP3 文件。');
  }
  return { fields, uploadedAudio: files.has('audio') };
}

/** Local-only muxing; ordinary playback never starts FFmpeg or uploads media. */
export function videoExportServer(): Plugin {
  let maps = '';
  let ffmpeg: Promise<string> | undefined;
  const getFFmpeg = () =>
    (ffmpeg ??= findFFmpeg().catch((error) => {
      ffmpeg = undefined;
      throw error;
    }));
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(`${endpoint}/`)) {
      next();
      return;
    }
    // Do not expose local files/muxing to cross-origin requests or DNS rebinding.
    const host = req.headers.host ?? '';
    if (
      !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host) ||
      (req.headers.origin && req.headers.origin !== `http://${host}`) ||
      (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')
    ) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const execute = async () => {
      if (req.method === 'GET' && url.pathname === `${endpoint}/setup`) {
        await getFFmpeg();
        const audio = await matchingAudio(maps, url.searchParams.get('video') ?? '');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ audio }));
        return;
      }
      if (req.method !== 'POST' || url.pathname !== `${endpoint}/mux`) {
        res.writeHead(404).end();
        return;
      }
      const binary = await getFFmpeg();
      const dir = await mkdtemp(path.join(tmpdir(), 'wfp-export-'));
      try {
        const { fields, uploadedAudio } = await receiveFiles(req, dir, abort.signal);
        const leadMs = Number(fields.leadMs);
        const duration = Number(fields.duration);
        if (
          !Number.isFinite(leadMs) ||
          leadMs < 0 ||
          leadMs > 10_000 ||
          !Number.isFinite(duration) ||
          duration <= 0 ||
          duration > 86_400
        ) {
          throw new Error('录制时间无效，请重新导出。');
        }
        const audio = uploadedAudio
          ? path.join(dir, 'audio')
          : await localAudio(maps, fields.audioPath);
        const output = path.join(dir, 'output.mp4');
        // The captured game already includes chart/video offsets. Only compensate
        // the measured recording lead-in; a beat-grid anchor is NOT an audio delay.
        await run(
          binary,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-nostdin',
            '-y',
            '-f',
            'mov',
            '-i',
            path.join(dir, 'video'),
            '-itsoffset',
            (leadMs / 1000).toFixed(6),
            '-f',
            'mp3',
            '-i',
            audio,
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            '-c',
            'copy',
            '-t',
            duration.toFixed(6),
            '-map_metadata',
            '-1',
            '-movflags',
            '+faststart',
            output,
          ],
          abort.signal,
        );
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', (await stat(output)).size);
        await pipeline(createReadStream(output), res, { signal: abort.signal });
      } finally {
        // This unique temp directory contains only files created by this request.
        await rm(dir, { recursive: true, force: true, maxRetries: 3 });
      }
    };
    void execute().catch((error: unknown) => {
      if (res.destroyed) return;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'MP3 合成失败。' }));
    });
  };
  return {
    name: 'local-video-export',
    configResolved(config) {
      maps = path.join(config.root, 'maps');
    },
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
