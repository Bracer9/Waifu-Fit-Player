import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { Edition } from '../library';
import type { MenuMusic } from '../useMenuMusic';
import { CoverArt } from './CoverArt';
import { MenuHintArrows } from './MainMenuDownHint';
import { formatTime } from '../timing';

export const ALBUM_DECK_TIMING = {
  unfold: 620,
  hint: 400,
  insert: 960,
  quickInsert: 420,
  release: 220,
  tune: 620,
  reveal: 380,
};

export function AlbumDeck({
  open,
  ready,
  inserting,
  edition,
  count,
  index,
  music,
  onTrack,
  onInsert,
}: {
  open: boolean;
  ready: boolean;
  inserting: boolean;
  edition?: Edition;
  count: number;
  index: number;
  music: MenuMusic;
  onTrack: (delta: number) => void;
  onInsert: () => void;
}) {
  const [position, setPosition] = useState(music.previewTransport.position);
  useEffect(() => {
    if (!open) return;
    const update = () => setPosition(music.previewTransport.position());
    update();
    return music.previewTransport.subscribe(update);
  }, [open, edition, music.previewTransport]);
  return (
    <>
      {open && !inserting && (
        <span
          className="album-deck-insert-hint"
          aria-hidden="true"
          style={{ '--deck-hint-delay': `${ALBUM_DECK_TIMING.hint}ms` } as React.CSSProperties}
        >
          <span className="album-deck-insert-hint-direction">
            <span className="album-deck-insert-hint-beat">
              <MenuHintArrows />
            </span>
          </span>
          <small>ENTER</small>
          <span className="album-deck-quick-hint">SHIFT + ENTER · QUICK</span>
        </span>
      )}
      <aside
        className="album-deck"
        data-open={open || undefined}
        data-ready={ready || undefined}
        data-inserting={inserting || undefined}
        aria-label="专辑试听播放器"
        aria-hidden={!open}
        inert={!open || inserting}
      >
        <div className="album-deck-slot" aria-hidden="true">
          <i />
          <span>INSERT / PLAY</span>
        </div>
        <div className="album-deck-content">
          <header>
            <span>WAIFU FIT PLAYER</span>
            <small>MUSIC COLLECTION / {String(index + 1).padStart(2, '0')}</small>
          </header>
          <div className="album-deck-screen">
            <div className="album-deck-cover">
              <CoverArt src={edition?.cover} eager />
            </div>
          </div>
          <div className="album-deck-track">
            <small>
              {count
                ? `TRACK ${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`
                : 'EMPTY COLLECTION'}
            </small>
            <h2>{edition?.chart.title ?? '等待第一首作品'}</h2>
            <p>
              {count ? '点击或按 Enter 插入专辑，开始选曲' : '插入专辑后，可前往创作模式添加曲目'}
            </p>
          </div>
          <div className="album-deck-progress">
            <input
              type="range"
              min="0"
              max={position.duration || 1}
              step="0.1"
              value={Math.min(position.time, position.duration || 1)}
              aria-label="专辑试听进度"
              disabled={!edition || !music.previewReady}
              onChange={(e) => music.previewTransport.seek(Number(e.target.value))}
              style={
                {
                  '--range-progress': `${position.duration ? (position.time / position.duration) * 100 : 0}%`,
                } as React.CSSProperties
              }
            />
            <div>
              <span>{formatTime(position.time * 1000).slice(0, 5)}</span>
              <span>{formatTime(position.duration * 1000).slice(0, 5)}</span>
            </div>
          </div>
          <div className="album-deck-controls">
            <button aria-label="专辑试听上一首" disabled={count < 2} onClick={() => onTrack(-1)}>
              <ChevronLeft />
            </button>
            <button
              className="album-deck-play"
              aria-label={music.previewPlaying ? '暂停专辑试听' : '播放专辑试听'}
              disabled={!edition || !music.previewReady}
              onClick={music.togglePreview}
            >
              {music.previewPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </button>
            <button aria-label="专辑试听下一首" disabled={count < 2} onClick={() => onTrack(1)}>
              <ChevronRight />
            </button>
          </div>
          <button className="album-deck-insert" disabled={!ready} onClick={onInsert}>
            <span>INSERT ALBUM</span>
            <ArrowRight />
            <small>ENTER</small>
          </button>
          <footer>
            <span>STEREO / {music.previewPlaying ? 'PLAYING' : 'STANDBY'}</span>
            <span>ESC / BACK TO EJECT</span>
          </footer>
        </div>
      </aside>
    </>
  );
}

/** Quiet CRT tuning, held across the actual page swap; no alternating full-screen flashes. */
export function AlbumTuning({
  phase,
  onCovered,
  onRevealed,
}: {
  phase: 'cover' | 'reveal';
  onCovered: () => void;
  onRevealed: () => void;
}) {
  const callbacks = useRef({ onCovered, onRevealed });
  callbacks.current = { onCovered, onRevealed };
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(
      () => (phase === 'cover' ? callbacks.current.onCovered() : callbacks.current.onRevealed()),
      reduced ? 32 : phase === 'cover' ? ALBUM_DECK_TIMING.tune : ALBUM_DECK_TIMING.reveal,
    );
    return () => clearTimeout(timer);
  }, [phase]);
  return (
    <div
      className="album-tuning menu-curtain"
      data-phase={phase}
      style={
        {
          '--album-tune-duration': `${ALBUM_DECK_TIMING.tune}ms`,
          '--album-reveal-duration': `${ALBUM_DECK_TIMING.reveal}ms`,
        } as React.CSSProperties
      }
      role="status"
      aria-label="正在载入专辑"
    >
      <div className="album-tuning-grain" />
      <div className="album-tuning-station">
        <small>WFP / MUSIC COLLECTION</small>
        <b>
          TUNING IN<span>...</span>
        </b>
        <i />
        <span>YOUR NEXT TRACK IS READY.</span>
      </div>
    </div>
  );
}
