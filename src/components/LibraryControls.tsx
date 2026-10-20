import { useMemo, useState } from 'react';
import { ImagePlus, Plus, X } from 'lucide-react';
import {
  CHART_TYPES,
  latestEdition,
  type Album,
  type ChartType,
  type Edition,
  type Song,
} from '../library';
import { albumCoverFromFile, coverFromFile, coverFromVideo } from '../cover';
import { ALBUM_ARTWORK, useAlbumArtwork } from '../useAlbumArtwork';
import { MediaController } from '../media';
import { CoverArt } from './CoverArt';
import { ModalBackdrop } from './ModalBackdrop';
import { playableChart, playDuration, playRangeCrossings, videoPlayRange } from '../play-range';
import { formatTime } from '../timing';
import { PlayRangeWarnings } from './PlayRangeFields';
import { ratingSummary } from '../chart-types';

export function PublicationFields({
  chartType,
  albumId,
  cover,
  albums,
  media,
  onChange,
  onAlbums,
  onSongs,
  notify,
}: {
  chartType: ChartType;
  albumId: string;
  cover: string;
  albums: Album[];
  media: MediaController;
  onChange: (values: { chartType?: ChartType; albumId?: string; cover?: string }) => void;
  onAlbums: () => void;
  onSongs: () => void;
  notify: (text: string) => void;
}) {
  return (
    <div className="publication-fields">
      <div className="field-pair">
        <label className="field">
          <span>谱面类型</span>
          <select
            aria-label="谱面类型"
            value={chartType}
            onChange={(e) => onChange({ chartType: e.target.value as ChartType })}
          >
            <option value="fitness">FITNESS / 健身</option>
            <option value="dance">DANCE / 舞蹈</option>
          </select>
        </label>
        <label className="field">
          <span>所属专辑</span>
          <select
            aria-label="所属专辑"
            value={albumId}
            onChange={(e) => onChange({ albumId: e.target.value })}
          >
            <option value="" disabled>
              请选择专辑
            </option>
            {albums
              .filter((a) => a.id !== 'all')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="draft-cover">
        <CoverArt src={cover} />
        <div>
          <label className="button small light">
            <ImagePlus size={14} />
            选择曲绘
            <input
              hidden
              type="file"
              accept="image/*"
              aria-label="选择曲绘图片"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = '';
                if (file)
                  try {
                    onChange({ cover: await coverFromFile(file) });
                  } catch {
                    notify('无法读取这张图片，请选择其他图片。');
                  }
              }}
            />
          </label>
          <button
            onClick={() => {
              try {
                if (media.element) onChange({ cover: coverFromVideo(media.element) });
              } catch (error) {
                notify((error as Error).message);
              }
            }}
          >
            用当前视频画面
          </button>
        </div>
      </div>
      <div className="publication-management">
        <button className="text-link" onClick={onAlbums}>
          管理专辑与封面
        </button>
        <button className="text-link" onClick={onSongs}>
          管理曲目
        </button>
      </div>
      <p className="inspector-tip">
        FITNESS 跟随节奏锻炼，DANCE 跟随视频舞步。两种类型的草稿与发布版本各自独立。
      </p>
    </div>
  );
}

export function AlbumManager({
  albums,
  onSave,
  onClose,
  notify,
}: {
  albums: Album[];
  onSave: (a: Album) => Promise<void>;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const [selected, setSelected] = useState(albums[0]);
  const artwork = useAlbumArtwork(albums);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!selected.name.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...selected, name: selected.name.trim() });
      notify('专辑已保存。');
    } catch (error) {
      notify(`保存失败：${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalBackdrop onClose={onClose}>
      <section
        className="modal album-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="album-manager-title"
      >
        <button className="modal-close icon-button" aria-label="关闭专辑设置" onClick={onClose}>
          <X />
        </button>
        <h2 id="album-manager-title">专辑与封面</h2>
        <div className="album-edit-tabs">
          {albums.map((a) => (
            <button
              key={a.id}
              className={a.id === selected.id ? 'active' : ''}
              onClick={() => setSelected(a)}
            >
              {a.name}
            </button>
          ))}
          <button onClick={() => setSelected({ id: crypto.randomUUID(), name: '', cover: '' })}>
            <Plus size={14} />
            新建专辑
          </button>
        </div>
        <label className="field">
          <span>专辑名称</span>
          <input
            aria-label="专辑名称"
            disabled={selected.id === 'all'}
            value={selected.name}
            onChange={(e) => setSelected({ ...selected, name: e.target.value })}
          />
        </label>
        <div className="album-cover-preview">
          <CoverArt
            src={
              selected.cover === albums.find((album) => album.id === selected.id)?.cover
                ? artwork[selected.id]
                : selected.cover || ALBUM_ARTWORK[selected.id]
            }
          />
        </div>
        <div className="modal-actions">
          <label className="button light small">
            选择封面
            <input
              hidden
              type="file"
              accept="image/*"
              aria-label="选择专辑封面"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (f)
                  try {
                    setSelected({ ...selected, cover: await albumCoverFromFile(f) });
                  } catch {
                    notify('无法读取封面图片。');
                  }
              }}
            />
          </label>
          <button
            className="button light small"
            onClick={() => setSelected({ ...selected, cover: '' })}
          >
            随机使用曲绘
          </button>
          <button
            className="button primary small"
            disabled={saving || !selected.name.trim()}
            onClick={() => void save()}
          >
            保存专辑
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}

export function SongManager({
  songs,
  onClose,
  onOpen,
  onWithdraw,
  onDelete,
  onExport,
}: {
  songs: Song[];
  onClose: () => void;
  onOpen: (song: Song, chartType: ChartType, published: boolean) => void;
  onWithdraw: (song: Song, chartType: ChartType) => void;
  onDelete: (song: Song) => void;
  onExport: (song: Song) => void;
}) {
  return (
    <ModalBackdrop onClose={onClose}>
      <section
        className="modal song-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-manager-title"
      >
        <button className="modal-close icon-button" aria-label="关闭本地作品" onClick={onClose}>
          <X />
        </button>
        <h2 id="song-manager-title">本地作品</h2>
        <p>草稿留在创作模式；已发布的谱面可导出为含视频、曲绘的分享曲包。</p>
        <div className="managed-songs">
          {[...songs]
            .sort((a, b) => latestEdition(b).updatedAt - latestEdition(a).updatedAt)
            .map((song) => (
              <article className="managed-song" key={song.id}>
                <div className="managed-song-title">
                  <CoverArt src={latestEdition(song).cover} />
                  <strong>{latestEdition(song).chart.title}</strong>
                  <button
                    disabled={!CHART_TYPES.some((type) => song.released[type])}
                    onClick={() => onExport(song)}
                  >
                    导出曲包
                  </button>
                  <button className="danger-link" onClick={() => onDelete(song)}>
                    从 WAIFU 删除
                  </button>
                </div>
                {CHART_TYPES.map((d) =>
                  song.drafts[d] || song.released[d] ? (
                    <div className="managed-edition" key={d}>
                      <b className={`chart-type-tag ${d}`}>{d.toUpperCase()}</b>
                      <button disabled={!song.drafts[d]} onClick={() => onOpen(song, d, false)}>
                        继续草稿
                      </button>
                      {song.released[d] ? (
                        <>
                          <button onClick={() => onOpen(song, d, true)}>编辑发布版</button>
                          <button className="danger-link" onClick={() => onWithdraw(song, d)}>
                            撤下发布
                          </button>
                        </>
                      ) : (
                        <span>未发布</span>
                      )}
                    </div>
                  ) : null,
                )}
              </article>
            ))}
        </div>
        {!songs.length && (
          <p className="library-empty-small">还没有本地作品。在编辑器里新建或打开谱面即可。</p>
        )}
      </section>
    </ModalBackdrop>
  );
}

export function PublishDialog({
  edition,
  chartType,
  albums,
  updating,
  onPublish,
  onChartType,
  onClose,
  onLocate,
}: {
  edition: Edition;
  chartType: ChartType;
  albums: Album[];
  updating: boolean;
  onPublish: () => Promise<void>;
  onChartType: (chartType: ChartType) => Promise<void>;
  onClose: () => void;
  onLocate: (id: string) => void;
}) {
  const [working, setWorking] = useState(false);
  const issues = useMemo(() => playRangeCrossings(edition.chart), [edition.chart]);
  const playable = useMemo(() => playableChart(edition.chart), [edition.chart]);
  const range = videoPlayRange(edition.chart);
  const empty = !playable.notes.length && !playable.specialEvents.length;
  return (
    <ModalBackdrop
      onClose={() => {
        if (!working) onClose();
      }}
    >
      <section
        className="modal publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
      >
        <h2 id="publish-title">{updating ? '更新发布' : '发布到曲库'}</h2>
        <div className="publish-preview">
          <CoverArt src={edition.cover} />
          <div>
            <h3>{edition.chart.title}</h3>
            <b className={`chart-type-tag ${chartType}`}>{chartType.toUpperCase()}</b>
            <p>{ratingSummary(edition.chart)}</p>
            <p>{albums.find((a) => a.id === edition.albumId)?.name}</p>
          </div>
        </div>
        <label className="field">
          <span>发布类型</span>
          <select
            aria-label="发布类型"
            value={chartType}
            disabled={working}
            onChange={async (e) => {
              setWorking(true);
              try {
                await onChartType(e.target.value as ChartType);
              } finally {
                setWorking(false);
              }
            }}
          >
            <option value="fitness">FITNESS / 健身</option>
            <option value="dance">DANCE / 舞蹈</option>
          </select>
        </label>
        <p className="publish-range-summary">
          游玩区间 {formatTime(range.startMs)}–{formatTime(range.endMs)} ·{' '}
          {formatTime(playDuration(edition.chart))}
        </p>
        <PlayRangeWarnings issues={issues} onLocate={onLocate} />
        {empty && !issues.length && (
          <p className="play-range-warnings" role="alert">
            游玩区间内没有动作，请调整区间或编写谱面。
          </p>
        )}
        <p>
          {updating
            ? `将替换已发布的 ${chartType.toUpperCase()} 谱面。`
            : `发布当前 ${chartType.toUpperCase()} 草稿。`}
          另一类型的发布版本保留。
        </p>
        <div className="modal-actions">
          <button className="button light" disabled={working} onClick={onClose}>
            取消
          </button>
          <button
            className="button primary"
            disabled={working || !!issues.length || empty}
            onClick={async () => {
              setWorking(true);
              try {
                await onPublish();
              } finally {
                setWorking(false);
              }
            }}
          >
            {updating ? '确认更新发布' : '确认发布'}
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}
