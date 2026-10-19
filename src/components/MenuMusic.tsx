import { useEffect, useRef, useState } from 'react';
import {
  Headphones,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Shuffle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { MenuMusic } from '../useMenuMusic';
import type { MenuSoundPlayer } from '../useMenuSounds';

export function MusicPulse({ music, waveform = true }: { music: MenuMusic; waveform?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const audible = music.visualVolume > 0;
  useEffect(() => {
    const node = canvas.current!;
    const ctx = waveform ? node.getContext('2d') : null;
    const menu = node.closest<HTMLElement>('.menu-app');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const bins = new Uint8Array(music.analyser?.frequencyBinCount ?? 1024);
    const count = 56;
    const smooth = new Float32Array(count);
    const binHz = (music.analyser?.context.sampleRate ?? 48000) / (bins.length * 2);
    // Low frequencies sit by the headphones; treble extends toward the edges.
    const bands = Array.from({ length: count }, (_, i) => {
      const start = Math.max(1, Math.floor((80 * 150 ** (i / count)) / binHz));
      const end = Math.min(
        bins.length,
        Math.max(start + 1, Math.ceil((80 * 150 ** ((i + 1) / count)) / binHz)),
      );
      return { start, end };
    });
    const bassStart = Math.max(1, Math.floor(60 / binHz));
    const bassEnd = Math.ceil(220 / binHz);
    const bodyEnd = Math.ceil(1600 / binHz);
    let average = 0,
      beat = 0;
    let frame = 0,
      last = 0,
      width = 0,
      height = 0;
    const draw = (animate: boolean) => {
      if (animate) music.analyser?.getByteFrequencyData(bins);
      else smooth.fill(0);
      // Share the waveform's FFT read. Follow the musical energy continuously, with
      // a soft attack and a longer release instead of isolated, abrupt peak kicks.
      if (animate) {
        let bass = 0,
          body = 0;
        for (let i = bassStart; i < bodyEnd; i++) {
          const power = (bins[i] / 255) ** 2;
          if (i < bassEnd) bass += power;
          else body += power;
        }
        const energy = (bass / (bassEnd - bassStart)) * 0.65 + (body / (bodyEnd - bassEnd)) * 0.35;
        average += (energy - average) * 0.025;
        const target = Math.min(
          1,
          Math.max(0, (energy - average * 0.65) / Math.max(0.08, average)),
        );
        beat += (target - beat) * (target > beat ? 0.45 : 0.13);
      } else average = beat = 0;
      menu?.style.setProperty('--music-beat', beat.toFixed(3));
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < count; i++) {
        const { start, end } = bands[i];
        let total = 0;
        for (let bin = start; bin < end; bin++) total += bins[bin];
        const level = (total / ((end - start) * 255)) ** 2;
        if (animate) smooth[i] += (level - smooth[i]) * (level > smooth[i] ? 0.55 : 0.25);
        const amplitude = 2 + smooth[i] * height * 0.28;
        const offset = 54 + (i * (width / 2 - 55.5)) / (count - 1);
        ctx.globalAlpha = 0.95 - (i / count) * 0.3;
        ctx.fillStyle = '#f64e93';
        ctx.fillRect(width / 2 - offset - 1.5, height / 2 - amplitude, 3, amplitude * 2);
        ctx.fillStyle = '#35c9db';
        ctx.fillRect(width / 2 + offset - 1.5, height / 2 - amplitude, 3, amplitude * 2);
      }
    };
    const tick = (now: number) => {
      if (now - last >= 1000 / 30) {
        draw(true);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const refresh = () => {
      cancelAnimationFrame(frame);
      draw(false);
      if (music.playing && audible && music.analyser && !document.hidden && !reduced.matches)
        frame = requestAnimationFrame(tick);
    };
    const resize = ctx
      ? new ResizeObserver(() => {
          width = node.clientWidth;
          height = node.clientHeight;
          const ratio = Math.min(devicePixelRatio, 2);
          node.width = width * ratio;
          node.height = height * ratio;
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          refresh();
        })
      : null;
    resize?.observe(node);
    refresh();
    document.addEventListener('visibilitychange', refresh);
    reduced.addEventListener('change', refresh);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      reduced.removeEventListener('change', refresh);
      menu?.style.removeProperty('--music-beat');
    };
  }, [music.analyser, music.playing, audible, waveform]);
  return <canvas className="music-pulse" ref={canvas} hidden={!waveform} aria-hidden="true" />;
}

const orders = [
  { id: 'random', label: '随机', caption: 'SHUFFLE', Icon: Shuffle },
  { id: 'repeat', label: '单曲循环', caption: 'REPEAT', Icon: Repeat },
  { id: 'list', label: '列表循环', caption: 'SEQUENTIAL', Icon: ListMusic },
] as const;

const panelOutline = 'M3 23 23 3H977L997 23V177L977 197H518L500 215 482 197H23L3 177Z';

function MusicPanelFrame() {
  return (
    <div className="music-panel-art" aria-hidden="true">
      <svg className="music-panel-frame" viewBox="0 0 1000 220" preserveAspectRatio="none">
        <path
          className="music-panel-accent pink"
          d="M0 51V20L20 0H49M0 151V180L20 200H49M482 201 500 219 518 201"
        />
        <path
          className="music-panel-accent cyan"
          d="M951 0H980L1000 20V51M1000 151V180L980 200H951"
        />
        <path className="music-panel-outline" d={panelOutline} />
        <g className="music-panel-trace">
          <path d={panelOutline} pathLength="100" />
          <path d={panelOutline} pathLength="100" />
        </g>
      </svg>
      <i className="music-halftone top" />
      <i className="music-halftone bottom" />
      <i className="music-panel-stripes" />
    </div>
  );
}

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function BgmNowPlaying({
  music,
  open,
  onSound,
}: {
  music: MenuMusic;
  open: boolean;
  onSound: MenuSoundPlayer;
}) {
  const [position, setPosition] = useState(music.transport.position);
  useEffect(() => {
    if (!open) return;
    const update = () => setPosition(music.transport.position());
    update();
    return music.transport.subscribe(update);
  }, [music.transport, open]);
  return (
    <div className="music-panel-section music-now-playing">
      <h2 className="music-section-heading">NOW PLAYING</h2>
      <strong className="music-now-title" title={music.track?.title}>
        {music.track?.title ?? 'MENU MUSIC'}
      </strong>
      <div className="music-progress-controls">
        <button
          className="music-play-toggle"
          aria-label={music.playing ? '暂停菜单 BGM' : '播放菜单 BGM'}
          onClick={() => {
            onSound('settings');
            music.toggle();
          }}
        >
          {music.playing ? (
            <Pause size={22} fill="currentColor" />
          ) : (
            <Play size={22} fill="currentColor" />
          )}
        </button>
        <input
          className="music-range"
          aria-label="菜单 BGM 进度"
          aria-valuetext={`${clock(position.time)} / ${clock(position.duration)}`}
          type="range"
          min="0"
          max={position.duration || 1}
          step="0.1"
          disabled={!position.duration}
          value={Math.min(position.time, position.duration)}
          style={
            {
              '--range-progress': `${position.duration ? (position.time / position.duration) * 100 : 0}%`,
            } as React.CSSProperties
          }
          onChange={(event) => {
            const time = Number(event.target.value);
            music.transport.seek(time);
            setPosition((previous) => ({ ...previous, time }));
          }}
        />
      </div>
      <div className="music-progress-times" aria-hidden="true">
        <span>{clock(position.time)}</span>
        <span>{clock(position.duration)}</span>
      </div>
    </div>
  );
}

export function MenuMusicConsole({
  music,
  onSound,
}: {
  music: MenuMusic;
  onSound: MenuSoundPlayer;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const close = () => {
    cancelClose();
    setPinned(false);
    if (panel.current?.contains(document.activeElement))
      (document.activeElement as HTMLElement)?.blur();
    setOpen(false);
  };
  const scheduleClose = () => {
    cancelClose();
    if (pinned) return;
    closeTimer.current = window.setTimeout(close, 100);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(() => {
    const button = root.current?.querySelector('.headphone-button');
    const highlight = (event: Event) => {
      if ((event as CustomEvent<boolean>).detail) show();
      else scheduleClose();
    };
    button?.addEventListener('menu-highlight-change', highlight);
    return () => button?.removeEventListener('menu-highlight-change', highlight);
  }, [pinned]);
  return (
    <div
      className="music-console"
      ref={root}
      data-open={open ? '' : undefined}
      onPointerLeave={scheduleClose}
      onBlurCapture={(event) => {
        if (!pinned && !event.currentTarget.contains(event.relatedTarget)) {
          cancelClose();
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          root.current?.querySelector<HTMLButtonElement>('.headphone-button')?.focus();
          close();
        }
      }}
    >
      <div className="music-console-line">
        <MusicPulse music={music} />
        <button
          className="headphone-button"
          aria-label="选择主界面 BGM"
          aria-expanded={open}
          aria-pressed={pinned}
          aria-controls="theme-music-panel"
          onPointerLeave={scheduleClose}
          onFocus={show}
          onClick={() => {
            onSound('settings');
            if (pinned) close();
            else {
              show();
              setPinned(true);
            }
          }}
        >
          {pinned && (
            <svg
              className="headphone-pin-rays"
              data-muted={music.volume === 0 ? '' : undefined}
              viewBox="0 0 100 76"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M11 9 20 18M31 1 35 11M3 34 15 36M89 9 80 18M69 1 65 11M97 34 85 36" />
            </svg>
          )}
          <Headphones size={60} strokeWidth={2.5} />
        </button>
      </div>
      <section
        className="music-panel"
        id="theme-music-panel"
        ref={panel}
        role="region"
        aria-label="主界面音乐"
        aria-hidden={!open}
        inert={!open}
        onPointerEnter={show}
        onPointerLeave={scheduleClose}
        onFocusCapture={show}
      >
        <MusicPanelFrame />
        <div className="music-panel-columns">
          <BgmNowPlaying music={music} open={open} onSound={onSound} />
          <div className="music-panel-section music-track-select">
            <h2 className="music-section-heading">TRACK SELECT</h2>
            <div className="theme-track-list">
              {music.tracks.length ? (
                music.tracks.map((track, index) => (
                  <button
                    className="theme-track"
                    key={track.id}
                    aria-pressed={music.track?.id === track.id}
                    onClick={() => {
                      onSound('settings');
                      music.select(track.id);
                    }}
                  >
                    <small>{String(index + 1).padStart(2, '0')}</small>
                    <i aria-hidden="true" />
                    <span title={track.title}>{track.title}</span>
                  </button>
                ))
              ) : (
                <p className="music-empty">还没有主题音乐</p>
              )}
            </div>
          </div>
          <div className="music-panel-section music-playback-settings">
            <h2 className="music-section-heading">PLAYBACK MODE</h2>
            <div className="music-order" aria-label="音乐播放方式">
              {orders.map(({ id, label, caption, Icon }) => (
                <button
                  key={id}
                  aria-label={label}
                  aria-pressed={music.order === id}
                  onClick={() => {
                    onSound('settings');
                    music.setOrder(id);
                  }}
                >
                  <Icon size={22} />
                  <span>{caption}</span>
                </button>
              ))}
            </div>
            <h2 className="music-section-heading music-volume-heading">VOLUME</h2>
            <div className="music-volume-controls">
              <button
                className="music-mute-toggle"
                aria-label={music.volume === 0 ? '取消菜单 BGM 静音' : '静音菜单 BGM'}
                aria-pressed={music.volume === 0}
                onClick={() => {
                  onSound('settings');
                  music.toggleMute();
                }}
              >
                {music.volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
              <input
                className="music-range"
                aria-label="菜单 BGM 音量"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={music.volume}
                style={{ '--range-progress': `${music.volume * 100}%` } as React.CSSProperties}
                onChange={(event) => music.setVolume(Number(event.target.value))}
              />
              <span>{Math.round(music.volume * 100)}%</span>
            </div>
          </div>
        </div>
      </section>
      <div
        className="music-panel-bridge"
        onPointerEnter={show}
        onPointerLeave={scheduleClose}
        aria-hidden="true"
      />
    </div>
  );
}
