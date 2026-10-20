import { useCallback, useEffect, useRef, useState } from 'react';
import { changeLibrary, DEFAULT_ALBUMS, readLibrary, type Album, type Song } from './library';
import { readMapLibrary } from './map-library';
import { emptyMapLibrary, mergeMapSongs } from './song-pack';

export function useLibrary(notify: (text: string) => void) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState(DEFAULT_ALBUMS);
  const [ready, setReady] = useState(false);
  const loaded = useRef<Promise<void> | null>(null);
  const mapSongs = useRef<Song[]>([]);
  const load = useCallback(() => {
    if (!loaded.current)
      loaded.current = Promise.all([
        readLibrary('songs'),
        readLibrary('albums'),
        readMapLibrary().catch((error) => {
          notify(`曲包扫描失败：${error.message}`);
          return emptyMapLibrary();
        }),
      ])
        .then(([songs, albums, packs]) => {
          mapSongs.current = packs.songs;
          setSongs(mergeMapSongs(songs, packs.songs));
          const groups = [
            ...albums,
            ...packs.albums.filter((a) => !albums.some((b) => b.id === a.id)),
          ];
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
      const packed = mapSongs.current.find((song) => song.id === id);
      const stored = await changeLibrary(
        'songs',
        id,
        (previous) =>
          update(previous ?? packed) ??
          (packed ? { id, hidden: true, drafts: {}, released: {} } : undefined),
      );
      const next = stored?.hidden ? undefined : stored;
      setSongs((items) =>
        next ? [...items.filter((s) => s.id !== id), next] : items.filter((s) => s.id !== id),
      );
      return next;
    },
    [],
  );
  const saveAlbum = useCallback(async (album: Album) => {
    await changeLibrary('albums', album.id, () => album);
    setAlbums((items) =>
      items.some((a) => a.id === album.id)
        ? items.map((a) => (a.id === album.id ? album : a))
        : [...items, album],
    );
  }, []);
  return { songs, albums, ready, load, updateSong, saveAlbum };
}
