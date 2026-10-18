import { useCallback, useEffect, useRef, useState } from 'react';
import { changeLibrary, DEFAULT_ALBUMS, readLibrary, type Album, type Song } from './library';

export function useLibrary(notify: (text: string) => void) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState(DEFAULT_ALBUMS);
  const [ready, setReady] = useState(false);
  const loaded = useRef<Promise<void> | null>(null);
  const load = useCallback(() => {
    if (!loaded.current)
      loaded.current = Promise.all([readLibrary('songs'), readLibrary('albums')])
        .then(([songs, albums]) => {
          setSongs(songs);
          setAlbums([
            ...DEFAULT_ALBUMS.map((a) => albums.find((b) => b.id === a.id) ?? a),
            ...albums.filter((a) => !DEFAULT_ALBUMS.some((b) => b.id === a.id)),
          ]);
          setReady(true);
        })
        .catch((error) => {
          loaded.current = null;
          throw error;
        });
    return loaded.current;
  }, []);
  useEffect(() => {
    void load().catch((e) => notify(`曲库读取失败：${e.message}`));
  }, [load, notify]);
  const updateSong = useCallback(
    async (id: string, update: (old: Song | undefined) => Song | undefined) => {
      const next = await changeLibrary('songs', id, update);
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
