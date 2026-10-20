import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Disc3, Pencil } from 'lucide-react';
import { editionsIn, type Album, type ChartType, type Song } from '../library';
import { CoverArt } from '../components/CoverArt';
import { CoverTrace } from '../components/CoverTrace';
import { StartBriefing } from '../components/StartBriefing';
import { MenuControls } from '../components/MenuControls';
import { AlbumBackdrop } from '../components/AlbumBackdrop';
import { AlbumCover } from '../components/AlbumCover';
import { formatTime } from '../timing';
import { createCalorieIndex } from '../calories';
import { playableChart, playDuration } from '../play-range';
import type { PlayRange } from '../model';
import { useCardHighlight } from '../useCardHighlight';
import type { MenuSoundPlayer } from '../useMenuSounds';
import { ratingValue, ratingSummary } from '../chart-types';
import { useAlbumArtwork } from '../useAlbumArtwork';
import { useMenuWheel } from '../useMenuWheel';
import { useAlbumInsertion } from '../useAlbumInsertion';
import type { MenuMusic } from '../useMenuMusic';
import { AlbumDeck, ALBUM_DECK_TIMING } from '../components/AlbumDeck';

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
  chartType: ChartType;
  seed: number;
  musicPlaying: boolean;
  music: MenuMusic;
  playerOpen: boolean;
  onPlayerOpen: (open: boolean) => void;
  onAlbum: (id: string, enter?: boolean) => void;
  onSong: (id: string) => void;
  onChartType: (chartType: ChartType) => void;
  onBack: () => void;
  onSound: MenuSoundPlayer;
  onCreate: () => void;
  onPlay: (song: Song, chartType: ChartType) => Promise<void>;
  onPreview: (assetId: string | undefined, range?: PlayRange) => void;
  onEdit: (song: Song, chartType: ChartType) => void;
};

export function LibraryMenu(props: Props) {
  const { page, albums, songs, albumId, songId, chartType, seed, onAlbum, onSong, onChartType } =
    props;
  const scroller = useRef<HTMLDivElement>(null);
  const { activate, getCurrent, handlers } = useCardHighlight();
  const artwork = useAlbumArtwork(albums);
  const scrollFrame = useRef(0);
  const centering = useRef<string | null>(null);
  const [deckReady, setDeckReady] = useState(false);
  const open = page === 'albums' && props.playerOpen;
  const menu = useRef<HTMLElement>(null);
  const closePlayer = () => {
    if (inserting) return;
    props.onSound('back');
    props.onPlayerOpen(false);
    const card = scroller.current?.querySelector<HTMLElement>('[aria-current="true"]');
    activate(card ?? null);
    card?.focus({ preventScroll: true });
  };
  const back = () => (open ? closePlayer() : props.onBack());
  const [confirmStart, setConfirmStart] = useState<{
    song: Song;
    chartType: ChartType;
  } | null>(null);
  const confirmSong = (song: Song, chartType: ChartType) => {
    props.onSound('song');
    setConfirmStart({ song, chartType });
  };
  const closeConfirmation = () => {
    setConfirmStart(null);
  };
  const album = albums.find((a) => a.id === albumId) ?? albums[0];
  const { inserting, begin: beginInsert } = useAlbumInsertion({
    menu,
    enabled: open && deckReady,
    albumId: album.id,
    onComplete: () => props.onAlbum(album.id, true),
    onSound: props.onSound,
  });
  const holdInsert = (event: React.PointerEvent) => {
    if (!open || !deckReady || inserting || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    menu.current?.setPointerCapture(event.pointerId);
    beginInsert(event.pointerId);
  };
  const inAlbum = useMemo(
    () =>
      songs
        .filter((s) => editionsIn(s, albumId).length)
        .sort(
          (a, b) =>
            (b.released.dance ?? b.released.fitness)!.updatedAt -
            (a.released.dance ?? a.released.fitness)!.updatedAt,
        ),
    [songs, albumId],
  );
  const selected = inAlbum.find((s) => s.id === songId) ?? inAlbum[0];
  useMenuWheel(
    scroller,
    page === 'songs' ? 'x' : 'y',
    !inserting && (page === 'albums' || !!selected),
  );
  // Compile each released chart once when the library changes, never during playback/scroll.
  const totalCalories = useMemo(
    () =>
      new Map(
        songs.flatMap((song) =>
          Object.values(song.released).map(
            ({ chart }) =>
              [chart, createCalorieIndex(playableChart(chart).notes).at(-1)?.kcal ?? 0] as const,
          ),
        ),
      ),
    [songs],
  );
  const available = selected ? editionsIn(selected, albumId) : [];
  const selectedChartType = available.includes(chartType) ? chartType : available.at(-1);
  const edition = selected && selectedChartType ? selected.released[selectedChartType] : undefined;
  const previewAsset = page === 'songs' || open ? edition?.chart.videoHint.assetId : undefined;
  const previewRange = page === 'songs' || open ? edition?.chart.playRange : undefined;
  useEffect(
    () => props.onPreview(previewAsset, previewRange),
    [previewAsset, previewRange, props.onPreview],
  );
  const cards = page === 'albums' ? albums : inAlbum;
  const selectedId = page === 'albums' ? album.id : selected?.id;
  useEffect(() => {
    setDeckReady(false);
    if (!open) return;
    const timer = setTimeout(
      () => setDeckReady(true),
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ALBUM_DECK_TIMING.unfold,
    );
    return () => clearTimeout(timer);
  }, [open, album.id]);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const card = scroller.current?.querySelector<HTMLElement>('[aria-current="true"]');
      if (!card || !menu.current) return;
      const shelf = scroller.current!.getBoundingClientRect();
      const lift = Number.parseFloat(getComputedStyle(card).getPropertyValue('--album-lift')) || 0;
      menu.current.style.setProperty('--deck-slot-y', `${shelf.y + shelf.height / 2 + lift}px`);
      // Use the settled focus size even when a newly clicked card is still scrolling into place.
      menu.current.style.setProperty('--deck-slot-height', `${card.offsetHeight * 1.12 + 18}px`);
      // Use layout dimensions and the final shelf offset, never animated rectangles.
      const shelfNode = scroller.current!;
      const cardRight =
        shelfNode.offsetLeft +
        shelfNode.offsetWidth / 2 -
        innerWidth * 0.1 +
        card.offsetWidth * 0.56;
      const slotLeft = innerWidth * 0.71;
      menu.current.style.setProperty('--deck-insert-hint-x', `${(cardRight + slotLeft) / 2}px`);
    };
    measure();
    const timer = setTimeout(measure, ALBUM_DECK_TIMING.unfold);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [open, album.id]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest(
          '.collection-album, .album-deck, .menu-settings, .corner-settings, .menu-back, .menu-control-back',
        )
      )
        return;
      closePlayer();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  });
  const confirmAlbum = (id: string) => {
    if (inserting) return;
    if (!open || id !== album.id) {
      select(id);
      props.onPlayerOpen(true);
      props.onSound('settings');
    }
  };
  const changePreviewTrack = (delta: number) => {
    if (!inAlbum.length) return;
    const index = Math.max(
      0,
      inAlbum.findIndex((song) => song.id === selected?.id),
    );
    onSong(inAlbum[(index + delta + inAlbum.length) % inAlbum.length].id);
    props.onSound('settings');
  };

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const centerSelection = () => {
      centering.current = null;
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
    const current = node.querySelector<HTMLElement>('[aria-current="true"]');
    activate(current);
    const resize = new ResizeObserver(centerSelection);
    if (page === 'albums') resize.observe(node);
    return () => {
      resize.disconnect();
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
    };
  }, [page, albums, activate]);

  const select = (id: string) => {
    if (page === 'albums') onAlbum(id);
    else onSong(id);
    const child = Array.from(scroller.current?.children ?? []).find(
      (c) => (c as HTMLElement).dataset.id === id,
    );
    const focusTarget = child?.querySelector<HTMLButtonElement>('.record-select') ?? child;
    centering.current =
      page === 'albums' && child && !matchMedia('(prefers-reduced-motion: reduce)').matches
        ? id
        : null;
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
        inserting ||
        document.querySelector('.menu-curtain') ||
        (document.querySelector('[role="dialog"]') && current !== gear) ||
        target.closest('.corner-settings') ||
        (/INPUT|SELECT|TEXTAREA/.test(target.tagName) &&
          !(
            open &&
            (['Escape', 'Backspace'].includes(e.key) || e.code === 'Space') &&
            target.matches('input[type="range"]')
          )) ||
        target.isContentEditable
      )
        return;
      if (open && (e.key === 'Escape' || e.key === 'Backspace')) {
        e.preventDefault();
        if (!e.repeat) closePlayer();
        return;
      }
      if (open && e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) props.music.togglePreview();
        return;
      }
      if (open && current !== gear && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (!e.repeat) changePreviewTrack(e.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (
        open &&
        e.key === 'Enter' &&
        current !== gear &&
        (target.closest('.album-deck-insert') || !target.closest('.album-deck'))
      ) {
        e.preventDefault();
        if (!e.repeat) beginInsert(e.shiftKey ? 'automatic' : 'keyboard');
        return;
      }
      if (open && target.closest('.album-deck')) return;
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
        (e.key === 'Enter' || (page === 'albums' && e.code === 'Space')) &&
        !target.closest('.edit-track, .carousel-arrow') &&
        (current?.matches('.collection-album, .record-card') || target.tagName !== 'BUTTON')
      ) {
        e.preventDefault();
        if (e.repeat) return;
        if (page === 'albums') confirmAlbum(current?.dataset.id ?? album.id);
        else {
          const song = inAlbum.find((song) => song.id === current?.dataset.id) ?? selected;
          if (!song) return;
          const choices = editionsIn(song, albumId);
          const nextChartType = choices.includes(chartType) ? chartType : choices.at(-1);
          if (nextChartType) {
            onSong(song.id);
            confirmSong(song, nextChartType);
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
            artwork[a.id] ||
              candidates[Math.floor(((seed + index * 0.618) % 1) * candidates.length)] ||
              '',
          ];
        }),
      ),
    [albums, songs, seed, artwork],
  );
  const trackScroll = () => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const node = scroller.current;
      if (!node || inserting || node.closest('.menu-scene[data-exit-to]')) return;
      const id = updateScrollFocus(node, page === 'songs');
      if (centering.current) return;
      if (id && id !== selectedId) {
        if (page === 'albums') onAlbum(id);
        else onSong(id);
      }
    });
  };

  return (
    <section
      ref={menu}
      className={`music-menu ${page}`}
      data-player-open={open || undefined}
      data-inserting={inserting || undefined}
      aria-label={page === 'albums' ? '选择专辑' : '选择单曲'}
    >
      <header className="music-menu-header">
        <button
          className="menu-back"
          aria-label={page === 'albums' ? '主菜单' : '选择专辑'}
          onClick={back}
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
          <AlbumBackdrop album={album} index={albums.indexOf(album)} />
          <div
            key="albums"
            className="album-shelf"
            ref={scroller}
            onScroll={trackScroll}
            onScrollEnd={() => {
              centering.current = null;
            }}
            onWheelCapture={() => {
              centering.current = null;
            }}
            inert={inserting}
            {...handlers}
          >
            {albums.map((a, index) => (
              <button
                key={a.id}
                data-id={a.id}
                aria-current={a.id === album.id}
                className="collection-album"
                onPointerDown={(event) => {
                  if (a.id === album.id) holdInsert(event);
                }}
                onClick={() => confirmAlbum(a.id)}
              >
                <AlbumCover
                  src={covers[a.id]}
                  albumId={a.id}
                  selected={a.id === album.id}
                  playing={props.musicPlaying}
                  eager={index < 2}
                />
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
          <AlbumDeck
            open={open}
            ready={deckReady}
            inserting={inserting}
            edition={edition}
            count={inAlbum.length}
            index={Math.max(
              0,
              inAlbum.findIndex((song) => song.id === selected?.id),
            )}
            music={props.music}
            onTrack={changePreviewTrack}
            onInsertHold={holdInsert}
          />
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
          <div className="song-picker" data-chart-type={selectedChartType}>
            <div
              key="songs"
              className="song-carousel"
              ref={scroller}
              onScroll={trackScroll}
              {...handlers}
            >
              {inAlbum.map((song) => {
                const ds = editionsIn(song, albumId);
                const d = ds.includes(chartType) ? chartType : ds.at(-1)!;
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
                        <small>{d === 'fitness' ? 'INTENSITY' : 'LEVEL'}</small>
                        <b>{ratingValue(release.chart)}</b>
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
                        <span className="record-chart-types">
                          {ds.map((level) => (
                            <i className={`chart-type-tag ${level}`} key={level}>
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
                          <small>TIME</small> {formatTime(playDuration(release.chart))}
                        </span>
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            {selected.id !== inAlbum[0].id && (
              <button
                className="carousel-arrow previous"
                aria-label="上一首"
                onClick={() => move(-1)}
              >
                <ArrowLeft aria-hidden="true" />
              </button>
            )}
            {selected.id !== inAlbum.at(-1)?.id && (
              <button className="carousel-arrow next" aria-label="下一首" onClick={() => move(1)}>
                <ArrowRight aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="selection-details">
            <div className="selection-title">
              <span className="eyebrow">SELECTED TRACK</span>
              <h2>{edition?.chart.title}</h2>
            </div>
            <div className="chart-type-choice" aria-label="游玩谱面类型">
              {(['fitness', 'dance'] as const).map((d) => (
                <button
                  key={d}
                  aria-label={d.toUpperCase()}
                  disabled={!available.includes(d)}
                  aria-pressed={selectedChartType === d}
                  className={d}
                  onClick={() => onChartType(d)}
                >
                  {d.toUpperCase()}
                  <small>
                    {available.includes(d) ? ratingSummary(selected.released[d]!.chart) : '—'}
                  </small>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <MenuControls onBack={back} />
      {confirmStart && (
        <StartBriefing
          song={confirmStart.song}
          chartType={confirmStart.chartType}
          available={editionsIn(confirmStart.song, albumId)}
          albumName={album.name}
          onChartType={(type) => {
            onChartType(type);
            setConfirmStart({ ...confirmStart, chartType: type });
          }}
          onClose={closeConfirmation}
          onStart={() => {
            void props
              .onPlay(confirmStart.song, confirmStart.chartType)
              .finally(() => setConfirmStart(null));
          }}
          onSound={props.onSound}
        />
      )}
    </section>
  );
}
