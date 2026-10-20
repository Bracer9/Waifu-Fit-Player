import { parseChart, type Chart } from './model';
import { playableChart, playRangeCrossings } from './play-range';
import { CHART_TYPES, migrateChartMetadata, type ChartType } from './chart-types';

export { CHART_TYPES, type ChartType } from './chart-types';
export type Edition = {
  chart: Chart;
  albumId: string;
  cover: string;
  updatedAt: number;
};
export type Song = {
  id: string;
  /** A local removal of a folder song; never deletes its original files. */
  hidden?: true;
  drafts: Partial<Record<ChartType, Edition>>;
  released: Partial<Record<ChartType, Edition>>;
};

/** Slot names are authoritative, including old copied drafts whose chart tag differed. */
export function migrateSong(song: {
  id: string;
  drafts: Partial<Record<string, Edition>>;
  released: Partial<Record<string, Edition>>;
}): Song {
  const next: Song = { ...song, drafts: {}, released: {} };
  for (const collection of ['drafts', 'released'] as const) {
    for (const chartType of CHART_TYPES) {
      const edition =
        song[collection][chartType] ??
        song[collection][chartType === 'fitness' ? 'normal' : 'hard'];
      if (edition)
        next[collection][chartType] = {
          ...edition,
          chart: migrateChartMetadata(
            edition.chart as unknown as Record<string, unknown>,
            chartType,
          ) as unknown as Chart,
        };
    }
  }
  return next;
}
export type Album = { id: string; name: string; cover: string };
export const DEFAULT_ALBUMS: Album[] = [
  { id: 'all', name: '全部曲目', cover: '' },
  { id: 'anime', name: '动漫', cover: '' },
  { id: 'pop', name: '流行', cover: '' },
  { id: 'vocaloid', name: '虚拟歌姬', cover: '' },
  { id: 'touhou', name: '东方', cover: '' },
];

export function publishSong(song: Song, chartType: ChartType): Song {
  const draft = song.drafts[chartType];
  if (!draft) throw new Error('请先保存这个类型的草稿。');
  if (!draft.albumId || draft.albumId === 'all') throw new Error('请选择发布专辑。');
  const chart = parseChart({ ...draft.chart, songId: song.id, chartType });
  if (!chart.videoHint.assetId) throw new Error('请先关联视频。');
  if (playRangeCrossings(chart).length)
    throw new Error('长条跨越游玩区间边界，请先定位并调整后发布。');
  const playable = playableChart(chart);
  if (!playable.notes.length && !playable.specialEvents.length)
    throw new Error('游玩区间内没有动作，空谱面不能发布。');
  return {
    ...song,
    released: {
      ...song.released,
      [chartType]: structuredClone({ ...draft, chart, updatedAt: Date.now() }),
    },
  };
}

export function unpublishSong(song: Song, chartType: ChartType): Song {
  const released = { ...song.released };
  const drafts = { ...song.drafts };
  if (!drafts[chartType] && released[chartType])
    drafts[chartType] = structuredClone(released[chartType]);
  delete released[chartType];
  return { ...song, drafts, released };
}

export function editionsIn(song: Song, albumId: string): ChartType[] {
  return CHART_TYPES.filter((chartType) => {
    const edition = song.released[chartType];
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

type Tables = { songs: Song; albums: Album };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('waifu-fit-player-library', 2);
    open.onupgradeneeded = () => {
      for (const name of ['songs', 'albums']) {
        if (!open.result.objectStoreNames.contains(name))
          open.result.createObjectStore(name, { keyPath: 'id' });
      }
      const cursor = open.transaction!.objectStore('songs').openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        item.update(migrateSong(item.value));
        item.continue();
      };
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
