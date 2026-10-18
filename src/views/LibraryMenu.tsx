import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Pencil,
  Play,
  Settings,
} from 'lucide-react';
import { editionsIn, type Album, type Difficulty, type Song } from '../library';
import { CoverArt } from '../components/CoverArt';
import { formatTime } from '../timing';

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
  onSettings: () => void;
  onCreate: () => void;
  onPlay: (song: Song, difficulty: Difficulty) => void;
  onEdit: (song: Song, difficulty: Difficulty) => void;
  onManage: () => void;
};

export function LibraryMenu(props: Props) {
  const { page, albums, songs, albumId, songId, difficulty, seed, onAlbum, onSong, onDifficulty } =
    props;
  const scroller = useRef<HTMLDivElement>(null);
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
  const available = selected ? editionsIn(selected, albumId) : [];
  const selectedDifficulty = available.includes(difficulty) ? difficulty : available.at(-1);
  const edition =
    selected && selectedDifficulty ? selected.released[selectedDifficulty] : undefined;
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
    select(cards[Math.max(0, Math.min(cards.length - 1, index + amount))]?.id ?? albumId);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
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
        else if (selected && selectedDifficulty) props.onPlay(selected, selectedDifficulty);
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
        <button className="menu-back" onClick={props.onBack}>
          <ArrowLeft />
          {page === 'albums' ? '主菜单' : '选择专辑'}
        </button>
        <div>
          <span className="eyebrow">WAIFU FIT PLAYER / MUSIC COLLECTION</span>
          <h1>{page === 'albums' ? '选择专辑' : album.name}</h1>
        </div>
        <button className="icon-button" aria-label="全局设置" onClick={props.onSettings}>
          <Settings />
        </button>
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
                  onClick={() => select(song.id)}
                  aria-label={`选择 ${release.chart.title}`}
                >
                  <span className="record-jacket">
                    <CoverArt src={release.cover} eager={song.id === selected.id} />
                  </span>
                  <span className="record-caption">
                    <strong>{release.chart.title}</strong>
                    <span>
                      {ds.map((level) => (
                        <i className={`difficulty-tag ${level}`} key={level}>
                          {level.toUpperCase()}
                        </i>
                      ))}
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
              <p>
                {formatTime(edition?.chart.videoHint.durationMs ?? 0)}
                <span> / </span>
                {edition?.chart.tempoSegments[0]?.bpm ?? '—'} BPM
              </p>
            </div>
            <div className="difficulty-choice" aria-label="游玩难度">
              {(['normal', 'hard'] as const).map((d) => (
                <button
                  key={d}
                  disabled={!available.includes(d)}
                  aria-pressed={selectedDifficulty === d}
                  className={d}
                  onClick={() => onDifficulty(d)}
                >
                  {d.toUpperCase()}
                  <small>{available.includes(d) ? '已发布' : '未发布'}</small>
                </button>
              ))}
            </div>
            <button
              className="start-track"
              onClick={() => selectedDifficulty && props.onPlay(selected, selectedDifficulty)}
            >
              <Play fill="currentColor" />
              <span>
                开始<small>LET'S MOVE</small>
              </span>
              <ArrowRight />
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
    </section>
  );
}
