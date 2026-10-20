import { CHART_TYPES } from './chart-types';
import { latestEdition, type Album, type Song } from './library';
import { resolveVideo } from './local-media';
import {
  PACK_FORMAT,
  playablePackChart,
  type PackAlbum,
  type PackChart,
  type SongPack,
} from './song-pack';
import { createZip, type ZipEntry } from './zip';

export async function exportSongPack(
  song: Song,
  albums: Album[],
  onProgress?: (value: number) => void,
) {
  const editions = CHART_TYPES.filter((type) => !!song.released[type]);
  if (!editions.length) throw new Error('请先发布至少一种谱面，再导出分享曲包。');
  const title = latestEdition({ ...song, drafts: {} }).chart.title;
  let folder =
    Array.from(title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim())
      .slice(0, 64)
      .join('')
      .replace(/[. ]+$/, '') || 'Song';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(folder)) folder = `Song-${folder}`;
  const entries: ZipEntry[] = [];
  const add = (name: string, blob: Blob) => {
    entries.push({ name: `${folder}/${name}`, blob });
    return name;
  };
  const json = (name: string, value: unknown) =>
    add(name, new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const mediaFiles = new Map<string, string>();
  const pictures = new Map<string, string>();
  const picture = async (url: string, prefix: string) => {
    if (!url) return undefined;
    if (pictures.has(url)) return pictures.get(url)!;
    const response = await fetch(url);
    if (!response.ok) throw new Error('读取曲绘或专辑封面失败，请重新选择图片。');
    const blob = await response.blob();
    const extension = (
      { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' } as Record<string, string>
    )[blob.type];
    if (!extension) throw new Error('曲包封面需要 PNG、WebP 或 JPEG 格式。');
    const name = add(`${prefix}.${extension}`, blob);
    pictures.set(url, name);
    return name;
  };
  const charts: SongPack['charts'] = {};
  for (const type of editions) {
    const edition = song.released[type]!;
    const chart = playablePackChart(edition.chart, type);
    const id = chart.videoHint.assetId;
    if (!id) throw new Error('谱面尚未关联视频。');
    let video = mediaFiles.get(id);
    if (!video) {
      const resolved = await resolveVideo(id);
      if (!('asset' in resolved)) throw new Error(resolved.reason);
      const asset = resolved.asset;
      let blob: Blob;
      if (asset.kind === 'file') blob = asset.file;
      else {
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error('读取曲包视频失败。');
        blob = await response.blob();
      }
      video = add(mediaFiles.size ? `video-${mediaFiles.size + 1}.mp4` : 'video.mp4', blob);
      mediaFiles.set(id, video);
    }
    const group = albums.find((a) => a.id === edition.albumId);
    if (!group) throw new Error('未找到谱面所属专辑，请先指定专辑。');
    const album: PackAlbum = {
      id: group.id,
      name: group.name,
      cover: await picture(group.cover, `${type}-album`),
    };
    const cover = await picture(edition.cover, `${type}-cover`);
    const { assetId: _localId, ...hint } = chart.videoHint;
    json(`${type}.wfp.json`, {
      ...chart,
      songId: song.id,
      videoHint: { ...hint, fileName: video },
    });
    charts[type] = { file: `${type}.wfp.json`, video, cover, album };
  }
  const first = charts[editions[0]] as PackChart;
  const manifest: SongPack = {
    format: PACK_FORMAT,
    version: 1,
    id: song.id,
    title,
    video: first.video!,
    cover: first.cover,
    album: first.album!,
    charts,
  };
  json('song.json', manifest);
  return { blob: await createZip(entries, onProgress), fileName: `${folder}.wfp.zip` };
}
