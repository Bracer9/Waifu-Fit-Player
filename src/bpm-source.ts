import { CustomSource, UrlSource } from 'mediabunny';

/** Local HTTP media: finish bounded reads instead of repeatedly aborting open-ended responses. */
export function createBpmSource(url: string) {
  if (url.startsWith('blob:')) {
    return new UrlSource(url, { maxCacheSize: 8 * 1024 * 1024, getRetryDelay: () => null });
  }
  const controller = new AbortController();
  const request = { cache: 'no-store' as const, signal: controller.signal };
  return new CustomSource({
    maxCacheSize: 8 * 1024 * 1024,
    prefetchProfile: 'fileSystem',
    getSize: async () => {
      const response = await fetch(url, { ...request, method: 'HEAD' });
      const size = Number(response.headers.get('Content-Length'));
      if (!response.ok || !Number.isSafeInteger(size) || size <= 0) {
        throw new Error('Cannot read audio source size');
      }
      return size;
    },
    read: async (start, end) => {
      const response = await fetch(url, {
        ...request,
        headers: { Range: `bytes=${start}-${end - 1}` },
      });
      if (response.status !== 206) {
        await response.body?.cancel();
        throw new Error('Audio source must support byte ranges');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== end - start) throw new Error('Incomplete audio source range');
      return bytes;
    },
    dispose: () => controller.abort(),
  });
}
