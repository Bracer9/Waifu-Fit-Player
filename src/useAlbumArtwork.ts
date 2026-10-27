import { useEffect, useMemo, useState } from 'react';
import type { Album } from './library';
import { coverFromFile } from './cover';
import all from './assets/albums-illustrations/all_album.png';
import anime from './assets/albums-illustrations/animie_album.png';
import vocaloid from './assets/albums-illustrations/Vocaloid_album.png';
import pop from './assets/albums-illustrations/pop_album.png';

export const ALBUM_ARTWORK: Record<string, string> = { all, anime, vocaloid, pop };
const legacyCopies = new Map<string, Promise<string>>();
// Verified historical 512px crops. Canvas/WebP output can differ between browser
// rendering paths, so re-encoding today is not a reliable identity check alone.
const legacyCropHashes: Record<string, string> = {
  all: '002c6dff96e2d61b533e0f7bb3e4f1e6e141708fc46a206d065cdda5e4d49e1a',
};

async function knownLegacyCrop(albumId: string, stored: string) {
  const expected = legacyCropHashes[albumId];
  if (!expected) return false;
  const bytes = await (await fetch(stored)).arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return hash === expected;
}

function legacyCopy(source: string) {
  let copy = legacyCopies.get(source);
  if (!copy) {
    copy = fetch(source)
      .then((response) => {
        if (!response.ok) throw new Error('Album artwork unavailable');
        return response.blob();
      })
      .then((blob) => coverFromFile(new File([blob], 'album.png', { type: blob.type })));
    legacyCopies.set(source, copy);
  }
  return copy;
}

export function useAlbumArtwork(albums: Album[]) {
  const [recovered, setRecovered] = useState<Record<string, { stored: string; source: string }>>(
    {},
  );
  useEffect(() => {
    let active = true;
    const legacy = albums.filter(
      (album) => ALBUM_ARTWORK[album.id] && album.cover.startsWith('data:image/webp;base64,'),
    );
    if (legacy.length) {
      void Promise.all(
        legacy.map(async (album) => {
          let source = album.cover;
          try {
            // Only replace an exact old 512px crop of the supplied original.
            // Unrelated custom artwork and the stored library remain untouched.
            const original = ALBUM_ARTWORK[album.id];
            if (
              (await knownLegacyCrop(album.id, album.cover)) ||
              (await legacyCopy(original)) === album.cover
            )
              source = original;
          } catch {
            /* Keep the saved cover if the original cannot be read. */
          }
          return [album.id, { stored: album.cover, source }] as const;
        }),
      ).then((entries) => {
        if (active) setRecovered(Object.fromEntries(entries));
      });
    }
    return () => {
      active = false;
    };
  }, [albums]);
  return useMemo(
    () =>
      Object.fromEntries(
        albums.map((album) => [
          album.id,
          recovered[album.id]?.stored === album.cover
            ? recovered[album.id].source
            : album.cover || ALBUM_ARTWORK[album.id] || '',
        ]),
      ),
    [albums, recovered],
  );
}
