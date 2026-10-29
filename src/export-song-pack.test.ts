import { afterEach, expect, it, vi } from 'vitest';
import { exportSongPackLocally } from './export-song-pack';
import type { Song } from './library';
afterEach(() => vi.unstubAllGlobals());
it('submits IDs, waits for local completion, and never downloads video or a ZIP', async () => {
  const fetcher = vi.fn(async (_url: string, _options?: RequestInit) =>
    Response.json({ jobId: '11111111-2222-4333-a444-555555555555' }),
  );
  fetcher
    .mockResolvedValueOnce(
      Response.json({ jobId: '11111111-2222-4333-a444-555555555555' }, { status: 202 }),
    )
    .mockResolvedValueOnce(
      Response.json({ state: 'done', progress: 1, path: 'D:/exports/songs.zip' }),
    );
  vi.stubGlobal('fetch', fetcher);
  const song = { id: 'song' } as Song;
  expect(await exportSongPackLocally([song, song])).toBe('D:/exports/songs.zip');
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({
    songIds: ['song'],
    single: false,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('reports missing files and old local program explicitly', async () => {
  await expect(exportSongPackLocally([])).rejects.toThrow('请先选择');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ error: '视频不存在' }, { status: 400 })),
  );
  await expect(exportSongPackLocally({ id: 'song' } as Song)).rejects.toThrow('视频不存在');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })),
  );
  await expect(exportSongPackLocally({ id: 'song' } as Song)).rejects.toThrow('重新启动');
});
