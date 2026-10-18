import { useState } from 'react';
import { ImagePlus, Plus, X } from 'lucide-react';
import {
  DIFFICULTIES,
  latestEdition,
  type Album,
  type Difficulty,
  type Edition,
  type Song,
} from '../library';
import { coverFromFile, coverFromVideo } from '../cover';
import { MediaController } from '../media';
import { CoverArt } from './CoverArt';
import { ModalBackdrop } from './ModalBackdrop';

export function PublicationFields({
  difficulty,
  albumId,
  cover,
  albums,
  media,
  onChange,
  onAlbums,
  onSongs,
  notify,
}: {
  difficulty: Difficulty;
  albumId: string;
  cover: string;
  albums: Album[];
  media: MediaController;
  onChange: (values: { difficulty?: Difficulty; albumId?: string; cover?: string }) => void;
  onAlbums: () => void;
  onSongs: () => void;
  notify: (text: string) => void;
}) {
  return (
    <div className="publication-fields">
      <div className="field-pair">
        <label className="field">
          <span>草稿难度</span>
          <select
            aria-label="草稿难度"
            value={difficulty}
            onChange={(e) => onChange({ difficulty: e.target.value as Difficulty })}
          >
            <option value="normal">NORMAL</option>
            <option value="hard">HARD</option>
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
      <p className="inspector-tip">草稿与发布版本独立。更换难度后发布，可制作同曲的另一张谱。</p>
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
          <CoverArt src={selected.cover} />
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
                    setSelected({ ...selected, cover: await coverFromFile(f) });
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
}: {
  songs: Song[];
  onClose: () => void;
  onOpen: (song: Song, difficulty: Difficulty, published: boolean) => void;
  onWithdraw: (song: Song, difficulty: Difficulty) => void;
  onDelete: (song: Song) => void;
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
        <p>草稿留在创作模式；已发布的难度出现在音游模式。</p>
        <div className="managed-songs">
          {[...songs]
            .sort((a, b) => latestEdition(b).updatedAt - latestEdition(a).updatedAt)
            .map((song) => (
              <article className="managed-song" key={song.id}>
                <div className="managed-song-title">
                  <CoverArt src={latestEdition(song).cover} />
                  <strong>{latestEdition(song).chart.title}</strong>
                  <button className="danger-link" onClick={() => onDelete(song)}>
                    从 WAIFU 删除
                  </button>
                </div>
                {DIFFICULTIES.map((d) =>
                  song.drafts[d] || song.released[d] ? (
                    <div className="managed-edition" key={d}>
                      <b className={`difficulty-tag ${d}`}>{d.toUpperCase()}</b>
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
  difficulty,
  albums,
  updating,
  onPublish,
  onDifficulty,
  onClose,
}: {
  edition: Edition;
  difficulty: Difficulty;
  albums: Album[];
  updating: boolean;
  onPublish: () => Promise<void>;
  onDifficulty: (difficulty: Difficulty) => Promise<void>;
  onClose: () => void;
}) {
  const [working, setWorking] = useState(false);
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
            <b className={`difficulty-tag ${difficulty}`}>{difficulty.toUpperCase()}</b>
            <p>{albums.find((a) => a.id === edition.albumId)?.name}</p>
          </div>
        </div>
        <label className="field">
          <span>发布难度</span>
          <select
            aria-label="发布难度"
            value={difficulty}
            disabled={working}
            onChange={async (e) => {
              setWorking(true);
              try {
                await onDifficulty(e.target.value as Difficulty);
              } finally {
                setWorking(false);
              }
            }}
          >
            <option value="normal">NORMAL</option>
            <option value="hard">HARD</option>
          </select>
        </label>
        <p>
          {updating
            ? `将替换已发布的 ${difficulty.toUpperCase()} 谱面。`
            : `发布当前 ${difficulty.toUpperCase()} 草稿。`}
          另一难度的发布版本保留。
        </p>
        <div className="modal-actions">
          <button className="button light" disabled={working} onClick={onClose}>
            取消
          </button>
          <button
            className="button primary"
            disabled={working}
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
