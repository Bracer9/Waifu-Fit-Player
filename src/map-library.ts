import { emptyMapLibrary, type MapLibrary, type PackVideo } from './song-pack';

let loading: Promise<MapLibrary> | undefined;
let videos = new Map<string, PackVideo>();

export function readMapLibrary(): Promise<MapLibrary> {
  if (!loading)
    loading = (async () => {
      const response = await fetch('/__wfp/maps', { cache: 'no-store' });
      // Static hosting without the local maps reader still supports browser projects.
      if (response.status === 404) return emptyMapLibrary();
      if (!response.ok) throw new Error('无法扫描 maps 目录。');
      const data = (await response.json()) as MapLibrary;
      if (
        !Array.isArray(data.songs) ||
        !Array.isArray(data.albums) ||
        !Array.isArray(data.videos) ||
        !Array.isArray(data.warnings)
      )
        throw new Error('曲包目录清单无效。');
      const registered = new Map<string, PackVideo>();
      for (const video of data.videos) {
        if (!/^pack-[a-f0-9]{64}$/.test(video.id) || !video.url.startsWith('/__wfp/map-file/'))
          throw new Error('曲包视频地址无效。');
        registered.set(video.id, video);
        for (const id of video.aliases ?? []) if (!registered.has(id)) registered.set(id, video);
      }
      videos = registered;
      return data;
    })().catch((error) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

export async function mapVideo(id: string): Promise<PackVideo | undefined> {
  await readMapLibrary();
  return videos.get(id);
}
