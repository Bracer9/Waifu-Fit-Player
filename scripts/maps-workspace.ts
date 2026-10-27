import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { CHART_TYPES } from '../src/chart-types';
import { parseChart } from '../src/model';
import { draftName, type Album, type Edition, type Song } from '../src/library';
import { packPath, type PackVideo, type MapLocation } from '../src/song-pack';

const FORMAT = 'waifu-fit-player-project';
// Filesystem names may contain #/?; map-file URLs encode every segment.
// Keep the pack contract's traversal checks without treating names as URL fragments.
const localPath = (value: string) => {
  packPath(value.replace(/[?#]/g, '_'));
  return value;
};
type Media = { id: string; aliases: string[]; file: string; size: number; lastModified: number };
type Entry = Omit<Edition, 'chart'> & { file: string };
type Project = {
  format: typeof FORMAT;
  version: 1;
  id: string;
  hidden?: true;
  initialized?: true;
  media: Media[];
  drafts: Partial<Record<(typeof CHART_TYPES)[number], Entry>>;
  released: Partial<Record<(typeof CHART_TYPES)[number], Entry>>;
  namedDrafts?: (Entry & { id: string; name: string; chartType: (typeof CHART_TYPES)[number] })[];
  activeDrafts?: Song['activeDrafts'];
};
const managedChart = /^wfp-(fitness|dance)-(draft(?:-[a-f0-9-]{36})?|released)\.json$/;
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const url = (relative: string) =>
  '/__wfp/map-file/' + relative.split('/').map(encodeURIComponent).join('/');
const inside = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const validId = (id: string) => {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('歌曲 ID 无效。');
};
const read = async (file: string) =>
  JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const safeName = (title: string) =>
  title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 90) || 'Song';

/** Replace only complete files. Keep the previous JSON in the same song's recovery folder. */
async function atomic(file: string, data: string | Buffer, backup = false) {
  const actual = await realpath(file).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  if (actual && !inside(path.dirname(file), actual)) throw new Error('目标文件越出保存目录。');
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    if (backup) {
      const old = await readFile(file).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return undefined;
      });
      if (old?.equals(Buffer.from(data))) return;
      if (old) {
        const directory = path.join(path.dirname(file), '.wfp-backup');
        await mkdir(directory, { recursive: true });
        if (!inside(path.dirname(file), await realpath(directory)))
          throw new Error('备份目录越出曲目目录。');
        await atomic(path.join(directory, path.basename(file)), old);
      }
    }
    await writeFile(temporary, data, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export class MapsWorkspace {
  constructor(
    readonly directory: string,
    readonly demoFile = path.resolve('public/demo.mp4'),
  ) {}
  private async root() {
    await mkdir(this.directory, { recursive: true });
    return realpath(this.directory);
  }
  private async folder(relative: string) {
    const root = await this.root();
    const folder = await realpath(path.resolve(root, localPath(relative)));
    if (!inside(root, folder) || folder === root || !(await stat(folder)).isDirectory())
      throw new Error('曲目目录必须位于 maps 内。');
    return folder;
  }
  private async resource(folder: string, name: string) {
    const file = await realpath(path.resolve(folder, localPath(name)));
    if (!inside(folder, file) || !(await stat(file)).isFile())
      throw new Error('资源越出曲目目录。');
    return file;
  }
  private async metadata(folder: string): Promise<Project | undefined> {
    await this.recover(folder);
    const value = await this.resource(folder, 'project.json')
      .then(read)
      .catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return undefined;
      });
    if (!value) return undefined;
    if (
      value.format !== FORMAT ||
      value.version !== 1 ||
      !Array.isArray(value.media) ||
      !value.drafts ||
      !value.released
    )
      throw new Error('project.json 格式无效；未覆盖此文件。');
    validId(value.id);
    return value;
  }
  private async locate(id: string): Promise<string | undefined> {
    validId(id);
    const walk = async (folder: string, depth: number): Promise<string | undefined> => {
      if (depth > 12) return undefined;
      const entries = await readdir(folder, { withFileTypes: true });
      if (entries.some((entry) => entry.isFile() && entry.name === 'project.json')) {
        const project = await this.metadata(folder).catch(() => undefined);
        if (project?.id === id) return folder;
      }
      for (const entry of entries)
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const found = await walk(path.join(folder, entry.name), depth + 1);
          if (found) return found;
        }
      return undefined;
    };
    return walk(await this.root(), 0);
  }
  private empty(id: string): Project {
    return { format: FORMAT, version: 1, id, media: [], drafts: {}, released: {} };
  }
  private async commit(folder: string, project: Project) {
    await atomic(path.join(folder, 'project.json'), JSON.stringify(project, null, 2) + '\n', true);
  }
  /** Finish an interrupted JSON save before exposing the project again. Videos are never journalled. */
  private async recover(folder: string) {
    const journal = await this.resource(folder, '.wfp-save.json')
      .then(read)
      .catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return undefined;
      });
    if (!journal) return;
    if (
      journal.project?.format !== FORMAT ||
      journal.project.version !== 1 ||
      !Array.isArray(journal.charts)
    )
      throw new Error('保存恢复记录无效，已保留原文件。');
    validId(journal.project.id);
    for (const entry of journal.charts) {
      if (!managedChart.test(entry.file) || typeof entry.data !== 'string')
        throw new Error('保存恢复路径无效。');
      const chart = parseChart(JSON.parse(entry.data));
      if (chart.songId !== journal.project.id) throw new Error('保存恢复歌曲 ID 不匹配。');
    }
    for (const entry of journal.charts)
      await atomic(path.join(folder, entry.file), entry.data, true);
    await this.commit(folder, journal.project);
    await unlink(path.join(folder, '.wfp-save.json'));
  }
  private async mediaFile(folder: string, media: Media): Promise<string> {
    try {
      return await this.resource(folder, media.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // Renaming an MP4 does not change the association. Never guess between candidates.
      const matches: string[] = [];
      const walk = async (directory: string, depth: number) => {
        if (depth > 12) return;
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.name.startsWith('.')) continue;
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) await walk(file, depth + 1);
          else if (entry.isFile() && /\.mp4$/i.test(entry.name)) {
            const info = await stat(file);
            if (info.size === media.size && Math.trunc(info.mtimeMs) === media.lastModified)
              matches.push(file);
          }
        }
      };
      await walk(folder, 0);
      if (matches.length !== 1)
        throw new Error(`视频 ${media.file} 不存在，无法唯一确认改名后的文件，请重新定位。`);
      return this.resource(folder, path.relative(folder, matches[0]).split(path.sep).join('/'));
    }
  }
  async readProject(relative: string) {
    const root = await this.root(),
      folder = await this.folder(relative);
    const project = await this.metadata(folder);
    if (!project) throw new Error('没有找到 project.json。');
    const buffers: Buffer[] = [await readFile(path.join(folder, 'project.json'))];
    const videos: PackVideo[] = [];
    const song: Song = {
      id: project.id,
      ...(project.hidden ? { hidden: true } : {}),
      drafts: {},
      released: {},
    };
    const readEdition = async (
      entry: Entry,
      type: (typeof CHART_TYPES)[number],
    ): Promise<Edition> => {
      const bytes = await readFile(await this.resource(folder, entry.file));
      buffers.push(bytes);
      const chart = parseChart({
        ...JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')),
        songId: project.id,
        chartType: type,
      });
      const media = project.media.find(
        (m) =>
          m.id === chart.videoHint.assetId || m.aliases.includes(chart.videoHint.assetId ?? ''),
      );
      if (media) {
        // Keep the chart visible/editable when its video is missing. Relocation is explicit.
        try {
          const file = await this.mediaFile(folder, media);
          if (!videos.some((v) => v.id === media.id))
            videos.push({
              id: media.id,
              aliases: media.aliases,
              fileName: path.basename(file),
              url: url(path.relative(root, file).split(path.sep).join('/')),
            });
          chart.videoHint = {
            ...chart.videoHint,
            assetId: media.id,
            fileName: path.basename(file),
          };
        } catch {
          /* The existing chart and association remain recoverable. */
        }
      }
      return {
        chart,
        albumId: entry.albumId,
        updatedAt: entry.updatedAt,
        cover: entry.cover
          ? url(
              path
                .relative(root, await this.resource(folder, entry.cover))
                .split(path.sep)
                .join('/'),
            )
          : '',
      };
    };
    for (const collection of ['drafts', 'released'] as const)
      for (const type of CHART_TYPES) {
        const entry = project[collection][type];
        if (entry) song[collection][type] = await readEdition(entry, type);
      }
    if (project.namedDrafts !== undefined) {
      if (!Array.isArray(project.namedDrafts)) throw new Error('命名草稿清单无效。');
      song.namedDrafts = [];
      const ids = new Set<string>();
      for (const entry of project.namedDrafts) {
        validId(entry.id);
        draftName(entry.name);
        if (
          !CHART_TYPES.includes(entry.chartType) ||
          ids.has(entry.id) ||
          entry.file !== `wfp-${entry.chartType}-draft-${entry.id}.json`
        )
          throw new Error('命名草稿清单无效。');
        ids.add(entry.id);
        song.namedDrafts.push({
          ...(await readEdition(entry, entry.chartType)),
          id: entry.id,
          name: entry.name,
          chartType: entry.chartType,
        });
      }
    }
    if (project.activeDrafts) {
      song.activeDrafts = {};
      for (const type of CHART_TYPES) {
        const id = project.activeDrafts[type];
        if (id && !song.namedDrafts?.some((d) => d.id === id && d.chartType === type))
          throw new Error('活动草稿记录无效。');
        if (id) song.activeDrafts[type] = id;
      }
    }
    const revision = digest(Buffer.concat(buffers));
    const location: MapLocation = {
      folder: relative,
      revision,
      workspace: project.initialized === true,
    };
    return { song, videos, location };
  }
  private async createFolder(id: string, title: string, source?: string, hint?: string) {
    const existing = await this.locate(id);
    if (existing) return existing;
    const root = await this.root();
    const candidate = hint ? await this.folder(hint) : source ? path.dirname(source) : undefined;
    if (candidate && candidate !== root && inside(root, candidate)) {
      const owner = await this.metadata(candidate);
      const manifest = await read(path.join(candidate, 'song.json')).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return undefined;
      });
      if ((!owner || owner.id === id) && (!manifest || manifest.id === id)) return candidate;
    }
    const folder = path.join(root, `${safeName(title)}-${id.slice(0, 8)}`);
    await mkdir(folder, { recursive: true });
    const owner = await this.metadata(folder);
    if (owner && owner.id !== id) throw new Error('目标曲目目录已属于另一首歌。');
    return folder;
  }
  /** Adopt an existing maps MP4 without copying it, or stream an outside file into maps once. */
  async attach(
    input: {
      id: string;
      title: string;
      assetId: string;
      source?: string;
      fileName?: string;
      folder?: string;
      revision?: string;
    },
    upload?: IncomingMessage,
  ) {
    validId(input.id);
    if (typeof input.assetId !== 'string' || !input.assetId || input.assetId.length > 200)
      throw new Error('视频关联 ID 无效。');
    let source: string | undefined;
    if (input.source) {
      const root = await this.root();
      if (input.source === '/demo.mp4') source = await realpath(this.demoFile);
      else {
        if (!input.source.startsWith('/__wfp/map-file/'))
          throw new Error('只允许导入 maps 内的视频。');
        source = await realpath(
          path.resolve(
            root,
            localPath(decodeURIComponent(input.source.slice('/__wfp/map-file/'.length))),
          ),
        );
        if (!inside(root, source)) throw new Error('视频越出 maps 目录。');
      }
      if (!/\.mp4$/i.test(source) || !(await stat(source)).isFile())
        throw new Error('视频文件无效。');
    }
    if (!source && !upload) throw new Error('没有找到待导入的视频。');
    const folder = await this.createFolder(
      input.id,
      input.title,
      source?.startsWith(await this.root()) ? source : undefined,
      input.folder,
    );
    const project = (await this.metadata(folder)) ?? this.empty(input.id);
    if (input.revision && project.initialized) {
      const relative = path
        .relative(await this.root(), folder)
        .split(path.sep)
        .join('/');
      if ((await this.readProject(relative)).location.revision !== input.revision)
        throw new Error('磁盘谱面已被修改，未覆盖；请重新打开作品。');
    }
    const previous = project.media.find(
      (m) => m.id === input.assetId || m.aliases.includes(input.assetId),
    );
    if (previous && !upload) {
      const file = await this.mediaFile(folder, previous).catch(() => undefined);
      if (file && source === file) return this.attached(folder, project, previous, file);
    }
    let file: string;
    if (source && inside(folder, source)) file = source;
    else {
      const name = path.basename(source ?? input.fileName ?? 'video.mp4');
      if (!/\.mp4$/i.test(name)) throw new Error('请选择 MP4 视频。');
      // Never replace an unrelated existing video, even if it has the same filename.
      const stem = safeName(path.parse(name).name);
      file = path.join(folder, `${stem}.mp4`);
      if (
        await stat(file).then(
          () => true,
          () => false,
        )
      )
        file = path.join(folder, `${stem}-${randomUUID().slice(0, 8)}.mp4`);
      const temporary = file + '.tmp';
      try {
        if (source) await copyFile(source, temporary);
        else await pipeline(upload!, createWriteStream(temporary, { flags: 'wx' }));
        await rename(temporary, file);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    }
    const info = await stat(file);
    const media: Media = {
      id: previous?.id ?? 'pack-' + digest(`${input.id}/${input.assetId}`),
      aliases: [...new Set([...(previous?.aliases ?? []), input.assetId])],
      file: path.relative(folder, file).split(path.sep).join('/'),
      size: info.size,
      lastModified: Math.trunc(info.mtimeMs),
    };
    project.media = [...project.media.filter((m) => m.id !== media.id), media];
    await this.commit(folder, project);
    return this.attached(folder, project, media, file);
  }
  private async attached(folder: string, _project: Project, media: Media, file: string) {
    const root = await this.root();
    const relative = path.relative(root, folder).split(path.sep).join('/');
    const current = await this.readProject(relative);
    return {
      video: {
        id: media.id,
        aliases: media.aliases,
        fileName: path.basename(file),
        url: url(path.relative(root, file).split(path.sep).join('/')),
      } satisfies PackVideo,
      location: current.location,
      song: current.song,
    };
  }
  async saveSong(song: Song, expected?: string, relative?: string, migration = false) {
    validId(song.id);
    if (!song.drafts || !song.released) throw new Error('作品数据无效。');
    const folder =
      (await this.locate(song.id)) ?? (relative ? await this.folder(relative) : undefined);
    if (!folder) throw new Error('作品尚未关联到 maps 视频，请先定位视频。');
    const root = await this.root(),
      directory = path.relative(root, folder).split(path.sep).join('/');
    const existing = await this.metadata(folder);
    if (existing && existing.id !== song.id) throw new Error('目录属于另一首歌。');
    const current = existing ? await this.readProject(directory) : undefined;
    if (migration) {
      const backup = path.join(folder, '.wfp-backup');
      await mkdir(backup, { recursive: true });
      if (!inside(folder, await realpath(backup))) throw new Error('备份目录越出曲目目录。');
      const data = JSON.stringify(song, null, 2) + '\n';
      await atomic(path.join(backup, `browser-${digest(data).slice(0, 16)}.json`), data);
    }
    if (
      migration &&
      current &&
      (current.song.hidden ||
        Object.keys(current.song.drafts).length ||
        Object.keys(current.song.released).length)
    )
      return current;
    if (expected && current?.location.revision !== expected)
      throw new Error('磁盘谱面已被其他窗口或程序修改；本次未覆盖，请重新打开作品后再保存。');
    const project = existing ?? this.empty(song.id);
    const next: Project = {
      ...project,
      initialized: true,
      ...(song.hidden ? { hidden: true } : {}),
      drafts: {},
      released: {},
    };
    if (!song.hidden) delete next.hidden;
    const pending: { file: string; data: string }[] = [];
    const queueEdition = async (
      edition: Edition,
      type: (typeof CHART_TYPES)[number],
      file: string,
      owned: boolean,
    ) => {
      const chart = parseChart({ ...edition.chart, songId: song.id, chartType: type });
      const media = project.media.find(
        (m) =>
          m.id === chart.videoHint.assetId || m.aliases.includes(chart.videoHint.assetId ?? ''),
      );
      if (!media) throw new Error('视频尚未存入此曲目目录，未保存。请重新定位视频。');
      const actual = await this.mediaFile(folder, media);
      media.file = path.relative(folder, actual).split(path.sep).join('/');
      chart.videoHint = {
        ...chart.videoHint,
        assetId: media.id,
        fileName: path.basename(actual),
      };
      // Only our managed chart files are replaced; imported author's JSON stays intact.
      if (!managedChart.test(file)) throw new Error('托管谱面文件名无效。');
      const cover = await this.cover(folder, edition.cover, `wfp-${type}-draft-cover`);
      const entry: Entry = {
        file,
        cover,
        albumId: edition.albumId,
        updatedAt: edition.updatedAt,
      };
      const target = path.join(folder, file);
      if (
        !owned &&
        (await stat(target).then(
          () => true,
          () => false,
        ))
      )
        throw new Error(`文件 ${file} 已存在但不属于此作品，未覆盖。`);
      pending.push({ file: target, data: JSON.stringify(chart, null, 2) + '\n' });
      return entry;
    };
    for (const collection of ['drafts', 'released'] as const)
      for (const type of CHART_TYPES) {
        const edition = song[collection][type];
        if (!edition) continue;
        const file =
          project[collection][type]?.file ??
          `wfp-${type}-${collection === 'drafts' ? 'draft' : 'released'}.json`;
        next[collection][type] = await queueEdition(
          edition,
          type,
          file,
          !!project[collection][type],
        );
      }
    // Missing fields from an older client cannot erase named drafts.
    const named = new Map((current?.song.namedDrafts ?? []).map((d) => [d.id, d]));
    for (const draft of song.namedDrafts ?? []) {
      validId(draft.id);
      draftName(draft.name);
      if (!CHART_TYPES.includes(draft.chartType)) throw new Error('草稿类型无效。');
      const old = named.get(draft.id);
      if (old && old.chartType !== draft.chartType) throw new Error('不能改变已有草稿的类型。');
      named.set(draft.id, draft);
    }
    if (named.size || project.namedDrafts || song.namedDrafts) {
      next.namedDrafts = [];
      const names = new Set<string>();
      for (const draft of named.values()) {
        const name = draftName(draft.name),
          key = JSON.stringify([draft.chartType, name]);
        if (names.has(key)) throw new Error('同类型存在重名草稿。');
        names.add(key);
        const file = `wfp-${draft.chartType}-draft-${draft.id}.json`;
        const entry = await queueEdition(
          draft,
          draft.chartType,
          file,
          !!project.namedDrafts?.some((d) => d.id === draft.id),
        );
        next.namedDrafts.push({ ...entry, id: draft.id, name, chartType: draft.chartType });
      }
    }
    const active = song.activeDrafts ?? {};
    if (song.activeDrafts || project.activeDrafts) {
      next.activeDrafts = {};
      for (const type of CHART_TYPES) {
        const id = active[type];
        if (id && !next.namedDrafts?.some((d) => d.id === id && d.chartType === type))
          throw new Error('活动草稿不存在。');
        if (id) next.activeDrafts[type] = id;
      }
    }
    await atomic(
      path.join(folder, '.wfp-save.json'),
      JSON.stringify({
        project: next,
        charts: pending.map((entry) => ({ file: path.basename(entry.file), data: entry.data })),
      }),
    );
    await this.recover(folder);
    return this.readProject(directory);
  }
  private async cover(folder: string, source: string, _name: string) {
    if (!source) return '';
    if (source.startsWith('/__wfp/map-file/') || source.startsWith('/art/')) {
      const builtin = source.startsWith('/art/');
      const root = builtin ? await realpath(path.resolve('public')) : await this.root();
      const file = await realpath(
        path.resolve(
          root,
          localPath(decodeURIComponent(source.slice(builtin ? 1 : '/__wfp/map-file/'.length))),
        ),
      );
      if (!inside(root, file) || !/\.(png|webp|jpe?g)$/i.test(file))
        throw new Error('曲绘地址无效。');
      if (inside(folder, file)) return path.relative(folder, file).split(path.sep).join('/');
      const bytes = await readFile(file);
      if (bytes.length > 8 * 1024 * 1024) throw new Error('曲绘超过 8 MB。');
      const target = 'wfp-cover-' + digest(bytes).slice(0, 16) + path.extname(file).toLowerCase();
      await atomic(path.join(folder, target), bytes);
      return target;
    }
    const match = /^data:image\/(png|webp|jpeg);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(source);
    if (!match) throw new Error('曲绘格式无效。');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 8 * 1024 * 1024) throw new Error('曲绘超过 8 MB。');
    const target = `wfp-cover-${digest(bytes).slice(0, 16)}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    if (!(await stat(path.join(folder, target)).catch(() => undefined)))
      await atomic(path.join(folder, target), bytes);
    return target;
  }
  async albums(): Promise<Album[]> {
    const data = await read(path.join(await this.root(), 'library.json')).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return { albums: [] };
    });
    if (!Array.isArray(data.albums)) throw new Error('maps/library.json 格式无效。');
    return data.albums;
  }
  async saveAlbum(album: Album, migration = false) {
    if (
      !album ||
      typeof album.id !== 'string' ||
      !album.id ||
      typeof album.name !== 'string' ||
      typeof album.cover !== 'string'
    )
      throw new Error('专辑信息无效。');
    if (album.coverEffect !== undefined && !['anime-lens', 'none'].includes(album.coverEffect))
      throw new Error('专辑封面特效设置无效。');
    const albums = await this.albums();
    const existing = albums.find((a) => a.id === album.id);
    if (migration && existing) return existing;
    const root = await this.root();
    await atomic(
      path.join(root, 'library.json'),
      JSON.stringify(
        { version: 1, albums: [...albums.filter((a) => a.id !== album.id), album] },
        null,
        2,
      ) + '\n',
      true,
    );
    return album;
  }
}
