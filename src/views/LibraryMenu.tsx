import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Disc3, Pencil } from 'lucide-react';
import { editionsIn, type Album, type Difficulty, type Song } from '../library';
import { CoverArt } from '../components/CoverArt';
import { CoverTrace } from '../components/CoverTrace';
import { ModalBackdrop } from '../components/ModalBackdrop';
import { MenuControls } from '../components/MenuControls';
import { formatTime } from '../timing';
import { createCalorieIndex } from '../calories';
import { useCardHighlight } from '../useCardHighlight';
import type { MenuSoundPlayer } from '../useMenuSounds';

const rating = (value: number | undefined) => (value === undefined ? '—' : String(value));

function updateScrollFocus(node: HTMLElement, horizontal: boolean) {
  const center = horizontal
    ? node.scrollLeft + node.clientWidth / 2
    : node.scrollTop + node.clientHeight / 2;
  // Read geometry before updating styles; transforms never change the layout slots.
  const cards = Array.from(node.children, (child) => {
    const card = child as HTMLElement;
    const size = horizontal ? card.offsetWidth : card.offsetHeight;
    const position = (horizontal ? card.offsetLeft : card.offsetTop) + size / 2;
    return { card, size, distance: Math.abs(position - center) };
  });
  let closest: HTMLElement | undefined,
    distance = Infinity;
  for (const item of cards) {
    if (item.distance < distance) {
      closest = item.card;
      distance = item.distance;
    }
    if (!horizontal) {
      const focus = 1 - Math.min(1, item.distance / (item.size + 30));
      const eased = (focus * focus * (3 - 2 * focus)).toFixed(3);
      if (item.card.style.getPropertyValue('--album-focus') !== eased)
        item.card.style.setProperty('--album-focus', eased);
    }
  }
  return closest?.dataset.id;
}

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
};

export function LibraryMenu(props: Props) {
  const { page, albums, songs, albumId, songId, difficulty, seed, onAlbum, onSong, onDifficulty } =
    props;
  const scroller = useRef<HTMLDivElement>(null);
  const { activate, getCurrent, handlers } = useCardHighlight();
  const scrollFrame = useRef(0);
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
    const node = scroller.current;
    if (!node) return;
    const centerSelection = () => {
      if (page === 'albums') {
        const card = node.firstElementChild as HTMLElement | null;
        if (card)
          node.style.setProperty(
            '--album-padding',
            `${Math.max(16, (node.clientHeight - card.offsetHeight) / 2)}px`,
          );
      }
      node
        .querySelector<HTMLElement>('[aria-current="true"]')
        ?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      updateScrollFocus(node, page === 'songs');
    };
    centerSelection();
    if (page === 'songs') activate(node.querySelector<HTMLElement>('[aria-current="true"]'));
    const resize = new ResizeObserver(centerSelection);
    if (page === 'albums') resize.observe(node);
    return () => {
      resize.disconnect();
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
    };
  }, [page, albums, activate]);

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
    const focusTarget = child?.querySelector<HTMLButtonElement>('.record-select') ?? child;
    activate((child as HTMLElement | undefined) ?? null);
    (focusTarget as HTMLElement | undefined)?.focus({ preventScroll: true });
    child?.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };
  const move = (amount: number) => {
    const index = Math.max(
      0,
      cards.findIndex((c) => c.id === (getCurrent()?.dataset.id ?? selectedId)),
    );
    const nextId = cards[Math.max(0, Math.min(cards.length - 1, index + amount))]?.id ?? albumId;
    if (nextId === selectedId) {
      activate(scroller.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? null);
      return;
    }
    props.onSound('settings');
    select(nextId);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const current = getCurrent();
      const gear = document.querySelector<HTMLButtonElement>('.menu-settings');
      if (
        e.defaultPrevented ||
        document.querySelector('.menu-curtain') ||
        (document.querySelector('[role="dialog"]') && current !== gear) ||
        target.closest('.corner-settings') ||
        /INPUT|SELECT|TEXTAREA/.test(target.tagName) ||
        target.isContentEditable
      )
        return;
      const focusGear = () => {
        activate(gear);
        if (gear && document.activeElement !== gear) {
          props.onSound('settings');
          gear.focus({ preventScroll: true });
        }
      };
      if (current === gear) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!e.repeat) gear?.click();
          return;
        }
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          if (document.querySelector('.corner-settings[data-open]')) {
            if (e.key === 'ArrowDown')
              document
                .querySelector<HTMLButtonElement>(
                  '.corner-settings [role="tab"][aria-selected="true"]',
                )
                ?.focus();
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            if (selectedId) {
              props.onSound('settings');
              select(selectedId);
            }
          } else focusGear();
          return;
        }
      }
      const index = Math.max(
        0,
        cards.findIndex((card) => card.id === (current?.dataset.id ?? selectedId)),
      );
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        if (!e.repeat) props.onBack();
      } else if (e.key === (page === 'albums' ? 'ArrowDown' : 'ArrowRight')) {
        e.preventDefault();
        move(1);
      } else if (e.key === (page === 'albums' ? 'ArrowUp' : 'ArrowLeft')) {
        e.preventDefault();
        if (page === 'albums' && index === 0) focusGear();
        else move(-1);
      } else if (e.key === (page === 'albums' ? 'ArrowRight' : 'ArrowUp')) {
        e.preventDefault();
        focusGear();
      } else if (
        e.key === 'Enter' &&
        !target.closest('.edit-track') &&
        (current?.matches('.collection-album, .record-card') || target.tagName !== 'BUTTON')
      ) {
        e.preventDefault();
        if (e.repeat) return;
        if (page === 'albums') onAlbum(current?.dataset.id ?? album.id, true);
        else {
          const song = inAlbum.find((song) => song.id === current?.dataset.id) ?? selected;
          if (!song) return;
          const choices = editionsIn(song, albumId);
          const nextDifficulty = choices.includes(difficulty) ? difficulty : choices.at(-1);
          if (nextDifficulty) {
            onSong(song.id);
            confirmSong(song, nextDifficulty);
          }
        }
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
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const node = scroller.current;
      if (!node || node.closest('.menu-scene[data-exit-to]')) return;
      const id = updateScrollFocus(node, page === 'songs');
      if (id && id !== selectedId) {
        if (page === 'albums') onAlbum(id);
        else onSong(id);
      }
    });
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
          <div
            key="albums"
            className="album-shelf"
            ref={scroller}
            onScroll={trackScroll}
            {...handlers}
          >
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
                <CoverTrace />
              </button>
            ))}
          </div>
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
          <div
            key="songs"
            className="song-carousel"
            ref={scroller}
            onScroll={trackScroll}
            {...handlers}
          >
            {inAlbum.map((song) => {
              const ds = editionsIn(song, albumId);
              const d = ds.includes(difficulty) ? difficulty : ds.at(-1)!;
              const release = song.released[d]!;
              return (
                <div
                  className="record-card"
                  key={song.id}
                  data-id={song.id}
                  aria-current={song.id === selected.id}
                >
                  <button
                    className="record-select"
                    onClick={() => {
                      select(song.id);
                      confirmSong(song, d);
                    }}
                    aria-label={`选择 ${release.chart.title}`}
                  />
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
                    <CoverTrace />
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
                        <button
                          className="edit-track"
                          aria-label="编辑谱面"
                          title="编辑谱面"
                          onClick={() => props.onEdit(song, d)}
                        >
                          <Pencil size={14} strokeWidth={2.5} aria-hidden="true" />
                        </button>
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
                </div>
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
          </div>
        </>
      )}
      <MenuControls onBack={props.onBack} />
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
