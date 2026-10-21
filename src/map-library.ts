import { emptyMapLibrary, type MapLibrary, type PackVideo } from './song-pack';
import type { MapLocation } from './song-pack';
import type { Song } from './library';

let loading: Promise<MapLibrary> | undefined;
let videos = new Map<string, PackVideo>();
const locations = new Map<string, MapLocation>();

export function readMapLibrary(refresh = false): Promise<MapLibrary> {
  if (refresh) loading = undefined;
  if (!loading)
    loading = (async () => {
      const response = await fetch('/__wfp/maps', { cache: 'no-store' });
      // Static hosting has no disk bridge. Saving must fail explicitly there.
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
      for (const [id, location] of Object.entries(data.locations ?? {}))
        if (!locations.has(id)) locations.set(id, location);
      return data;
    })().catch((error) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

export const mapLocation = (id: string) => locations.get(id);
export function registerMapWrite(data: {
  song?: Song;
  video?: PackVideo;
  videos?: PackVideo[];
  location: MapLocation;
}) {
  if (data.song) locations.set(data.song.id, data.location);
  for (const video of [...(data.videos ?? []), ...(data.video ? [data.video] : [])]) {
    videos.set(video.id, video);
    for (const alias of video.aliases ?? [])
      if (!videos.has(alias) || videos.get(alias)?.id === video.id) videos.set(alias, video);
  }
}

export async function mapVideo(id: string, refresh = false): Promise<PackVideo | undefined> {
  await readMapLibrary(refresh);
  return videos.get(id);
}
