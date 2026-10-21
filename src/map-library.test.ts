import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());
it('copying a song never redirects another song canonical video, and legacy association IDs stay stable', async () => {
  vi.resetModules();
  const id = 'pack-' + 'a'.repeat(64),
    copy = 'pack-' + 'b'.repeat(64);
  const alias = '11111111-2222-4333-a444-555555555555';
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          songs: [],
          albums: [],
          warnings: [],
          videos: [
            { id, aliases: [alias], fileName: 'original.mp4', url: '/__wfp/map-file/original.mp4' },
          ],
        }),
      }),
  );
  const { readMapLibrary, registerMapWrite, mapVideo } = await import('./map-library');
  await readMapLibrary();
  registerMapWrite({
    location: { folder: 'copy', workspace: true },
    video: {
      id: copy,
      aliases: [id, alias],
      fileName: 'copy.mp4',
      url: '/__wfp/map-file/copy.mp4',
    },
  });
  expect((await mapVideo(id))?.fileName).toBe('original.mp4');
  expect((await mapVideo(copy))?.fileName).toBe('copy.mp4');
  const { resolveVideo } = await import('./local-media');
  expect(await resolveVideo(alias)).toMatchObject({
    asset: { id: alias, kind: 'pack', fileName: 'original.mp4' },
  });
});
