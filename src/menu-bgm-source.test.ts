import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMenuBgm } from './menu-bgm-source';

const complete = () => new Response('audio', { headers: { 'Content-Type': 'audio/mp4' } });
afterEach(() => vi.unstubAllGlobals());

describe('complete menu BGM downloads', () => {
  it('keeps a complete range response without downloading a second copy', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response('audio', {
        status: 206,
        headers: { 'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 0-4/5' },
      }),
    );
    vi.stubGlobal('fetch', request);
    expect(await (await loadMenuBgm('/track.m4a', new AbortController().signal)).text()).toBe(
      'audio',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    () => new Response(null, { status: 204 }),
    () => new Response('', { headers: { 'Content-Type': 'audio/mp4' } }),
    () =>
      new Response('part', {
        status: 206,
        headers: { 'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 0-3/50' },
      }),
    () => new Response('<html>Fallback</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('unavailable', { status: 503 }),
  ])(
    'retries one invalid response with a fresh full Range and bypasses the HTTP cache',
    async (invalid) => {
      const request = vi.fn().mockResolvedValueOnce(invalid()).mockResolvedValueOnce(complete());
      vi.stubGlobal('fetch', request);
      const signal = new AbortController().signal;
      expect(await (await loadMenuBgm('/track.m4a', signal)).text()).toBe('audio');
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls[0][1]).toMatchObject({ signal, headers: { Range: 'bytes=0-' } });
      expect(request.mock.calls[1][0]).toMatch(/^\/track\.m4a\?bgm-retry=.+/);
      expect(request.mock.calls[1][1]).toEqual({
        signal,
        cache: 'reload',
        headers: { Range: 'bytes=0-' },
      });
    },
  );

  it('a transient network failure also gets exactly one fresh download', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Network failed'))
      .mockResolvedValueOnce(complete());
    vi.stubGlobal('fetch', request);
    expect((await loadMenuBgm('/track.mp3', new AbortController().signal)).size).toBe(5);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not retry cancellation or an obsolete scene/track load', async () => {
    const controller = new AbortController();
    const abort = new DOMException('Aborted', 'AbortError');
    const request = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(abort);
    });
    vi.stubGlobal('fetch', request);
    await expect(loadMenuBgm('/track.mp3', controller.signal)).rejects.toBe(abort);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('persistent failure stops after two attempts', async () => {
    const request = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })));
    vi.stubGlobal('fetch', request);
    await expect(loadMenuBgm('/track.mp3', new AbortController().signal)).rejects.toThrow(
      'BGM HTTP 503',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
});
