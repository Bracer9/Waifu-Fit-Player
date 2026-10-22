import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { Input, MP4 } from 'mediabunny';
import { createBpmSource } from './bpm-source';

afterEach(() => vi.unstubAllGlobals());

it('reads real MP4 metadata with complete bounded ranges and cancels on disposal', async () => {
  const file = await readFile('tests/fixtures/bpm-148.mp4');
  const requests: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(init);
      if (init.method === 'HEAD') {
        return new Response(null, { headers: { 'Content-Length': String(file.length) } });
      }
      const range = new Headers(init.headers).get('Range');
      // Open-ended reads reproduce the failing path; they must never be used here.
      const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? '');
      if (!match) throw new TypeError('Failed to fetch');
      const start = Number(match[1]),
        end = Number(match[2]);
      return new Response(file.subarray(start, end + 1), { status: 206 });
    }),
  );
  const input = new Input({ formats: [MP4], source: createBpmSource('/video.mp4') });
  try {
    expect(await input.getPrimaryAudioTrack()).not.toBeNull();
    expect(requests.some((request) => request.method !== 'HEAD')).toBe(true);
    expect(requests.every((request) => request.cache === 'no-store')).toBe(true);
  } finally {
    input.dispose();
  }
  expect(requests.every((request) => request.signal?.aborted)).toBe(true);
});

it('rejects a server ignoring ranges without buffering the whole video', async () => {
  const cancel = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'HEAD') {
        return new Response(null, { headers: { 'Content-Length': '100000000' } });
      }
      return new Response(new ReadableStream({ cancel }), { status: 200 });
    }),
  );
  const input = new Input({ formats: [MP4], source: createBpmSource('/video.mp4') });
  try {
    await expect(input.getPrimaryAudioTrack()).rejects.toThrow('byte ranges');
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    input.dispose();
  }
});
