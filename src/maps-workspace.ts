import type { Album, Song } from './library';
import { videoIds } from './library';
import { resolveVideo, type VideoAsset } from './local-media';
import { mapLocation, registerMapWrite } from './map-library';
import type { MapLocation, PackVideo } from './song-pack';

type Saved = { song: Song; videos: PackVideo[]; location: MapLocation };
async function response<T>(result: Response): Promise<T> {
  if (!result.ok) {
    const message = await result.json().catch(() => null);
    throw new Error(message?.error ?? '无法写入 maps，请确认正在运行新版本地服务。');
  }
  return result.json() as Promise<T>;
}
async function post<T>(endpoint: string, data: unknown) {
  return response<T>(
    await fetch('/__wfp/workspace/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WFP-Workspace': '1' },
      body: JSON.stringify(data),
    }),
  );
}

/** Files already in maps are adopted by metadata; outside files are copied once, as a stream. */
export async function storeMapVideo(
  id: string,
  title: string,
  asset: VideoAsset,
): Promise<VideoAsset> {
  const input = {
    id,
    title,
    assetId: asset.id,
    folder: mapLocation(id)?.folder,
    revision: mapLocation(id)?.revision,
    ...(asset.kind === 'file'
      ? { size: asset.file.size, lastModified: asset.file.lastModified }
      : { source: asset.url }),
  };
  const result = await fetch('/__wfp/workspace/attach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WFP-Workspace': '1' },
    body: JSON.stringify(input),
  });
  let saved: { song: Song; video: PackVideo; location: MapLocation };
  if (result.status === 404 && asset.kind === 'file') {
    const metadata = encodeURIComponent(JSON.stringify({ ...input, fileName: asset.file.name }));
    saved = await response(
      await fetch(`/__wfp/workspace/upload?metadata=${metadata}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-WFP-Workspace': '1' },
        body: asset.file,
      }),
    );
  } else saved = await response(result);
  registerMapWrite(saved);
  return { ...saved.video, kind: 'pack' };
}

export async function saveMapSong(song: Song, migration = false): Promise<Song> {
  // Editing directly from PAUSED keeps the existing <video>; adopt legacy pack
  // associations here too, before the first filesystem save of that song.
  if (!migration && !mapLocation(song.id)?.workspace) {
    for (const id of videoIds(song)) {
      const resolution = await resolveVideo(id);
      if (!('asset' in resolution)) throw new Error(resolution.reason);
      const edition = [...Object.values(song.drafts), ...Object.values(song.released)][0];
      await storeMapVideo(song.id, edition?.chart.title ?? 'Song', resolution.asset);
    }
  }
  const location = mapLocation(song.id);
  const saved = await post<Saved>('song', {
    song,
    folder: location?.folder,
    revision: migration ? undefined : location?.revision,
    migration,
  });
  registerMapWrite(saved);
  return saved.song;
}

export async function migrateMapSong(song: Song): Promise<Song> {
  for (const id of videoIds(song)) {
    const resolution = await resolveVideo(id);
    if (!('asset' in resolution)) throw new Error(resolution.reason);
    const edition = [...Object.values(song.drafts), ...Object.values(song.released)][0];
    await storeMapVideo(song.id, edition?.chart.title ?? 'Song', resolution.asset);
  }
  return saveMapSong(song, true);
}

export const saveMapAlbum = (album: Album, migration = false) =>
  post<Album>('album', { album, migration });
