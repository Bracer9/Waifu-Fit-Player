import sunset from './assets/albums-illustrations/animie_album.png';
import sunsetWindow from './assets/albums-illustrations/anime_album2.png';
import vinyl from './assets/albums-illustrations/vocaloid_album2.png';
import all from './assets/albums-illustrations/all_album.png';
import moonLeft from './assets/albums-illustrations/touhou_album.png';
import moonRight from './assets/albums-illustrations/touhou_album - 4.png';
import pop from './assets/albums-illustrations/pop_album.png';

export type AlbumCoverDetail =
  'sunset' | 'sunset-window' | 'vinyl' | 'all-record' | 'moon-left' | 'moon-right' | 'idol-stage';

// Only these exact illustrations have authored local masks. A studio upload keeps
// its original bytes, so recognize it too without guessing from an album's name.
const details = [
  {
    album: 'all',
    source: all,
    kind: 'all-record',
    hash: '65eda88ebf02c920248c5b5c09de5bc1e75f4d67f129485e3e6eb37778b1e4d0',
  },
  {
    album: 'touhou',
    source: moonLeft,
    kind: 'moon-left',
    hash: 'd3a133451c404710867baca619c594b59f26e709c3c761947075dd39376c024b',
  },
  {
    album: 'touhou',
    source: moonRight,
    kind: 'moon-right',
    hash: '070379ad724b59c66e0be013002c84f09bc7f422c4434bebd1e34e3d8761d99b',
  },
  {
    album: 'pop',
    source: pop,
    kind: 'idol-stage',
    hash: '57cdb79fa929454a8b0129ff080d32f35511451ae7d316b5bb277116989ab7b2',
  },
  {
    album: 'anime',
    source: sunset,
    kind: 'sunset',
    hash: '311ad088b2b50c8cd5a616d55c2dd881288bf3c413cba6006a26e207cad01987',
  },
  {
    album: 'anime',
    source: sunsetWindow,
    kind: 'sunset-window',
    hash: '84ec9364613b7615510cb41555dbbf04362e3d68cf20966c58be152f3ff2af8d',
  },
  {
    album: 'vocaloid',
    source: vinyl,
    kind: 'vinyl',
    hash: '7f63a5bed6b56b40b1189eb34ed609e24a039ad574fbd7db3540978797fbb807',
  },
] as const;
const fingerprints = new Map<string, Promise<string>>();

export async function albumCoverDetail(
  album: string,
  source: string,
): Promise<AlbumCoverDetail | undefined> {
  const candidates = details.filter((detail) => detail.album === album);
  const direct = candidates.find((detail) => detail.source === source);
  if (direct) return direct.kind;
  if (!candidates.length || !source.startsWith('data:image/')) return;
  let fingerprint = fingerprints.get(source);
  if (!fingerprint) {
    fingerprint = fetch(source)
      .then((response) => response.arrayBuffer())
      .then((bytes) => crypto.subtle.digest('SHA-256', bytes))
      .then((digest) =>
        Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
      )
      .catch(() => '');
    fingerprints.set(source, fingerprint);
    if (fingerprints.size > 8) fingerprints.delete(fingerprints.keys().next().value!);
  }
  const hash = await fingerprint;
  return candidates.find((detail) => detail.hash === hash)?.kind;
}
