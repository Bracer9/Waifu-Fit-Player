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
export type NamedDraft = Edition & { id: string; name: string; chartType: ChartType };
export type Song = {
  id: string;
  /** Persisted removal from the library; the original files remain on disk. */
  hidden?: true;
  drafts: Partial<Record<ChartType, Edition>>;
  released: Partial<Record<ChartType, Edition>>;
  namedDrafts?: NamedDraft[];
  activeDrafts?: Partial<Record<ChartType, string>>;
};

export function draftName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 60 || /[\x00-\x1f]/.test(name))
    throw new Error('草稿名称请填写 1～60 个字符。');
  return name;
}
export function selectedDraftId(song: Song, type: ChartType): string {
  const id = song.activeDrafts?.[type],
    named = song.namedDrafts?.find((d) => d.id === id),
    working = song.drafts[type];
  return named &&
    working &&
    JSON.stringify([named.chart, named.cover, named.albumId]) ===
      JSON.stringify([working.chart, working.cover, working.albumId])
    ? named.id
    : '';
}

/** The working slot stays compatible with publishing; named drafts are separate disk files. */
export function updateWorkingDraft(
  song: Song,
  type: ChartType,
  edition: Edition,
  activeId?: string | null,
): Song {
  const activeDrafts = { ...song.activeDrafts };
  const target = activeId
    ? song.namedDrafts?.find((d) => d.id === activeId && d.chartType === type)
    : undefined;
  if (activeId && !target) throw new Error('当前命名草稿已不存在，请重新打开。');
  if (target) activeDrafts[type] = target.id;
  else delete activeDrafts[type];
  return {
    ...song,
    drafts: { ...song.drafts, [type]: edition },
    activeDrafts,
    // Autosave the working copy; a named version changes only on explicit save.
  };
}

export function saveNamedDraft(song: Song, type: ChartType, value: string): Song {
  const name = draftName(value),
    edition = song.drafts[type];
  if (!edition) throw new Error('请先打开草稿。');
  const existing = song.namedDrafts?.find((d) => d.chartType === type && d.name === name);
  const named: NamedDraft = {
    ...structuredClone(edition),
    id: existing?.id ?? crypto.randomUUID(),
    name,
    chartType: type,
  };
  return {
    ...song,
    namedDrafts: [...(song.namedDrafts ?? []).filter((d) => d.id !== named.id), named],
    activeDrafts: { ...song.activeDrafts, [type]: named.id },
  };
}

/** Ordinary Save updates the current version by ID, without asking for a name. */
export function overwriteActiveDraft(song: Song, type: ChartType): Song {
  const id = song.activeDrafts?.[type];
  if (!id) return song;
  const current = song.drafts[type],
    target = song.namedDrafts?.find((d) => d.id === id && d.chartType === type);
  if (!current || !target) throw new Error('当前草稿已不存在，请重新打开。');
  return {
    ...song,
    namedDrafts: song.namedDrafts!.map((d) =>
      d.id === id ? { ...d, ...structuredClone(current) } : d,
    ),
  };
}

export function selectNamedDraft(song: Song, type: ChartType, id?: string | null): Song {
  if (!id) return song;
  const selected = song.namedDrafts?.find((d) => d.id === id && d.chartType === type);
  if (!selected) throw new Error('未找到选中的草稿，请重新读取本地作品。');
  let next = song;
  // A detached, unnamed working copy must not disappear when loading a named one.
  const current = song.drafts[type];
  const content = (e: Edition) => JSON.stringify([e.chart, e.albumId, e.cover]);
  if (
    current &&
    !song.namedDrafts?.some((d) => d.chartType === type && content(d) === content(current))
  ) {
    let name = '未命名草稿',
      index = 2;
    while (next.namedDrafts?.some((d) => d.chartType === type && d.name === name))
      name = `未命名草稿 ${index++}`;
    next = saveNamedDraft(next, type, name);
  }
  const { id: _id, name: _name, chartType: _type, ...edition } = selected;
  return updateWorkingDraft(next, type, structuredClone(edition), id);
}

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
export type Album = {
  id: string;
  name: string;
  cover: string;
  /** Absent keeps original artwork recognition; only anime uses this override. */
  coverEffect?: 'anime-lens' | 'none';
};
export const DEFAULT_ALBUMS: Album[] = [
  { id: 'all', name: '全部曲目', cover: '' },
  { id: 'anime', name: '动漫', cover: '' },
  { id: 'pop', name: '流行', cover: '' },
  { id: 'vocaloid', name: '虚拟歌姬', cover: '' },
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
      [
        ...Object.values(song.drafts),
        ...Object.values(song.released),
        ...(song.namedDrafts ?? []),
      ].flatMap((edition) =>
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

/** Legacy migration/cleanup only. New editor saves go through maps-workspace. */
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
