import { CHART_TYPES, type ChartType } from './chart-types';
import { parseChart, type Chart } from './model';
import { playableChart, playRangeCrossings } from './play-range';
import type { Album, Song } from './library';

export const PACK_FORMAT = 'waifu-fit-player-song';
export type PackAlbum = { id: string; name: string; cover?: string };
export type PackChart = { file: string; video?: string; cover?: string; album?: PackAlbum };
export type SongPack = {
  format: typeof PACK_FORMAT;
  version: 1;
  id: string;
  title: string;
  video: string;
  cover?: string;
  album: PackAlbum;
  charts: Partial<Record<ChartType, string | PackChart>>;
};
export type PackVideo = { id: string; fileName: string; url: string; aliases?: string[] };
export type MapLocation = { folder: string; revision?: string; workspace?: boolean };
export type MapLibrary = {
  songs: Song[];
  albums: Album[];
  videos: PackVideo[];
  warnings: string[];
  writable?: boolean;
  locations?: Record<string, MapLocation>;
};
export const emptyMapLibrary = (): MapLibrary => ({
  songs: [],
  albums: [],
  videos: [],
  warnings: [],
});

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Resources are relative to their song folder, on both Windows and macOS. */
export function packPath(value: unknown): string {
  if (typeof value !== 'string' || !value || /[\\:#?\x00-\x1f]/.test(value))
    throw new Error('曲包资源必须使用包内相对路径。');
  if (value.split('/').some((part) => !part || part === '.' || part === '..'))
    throw new Error('曲包资源不能越出歌曲文件夹。');
  return value;
}

function album(value: unknown): PackAlbum {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.name !== 'string' ||
    !value.name.trim()
  )
    throw new Error('曲包缺少专辑信息。');
  return {
    id: value.id,
    name: value.name,
    ...(value.cover ? { cover: packPath(value.cover) } : {}),
  };
}

export function parseSongPack(value: unknown): SongPack {
  if (
    !object(value) ||
    value.format !== PACK_FORMAT ||
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(value.id) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    !object(value.charts)
  )
    throw new Error('song.json 不是受支持的 WAIFU 曲包清单。');
  const charts: SongPack['charts'] = {};
  for (const type of CHART_TYPES) {
    const entry = value.charts[type];
    if (entry === undefined) continue;
    if (typeof entry === 'string') charts[type] = packPath(entry);
    else if (object(entry))
      charts[type] = {
        file: packPath(entry.file),
        ...(entry.video ? { video: packPath(entry.video) } : {}),
        ...(entry.cover ? { cover: packPath(entry.cover) } : {}),
        ...(entry.album ? { album: album(entry.album) } : {}),
      };
    else throw new Error(`${type} 谱面配置无效。`);
  }
  if (!Object.keys(charts).length) throw new Error('曲包至少需要一种谱面。');
  return {
    format: PACK_FORMAT,
    version: 1,
    id: value.id,
    title: value.title,
    video: packPath(value.video),
    ...(value.cover ? { cover: packPath(value.cover) } : {}),
    album: album(value.album),
    charts,
  };
}

export function playablePackChart(value: unknown, type?: ChartType): Chart {
  if (!object(value)) throw new Error('谱面 JSON 无效。');
  const chart = parseChart(type ? { ...value, chartType: type } : value);
  const playable = playableChart(chart);
  if (playRangeCrossings(chart).length) throw new Error('长条跨越游玩区间边界。');
  if (!playable.notes.length && !playable.specialEvents.length)
    throw new Error('曲包中包含空谱面。');
  return chart;
}

/** During migration, keep unresolved browser projects visible beside the disk library. */
export function mergeMapSongs(local: Song[], packs: Song[]): Song[] {
  const ids = new Set(local.map((song) => song.id));
  const signatures = new Set(
    local.flatMap((song) =>
      [...Object.values(song.drafts), ...Object.values(song.released)].map((edition) =>
        JSON.stringify([edition.chart.title, edition.chart.videoHint.fileName]),
      ),
    ),
  );
  return [
    ...local,
    ...packs.filter(
      (song) =>
        !ids.has(song.id) &&
        !Object.values(song.released).some((edition) =>
          signatures.has(JSON.stringify([edition.chart.title, edition.chart.videoHint.fileName])),
        ),
    ),
  ].filter(
    (song) =>
      !song.hidden && (Object.keys(song.drafts).length || Object.keys(song.released).length),
  );
}
