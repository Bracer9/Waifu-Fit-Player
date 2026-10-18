import { useEffect, useRef, useState } from 'react';
import { Check, Headphones, ListMusic, Pause, Play, Repeat1, Shuffle, X } from 'lucide-react';
import type { MenuMusic } from '../useMenuMusic';
import type { MenuSoundPlayer } from '../useMenuSounds';
import { ModalBackdrop } from './ModalBackdrop';

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
  { id: 'list', label: '列表循环', Icon: ListMusic },
  { id: 'random', label: '随机', Icon: Shuffle },
  { id: 'repeat', label: '单曲循环', Icon: Repeat1 },
] as const;

export function AudioVolumeControl({
  label,
  volume,
  onChange,
}: {
  label: string;
  volume: number;
  onChange: (volume: number) => void;
}) {
  return (
    <label className="field menu-music-volume">
      <span>
        {label} · {Math.round(volume * 100)}%
      </span>
      <input
        aria-label={label}
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
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
  const close = () => {
    onSound('back');
    setOpen(false);
  };
  return (
    <div className="music-console">
      <div className="music-console-line">
        <MusicPulse music={music} />
        <button
          className="headphone-button"
          aria-label="选择主界面 BGM"
          aria-expanded={open}
          onClick={() => {
            onSound('settings');
            setOpen(true);
          }}
        >
          <Headphones size={60} strokeWidth={2.5} />
        </button>
      </div>
      <span className="music-console-title">{music.track?.title ?? 'MENU MUSIC'}</span>
      {open && (
        <ModalBackdrop onClose={close}>
          <section
            className="modal theme-music-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="theme-music-title"
          >
            <button className="modal-close icon-button" aria-label="关闭主界面音乐" onClick={close}>
              <X />
            </button>
            <span className="eyebrow">MENU MIX / WAIFU FIT</span>
            <h2 id="theme-music-title">主界面音乐</h2>
            <div className="music-order" aria-label="音乐播放方式">
              {orders.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  aria-pressed={music.order === id}
                  onClick={() => {
                    onSound('settings');
                    music.setOrder(id);
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            <div className="theme-track-list">
              {music.tracks.length ? (
                music.tracks.map((track, index) => (
                  <div className="theme-track-row" key={track.id}>
                    <button
                      className="theme-track"
                      aria-pressed={music.track?.id === track.id}
                      onClick={() => {
                        onSound('settings');
                        music.select(track.id);
                      }}
                    >
                      <small>{String(index + 1).padStart(2, '0')}</small>
                      <span>{track.title}</span>
                      {music.track?.id === track.id && <Check size={17} />}
                    </button>
                    {music.track?.id === track.id && (
                      <button
                        className="theme-track-toggle"
                        aria-label={music.playing ? '暂停菜单 BGM' : '播放菜单 BGM'}
                        title={music.playing ? '暂停' : '播放'}
                        onClick={() => {
                          onSound('settings');
                          music.toggle();
                        }}
                      >
                        {music.playing ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="music-empty">还没有主题音乐</p>
              )}
            </div>
            <AudioVolumeControl
              label="菜单 BGM 音量"
              volume={music.volume}
              onChange={music.setVolume}
            />
          </section>
        </ModalBackdrop>
      )}
    </div>
  );
}
