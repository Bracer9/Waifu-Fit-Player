import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_ALBUMS, readLibrary, type Album, type Song } from './library';
import { readMapLibrary } from './map-library';
import { mergeMapSongs } from './song-pack';
import { migrateMapSong, saveMapAlbum, saveMapSong } from './maps-workspace';
import { mapLocation, registerMapWrite } from './map-library';

export function useLibrary(notify: (text: string) => void) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState(DEFAULT_ALBUMS);
  const [ready, setReady] = useState(false);
  const loaded = useRef<Promise<void> | null>(null);
  const current = useRef<Song[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const load = useCallback(() => {
    if (!loaded.current)
      loaded.current = Promise.all([
        readLibrary('songs').catch(() => [] as Song[]),
        readLibrary('albums').catch(() => [] as Album[]),
        readMapLibrary(),
      ])
        .then(async ([legacySongs, legacyAlbums, packs]) => {
          const recovered: Song[] = [];
          const failures: string[] = [];
          for (const song of legacySongs) {
            // Once a project exists on disk, the old browser DB is only an archive.
            if (packs.locations?.[song.id]?.workspace) continue;
            try {
              if (!packs.writable) throw new Error('本地 maps 保存服务未启动');
              const saved = await migrateMapSong(song);
              recovered.push(saved);
              // Migration is copy-only. Keep browser originals until the user
              // has inspected the disk projects and explicitly approves cleanup.
            } catch (error) {
              recovered.push(song);
              failures.push((error as Error).message);
            }
          }
          current.current = [
            ...packs.songs.filter((song) => !recovered.some((s) => s.id === song.id)),
            ...recovered,
          ];
          setSongs(mergeMapSongs(recovered, packs.songs));
          const albums: Album[] = [];
          for (const album of legacyAlbums) {
            if (album.id === 'touhou') continue;
            try {
              albums.push(await saveMapAlbum(album, true));
            } catch {
              albums.push(album);
            }
          }
          const groups = [
            ...albums,
            ...packs.albums.filter((a) => !albums.some((b) => b.id === a.id)),
          ].filter((album) => album.id !== 'touhou'); // Retired built-in album, including old saved copies.
          setAlbums([
            ...DEFAULT_ALBUMS.map((a) => {
              const saved = groups.find((b) => b.id === a.id);
              if (!saved) return a;
              const legacyName =
                (a.id === 'anime' && saved.name === 'Anime') ||
                (a.id === 'vocaloid' && saved.name === 'Vocaloid');
              return legacyName ? { ...saved, name: a.name } : saved;
            }),
            ...groups.filter((a) => !DEFAULT_ALBUMS.some((b) => b.id === a.id)),
          ]);
          if (packs.warnings.length)
            notify(`已跳过 ${packs.warnings.length} 个曲包问题：${packs.warnings[0]}`);
          if (failures.length)
            notify(
              `${failures.length} 个旧作品尚未迁入 maps，浏览器原数据保留；请重新定位视频后保存。${failures[0]}`,
            );
          setReady(true);
        })
        .catch((error) => {
          loaded.current = null;
          throw error;
        });
    return loaded.current;
  }, [notify]);
  useEffect(() => {
    void load().catch((e) => notify(`曲库读取失败：${e.message}`));
  }, [load, notify]);
  const updateSong = useCallback(
    async (id: string, update: (old: Song | undefined) => Song | undefined) => {
      const task = queue.current
        .catch(() => {})
        .then(async () => {
          await load();
          const previous = current.current.find((song) => song.id === id);
          const candidate = update(previous) ?? {
            id,
            hidden: true as const,
            drafts: {},
            released: {},
          };
          const stored = await saveMapSong(candidate);
          current.current = [...current.current.filter((song) => song.id !== id), stored];
          const next = stored.hidden ? undefined : stored;
          setSongs((items) =>
            next ? [...items.filter((s) => s.id !== id), next] : items.filter((s) => s.id !== id),
          );
          return next;
        });
      queue.current = task;
      return task;
    },
    [load],
  );
  const saveAlbum = useCallback(async (album: Album) => {
    await saveMapAlbum(album);
    setAlbums((items) =>
      items.some((a) => a.id === album.id)
        ? items.map((a) => (a.id === album.id ? album : a))
        : [...items, album],
    );
  }, []);
  const refresh = useCallback(async () => {
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        await load();
        const disk = await readMapLibrary(true);
        const changed = disk.songs
          .filter((s) => {
            const old = mapLocation(s.id)?.revision,
              next = disk.locations?.[s.id]?.revision;
            return old !== undefined && old !== next;
          })
          .map((s) => s.id);
        const legacy = current.current.filter((s) => !mapLocation(s.id)?.workspace);
        const next = mergeMapSongs(legacy, disk.songs);
        for (const song of disk.songs) {
          const location = disk.locations?.[song.id];
          if (location) registerMapWrite({ song, location, videos: disk.videos });
        }
        current.current = next;
        setSongs(next);
        if (disk.warnings.length) notify(disk.warnings[0]);
        return changed;
      });
    queue.current = task;
    return task;
  }, [load, notify]);
  return {
    songs,
    albums,
    ready,
    load,
    refresh,
    updateSong,
    saveAlbum,
    snapshot: () => current.current.filter((song) => !song.hidden),
  };
}
