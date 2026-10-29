import sunset from './assets/albums-illustrations/animie_album.png';
import sunsetWindow from './assets/albums-illustrations/anime_album2.png';
import vinyl from './assets/albums-illustrations/vocaloid_album2.png';
import all from './assets/albums-illustrations/all_album.png';
import pop from './assets/albums-illustrations/pop_album.png';
import type { Album } from './library';

export type AlbumCoverDetail =
  | 'sunset'
  | 'sunset-window'
  | 'vinyl'
  | 'vinyl-oil'
  | 'all-record'
  | 'all-record-oil'
  | 'idol-stage';

// Authored masks remain tied to exact illustrations. Anime can explicitly retain
// its additive lens flare on replacement artwork, without replacing image pixels.
const details = [
  {
    album: 'all',
    source: all,
    kind: 'all-record-oil',
    hash: '8e0c81dfa76db888c24e1c8aff7a53afa3359bdcd087d2738ad18a48cb173503',
  },
  {
    album: 'all',
    source: undefined,
    kind: 'all-record-oil',
    hash: 'adcba21cc5d932f5888d63272e3f2d99db213e190d81569c412e91facad37bb1',
  },
  {
    album: 'all',
    source: undefined,
    kind: 'all-record',
    hash: '65eda88ebf02c920248c5b5c09de5bc1e75f4d67f129485e3e6eb37778b1e4d0',
  },
  {
    album: 'pop',
    source: pop,
    kind: 'idol-stage',
    hash: '42e5ae7993419c1273fae4906d3c9fdf69b83bf44105f83439498af34cd0598a',
  },
  {
    album: 'pop',
    source: undefined,
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
    kind: 'vinyl-oil',
    hash: '9c317bf27a644cd7b43cb03b69a8760c2ef2cef97b0725d1500a6f637360a92a',
  },
  {
    album: 'vocaloid',
    source: undefined,
    kind: 'vinyl',
    hash: '7f63a5bed6b56b40b1189eb34ed609e24a039ad574fbd7db3540978797fbb807',
  },
] as const;
const fingerprints = new Map<string, Promise<string>>();

export async function albumCoverDetail(
  album: string,
  source: string,
  effect?: Album['coverEffect'],
): Promise<AlbumCoverDetail | undefined> {
  if (album === 'anime' && effect === 'none') return;
  const candidates = details.filter((detail) => detail.album === album);
  const direct = candidates.find((detail) => detail.source === source);
  if (direct) return direct.kind;
  const fallback =
    album === 'anime' && effect === 'anime-lens' && source ? 'sunset-window' : undefined;
  if (!candidates.length || !source.startsWith('data:image/')) return fallback;
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
  return candidates.find((detail) => detail.hash === hash)?.kind ?? fallback;
}
