import { parseChart, type Chart } from './model';

export type Difficulty = 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['normal', 'hard'];
export type Edition = {
  chart: Chart;
  albumId: string;
  cover: string;
  updatedAt: number;
};
export type Song = {
  id: string;
  drafts: Partial<Record<Difficulty, Edition>>;
  released: Partial<Record<Difficulty, Edition>>;
};
export type Album = { id: string; name: string; cover: string };
export type MenuMusic = { id: 'home' | 'library'; file: File };
export const DEFAULT_ALBUMS: Album[] = [
  { id: 'all', name: '全部曲目', cover: '' },
  { id: 'touhou', name: '东方', cover: '' },
  { id: 'anime', name: 'Anime', cover: '' },
  { id: 'vocaloid', name: 'Vocaloid', cover: '' },
  { id: 'pop', name: '流行', cover: '' },
];

export function publishSong(song: Song, difficulty: Difficulty): Song {
  const draft = song.drafts[difficulty];
  if (!draft) throw new Error('请先保存这个难度的草稿。');
  if (!draft.albumId || draft.albumId === 'all') throw new Error('请选择发布专辑。');
  const chart = parseChart({ ...draft.chart, songId: song.id, difficulty });
  if (!chart.videoHint.assetId) throw new Error('请先关联视频。');
  if (!chart.notes.length && !chart.specialEvents.length) throw new Error('空谱面不能发布。');
  return {
    ...song,
    released: {
      ...song.released,
      [difficulty]: structuredClone({ ...draft, chart, updatedAt: Date.now() }),
    },
  };
}

export function unpublishSong(song: Song, difficulty: Difficulty): Song {
  const released = { ...song.released };
  const drafts = { ...song.drafts };
  if (!drafts[difficulty] && released[difficulty])
    drafts[difficulty] = structuredClone(released[difficulty]);
  delete released[difficulty];
  return { ...song, drafts, released };
}

export function editionsIn(song: Song, albumId: string): Difficulty[] {
  return DIFFICULTIES.filter((difficulty) => {
    const edition = song.released[difficulty];
    return edition && (albumId === 'all' || edition.albumId === albumId);
  });
}

export function videoIds(song: Song): string[] {
  return [
    ...new Set(
      [...Object.values(song.drafts), ...Object.values(song.released)].flatMap((edition) =>
        edition.chart.videoHint.assetId ? [edition.chart.videoHint.assetId] : [],
      ),
    ),
  ];
}

export function latestEdition(song: Song): Edition {
  return [...Object.values(song.drafts), ...Object.values(song.released)].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  )[0];
}

type Tables = { songs: Song; albums: Album; music: MenuMusic };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('waifu-fit-player-library', 1);
    open.onupgradeneeded = () => {
      for (const name of ['songs', 'albums', 'music'])
        open.result.createObjectStore(name, { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('曲库存储正被其他窗口占用，请关闭旧窗口后重试。'));
  });
}

export async function readLibrary<T extends keyof Tables>(table: T): Promise<Tables[T][]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table);
    const request = tx.objectStore(table).getAll();
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Read/modify/write in one transaction so autosave cannot erase a published edition. */
export async function changeLibrary<T extends keyof Tables>(
  table: T,
  id: string,
  update: (previous: Tables[T] | undefined) => Tables[T] | undefined,
): Promise<Tables[T] | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, 'readwrite');
    const store = tx.objectStore(table);
    let result: Tables[T] | undefined;
    let error: unknown;
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        result = update(request.result);
        if (result) store.put(result);
        else store.delete(id);
      } catch (reason) {
        error = reason;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(error || tx.error || new Error('无法保存曲库。'));
    };
  });
}
