import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Disc3, Pencil } from 'lucide-react';
import { editionsIn, type Album, type Difficulty, type Song } from '../library';
import { CoverArt } from '../components/CoverArt';
import { ModalBackdrop } from '../components/ModalBackdrop';
import { formatTime } from '../timing';
import { createCalorieIndex } from '../calories';
import type { MenuSoundPlayer } from '../useMenuSounds';

const rating = (value: number | undefined) => (value === undefined ? '—' : String(value));

type Props = {
  page: 'albums' | 'songs';
  albums: Album[];
  songs: Song[];
  albumId: string;
  songId: string;
  difficulty: Difficulty;
  seed: number;
  onAlbum: (id: string, enter?: boolean) => void;
  onSong: (id: string) => void;
  onDifficulty: (difficulty: Difficulty) => void;
  onBack: () => void;
  onSound: MenuSoundPlayer;
  onCreate: () => void;
  onPlay: (song: Song, difficulty: Difficulty) => void;
  onPreview: (assetId: string | undefined) => void;
  onEdit: (song: Song, difficulty: Difficulty) => void;
  onManage: () => void;
};

export function LibraryMenu(props: Props) {
  const { page, albums, songs, albumId, songId, difficulty, seed, onAlbum, onSong, onDifficulty } =
    props;
  const scroller = useRef<HTMLDivElement>(null);
  const [confirmStart, setConfirmStart] = useState<{ song: Song; difficulty: Difficulty } | null>(
    null,
  );
  const confirmSong = (song: Song, difficulty: Difficulty) => {
    props.onSound('song');
    setConfirmStart({ song, difficulty });
  };
  const closeConfirmation = () => {
    props.onSound('back');
    setConfirmStart(null);
  };
  const album = albums.find((a) => a.id === albumId) ?? albums[0];
  const inAlbum = useMemo(
    () =>
      songs
        .filter((s) => editionsIn(s, albumId).length)
        .sort(
          (a, b) =>
            (b.released.hard ?? b.released.normal)!.updatedAt -
            (a.released.hard ?? a.released.normal)!.updatedAt,
        ),
    [songs, albumId],
  );
  const selected = inAlbum.find((s) => s.id === songId) ?? inAlbum[0];
  // Compile each released chart once when the library changes, never during playback/scroll.
  const totalCalories = useMemo(
    () =>
      new Map(
        songs.flatMap((song) =>
          Object.values(song.released).map(
            ({ chart }) => [chart, createCalorieIndex(chart.notes).at(-1)?.kcal ?? 0] as const,
          ),
        ),
      ),
    [songs],
  );
  const available = selected ? editionsIn(selected, albumId) : [];
  const selectedDifficulty = available.includes(difficulty) ? difficulty : available.at(-1);
  const edition =
    selected && selectedDifficulty ? selected.released[selectedDifficulty] : undefined;
  const previewAsset = page === 'songs' ? edition?.chart.videoHint.assetId : undefined;
  useEffect(() => props.onPreview(previewAsset), [previewAsset, props.onPreview]);
  const cards = page === 'albums' ? albums : inAlbum;
  const selectedId = page === 'albums' ? album.id : selected?.id;

  useLayoutEffect(() => {
    scroller.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  }, [page]);

  useEffect(() => {
    const node = scroller.current;
    if (!node || page !== 'songs') return;
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        node.scrollLeft += event.deltaY;
      }
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [page]);

  const select = (id: string) => {
    if (page === 'albums') onAlbum(id);
    else onSong(id);
    const child = Array.from(scroller.current?.children ?? []).find(
      (c) => (c as HTMLElement).dataset.id === id,
    );
    (child as HTMLElement | undefined)?.focus({ preventScroll: true });
    child?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  };
  const move = (amount: number) => {
    const index = Math.max(
      0,
      cards.findIndex((c) => c.id === selectedId),
    );
    const nextId = cards[Math.max(0, Math.min(cards.length - 1, index + amount))]?.id ?? albumId;
    if (nextId === selectedId) return;
    props.onSound('settings');
    select(nextId);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        document.querySelector('.menu-curtain') ||
        document.querySelector('[role="dialog"]') ||
        /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)
      )
        return;
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onBack();
      } else if (e.key === (page === 'albums' ? 'ArrowDown' : 'ArrowRight')) {
        e.preventDefault();
        move(1);
      } else if (e.key === (page === 'albums' ? 'ArrowUp' : 'ArrowLeft')) {
        e.preventDefault();
        move(-1);
      } else if (
        e.key === 'Enter' &&
        ((e.target as HTMLElement).tagName !== 'BUTTON' ||
          (e.target as HTMLElement).closest('.collection-album, .record-card'))
      ) {
        e.preventDefault();
        if (page === 'albums') onAlbum(album.id, true);
        else if (selected && selectedDifficulty) confirmSong(selected, selectedDifficulty);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const covers = useMemo(
    () =>
      Object.fromEntries(
        albums.map((a, index) => {
          const candidates = songs
            .flatMap((s) => editionsIn(s, a.id).map((d) => s.released[d]!.cover))
            .filter(Boolean);
          return [
            a.id,
            a.cover ||
              candidates[Math.floor(((seed + index * 0.618) % 1) * candidates.length)] ||
              '',
          ];
        }),
      ),
    [albums, songs, seed],
  );
  const trackScroll = () => {
    const node = scroller.current;
    if (!node) return;
    const horizontal = page === 'songs';
    const center = horizontal
      ? node.scrollLeft + node.clientWidth / 2
      : node.scrollTop + node.clientHeight / 2;
    let closest: HTMLElement | undefined,
      distance = Infinity;
    for (const child of Array.from(node.children) as HTMLElement[]) {
      const position = horizontal
        ? child.offsetLeft + child.offsetWidth / 2
        : child.offsetTop + child.offsetHeight / 2;
      if (Math.abs(position - center) < distance) {
        closest = child;
        distance = Math.abs(position - center);
      }
    }
    if (closest?.dataset.id && closest.dataset.id !== selectedId) {
      if (page === 'albums') onAlbum(closest.dataset.id);
      else onSong(closest.dataset.id);
    }
  };

  return (
    <section
      className={`music-menu ${page}`}
      aria-label={page === 'albums' ? '选择专辑' : '选择单曲'}
    >
      <header className="music-menu-header">
        <button
          className="menu-back"
          aria-label={page === 'albums' ? '主菜单' : '选择专辑'}
          onClick={props.onBack}
        >
          <ArrowLeft viewBox="3 3 18 18" />
        </button>
        <div>
          <span className="eyebrow">WAIFU FIT PLAYER / MUSIC COLLECTION</span>
          <h1>{page === 'albums' ? '选择专辑' : album.name}</h1>
        </div>
      </header>
      {page === 'albums' ? (
        <>
          <div key="albums" className="album-shelf" ref={scroller} onScroll={trackScroll}>
            {albums.map((a, index) => (
              <button
                key={a.id}
                data-id={a.id}
                aria-current={a.id === album.id}
                className="collection-album"
                onClick={() => onAlbum(a.id, true)}
              >
                <CoverArt src={covers[a.id]} eager={index < 2} />
                <span className="album-binding">WFP / {String(index + 1).padStart(2, '0')}</span>
                <span className="collection-label">
                  <span>
                    <small>{a.id === 'all' ? 'ALL TRACKS' : 'COLLECTION'}</small>
                    <strong>{a.name}</strong>
                  </span>
                  <span className="collection-count">
                    {songs.filter((s) => editionsIn(s, a.id).length).length}
                    <small>TRACKS</small>
                  </span>
                  <ArrowRight />
                </span>
              </button>
            ))}
          </div>
          <footer className="menu-hints">
            <span>↑ ↓ 选择专辑</span>
            <span>ENTER 进入</span>
            <span>ESC 返回</span>
          </footer>
        </>
      ) : !selected ? (
        <div className="library-empty">
          <Disc3 size={54} />
          <h2>这张专辑还没有歌曲</h2>
          <p>完成谱面后，在创作模式发布到这里。</p>
          <button className="button primary" onClick={props.onCreate}>
            <Pencil size={18} />
            创作模式
          </button>
        </div>
      ) : (
        <>
          <div key="songs" className="song-carousel" ref={scroller} onScroll={trackScroll}>
            {inAlbum.map((song) => {
              const ds = editionsIn(song, albumId);
              const d = ds.includes(difficulty) ? difficulty : ds.at(-1)!;
              const release = song.released[d]!;
              return (
                <button
                  className="record-card"
                  key={song.id}
                  data-id={song.id}
                  aria-current={song.id === selected.id}
                  onClick={() => {
                    select(song.id);
                    confirmSong(song, d);
                  }}
                  aria-label={`选择 ${release.chart.title}`}
                >
                  <span className="record-overline">
                    <span>
                      <small>LEVEL</small>
                      <b>{rating(release.chart.difficultyRating)}</b>
                    </span>
                    <span>
                      <b>{totalCalories.get(release.chart)?.toFixed(1)}</b>
                      <small>KCAL</small>
                    </span>
                  </span>
                  <span className="record-jacket">
                    <CoverArt src={release.cover} eager={song.id === selected.id} />
                    <svg className="cover-trace" viewBox="0 0 100 100" aria-hidden="true">
                      <rect x="1" y="1" width="98" height="98" pathLength="100" />
                      <rect x="1" y="1" width="98" height="98" pathLength="100" />
                    </svg>
                  </span>
                  <span className="record-caption">
                    <span className="record-title">
                      <strong>{release.chart.title}</strong>
                      <span className="record-difficulties">
                        {ds.map((level) => (
                          <i className={`difficulty-tag ${level}`} key={level}>
                            {level.toUpperCase()}
                          </i>
                        ))}
                      </span>
                    </span>
                    <span className="record-timing">
                      <span>
                        <small>BPM</small> {release.chart.tempoSegments[0]?.bpm ?? '—'}
                      </span>
                      <span>
                        <small>TIME</small> {formatTime(release.chart.videoHint.durationMs)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            className="carousel-arrow previous"
            aria-label="上一首"
            disabled={selected.id === inAlbum[0].id}
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </button>
          <button
            className="carousel-arrow next"
            aria-label="下一首"
            disabled={selected.id === inAlbum.at(-1)?.id}
            onClick={() => move(1)}
          >
            <ChevronRight />
          </button>
          <div className="selection-details">
            <div className="selection-title">
              <span className="eyebrow">SELECTED TRACK</span>
              <h2>{edition?.chart.title}</h2>
            </div>
            <div className="difficulty-choice" aria-label="游玩难度">
              {(['normal', 'hard'] as const).map((d) => (
                <button
                  key={d}
                  aria-label={d.toUpperCase()}
                  disabled={!available.includes(d)}
                  aria-pressed={selectedDifficulty === d}
                  className={d}
                  onClick={() => onDifficulty(d)}
                >
                  {d.toUpperCase()}
                  <small>
                    {rating(
                      available.includes(d)
                        ? selected.released[d]?.chart.difficultyRating
                        : undefined,
                    )}
                  </small>
                </button>
              ))}
            </div>
            <button
              className="start-track"
              onClick={() => selectedDifficulty && confirmSong(selected, selectedDifficulty)}
            >
              开始
            </button>
          </div>
          <footer className="menu-hints">
            <span>← → 切换歌曲 · ENTER 开始</span>
            <div>
              <button
                onClick={() => selectedDifficulty && props.onEdit(selected, selectedDifficulty)}
              >
                <Pencil size={15} />
                编辑此谱面
              </button>
              <button onClick={props.onManage}>管理曲目</button>
            </div>
          </footer>
        </>
      )}
      {confirmStart && (
        <ModalBackdrop onClose={closeConfirmation}>
          <section
            className="modal start-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-confirmation-title"
          >
            <span className="eyebrow">READY TO MOVE?</span>
            <h2 id="start-confirmation-title">开始这首曲子？</h2>
            <p>{confirmStart.song.released[confirmStart.difficulty]!.chart.title}</p>
            <span className={`difficulty-tag ${confirmStart.difficulty}`}>
              {confirmStart.difficulty.toUpperCase()} ·{' '}
              {rating(confirmStart.song.released[confirmStart.difficulty]!.chart.difficultyRating)}
            </span>
            <div className="modal-actions">
              <button className="button light" onClick={closeConfirmation}>
                取消
              </button>
              <button
                className="button primary"
                onClick={() => {
                  props.onSound('mode');
                  props.onPlay(confirmStart.song, confirmStart.difficulty);
                  setConfirmStart(null);
                }}
              >
                开始游戏
              </button>
            </div>
          </section>
        </ModalBackdrop>
      )}
    </section>
  );
}
