/** Keep the current compressed track as one Blob, never a partial HTTP media buffer. */
export async function loadMenuBgm(url: string, signal: AbortSignal): Promise<Blob> {
  const download = async (range: boolean) => {
    const requestUrl = range
      ? url
      : `${url}${url.includes('?') ? '&' : '?'}bgm-retry=${crypto.randomUUID()}`;
    const response = await fetch(requestUrl, {
      signal,
      headers: { Range: 'bytes=0-' },
      ...(range ? {} : { cache: 'reload' as const }),
    });
    if (!response.ok || response.status === 204) throw new Error(`BGM HTTP ${response.status}`);
    if (/^(text\/|application\/json)/i.test(response.headers.get('Content-Type') ?? ''))
      throw new Error('BGM response is not audio');
    const file = await response.blob();
    if (!file.size) throw new Error('Empty BGM response');
    if (response.status === 206) {
      const part = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') ?? '');
      if (
        !part ||
        Number(part[1]) !== 0 ||
        Number(part[2]) + 1 !== Number(part[3]) ||
        file.size !== Number(part[3])
      )
        throw new Error('Incomplete BGM response');
    }
    return file;
  };
  try {
    return await download(true);
  } catch (error) {
    if (signal.aborted) throw error;
    // Keep the full Range request: plain media GETs can themselves return empty 204s.
    // One fresh URL bypasses stale responses; cancellation wins without a retry loop.
    return download(false);
  }
}
