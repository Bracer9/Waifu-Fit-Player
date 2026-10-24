import { copyFile, mkdir, readFile, rename, writeFile, unlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  emptyFitLog,
  mergeFitSession,
  parseFitSession,
  parseFitCheckIns,
  localFitDate,
  type FitLogData,
  type FitLogSession,
} from '../src/fit-log';

export class FitLogStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly directory: string) {}
  private async readFile(file: string): Promise<FitLogData> {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('运动记录文件不可用。');
    const data = JSON.parse(await readFile(file, 'utf8')) as FitLogData;
    if (data.version !== 1 || !Array.isArray(data.sessions))
      throw new Error('运动记录版本无法读取。');
    const sessions = data.sessions.map(parseFitSession);
    if (new Set(sessions.map((s) => s.id)).size !== sessions.length)
      throw new Error('运动记录包含重复 ID。');
    return { version: 1, sessions, checkIns: parseFitCheckIns(data.checkIns) };
  }
  private async load() {
    try {
      return await this.readFile(path.join(this.directory, 'sessions.json'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyFitLog();
      throw new Error(
        '本地运动记录无法读取，原文件已保留。请检查 sessions.json 或 sessions.backup.json。',
      );
    }
  }
  async read() {
    await this.queue.catch(() => {});
    return this.load();
  }
  save(input: FitLogSession): Promise<FitLogSession> {
    const next = parseFitSession(input);
    return this.update((data) => {
      const index = data.sessions.findIndex((s) => s.id === next.id);
      const merged = mergeFitSession(data.sessions[index], next);
      if (index >= 0) data.sessions[index] = merged;
      else data.sessions.push(merged);
      return merged;
    });
  }
  checkIn(date: string, checked: boolean, now = new Date()) {
    if (date !== localFitDate(now) || typeof checked !== 'boolean')
      return Promise.reject(new Error('只能为今天打卡或撤销打卡。'));
    return this.update((data) => {
      const dates = new Set(data.checkIns ?? []);
      if (checked) dates.add(date);
      else dates.delete(date);
      data.checkIns = [...dates].sort();
      return { checkIns: data.checkIns };
    });
  }
  private update<T>(mutate: (data: FitLogData) => T): Promise<T> {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        const data = await this.load();
        const result = mutate(data);
        await mkdir(this.directory, { recursive: true });
        const file = path.join(this.directory, 'sessions.json');
        const backup = path.join(this.directory, 'sessions.backup.json');
        for (const target of [file, backup]) {
          const info = await lstat(target).catch((e) => {
            if (e.code !== 'ENOENT') throw e;
            return undefined;
          });
          if (info?.isSymbolicLink()) throw new Error('运动记录路径不可用。');
        }
        const temporary = path.join(this.directory, `sessions.${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
          await copyFile(file, backup).catch((e) => {
            if (e.code !== 'ENOENT') throw e;
          });
          await rename(temporary, file);
        } finally {
          await unlink(temporary).catch(() => {});
        }
        return result;
      });
    this.queue = task;
    return task;
  }
}

export async function serveFitLog(req: IncomingMessage, res: ServerResponse, store: FitLogStore) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      res.end(JSON.stringify(await store.read()));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    if (
      req.headers['x-wfp-fit-log'] !== '1' ||
      (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
    ) {
      res.writeHead(403).end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) throw new Error('运动记录过大。');
      chunks.push(Buffer.from(chunk));
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.end(
      JSON.stringify(
        await (input?.action === 'check-in'
          ? store.checkIn(input.date, input.checked)
          : store.save(input)),
      ),
    );
  } catch (error) {
    res.statusCode = 409;
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}
