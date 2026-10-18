import { useEffect, useRef, useState } from 'react';
import { Check, Headphones, ListMusic, Repeat1, Shuffle, X } from 'lucide-react';
import type { MenuMusic } from '../useMenuMusic';
import { ModalBackdrop } from './ModalBackdrop';

function MusicPulse({ music }: { music: MenuMusic }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current!;
    const ctx = node.getContext('2d')!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const bins = new Uint8Array(music.analyser?.frequencyBinCount ?? 128);
    let frame = 0,
      last = 0,
      width = 0,
      height = 0;
    const draw = (animate: boolean) => {
      if (animate) music.analyser?.getByteFrequencyData(bins);
      else bins.fill(0);
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < 24; i++) {
        const level = bins[1 + Math.floor(i * 1.7)] / 255;
        const amplitude = 2 + level * (height * 0.42) * (1 - i / 32);
        const offset = 54 + (i * (width / 2 - 62)) / 24;
        ctx.globalAlpha = 1 - i / 34;
        ctx.fillStyle = '#35c9db';
        ctx.fillRect(width / 2 - offset - 3, height / 2 - amplitude, 3, amplitude * 2);
        ctx.fillStyle = '#f64e93';
        ctx.fillRect(width / 2 + offset, height / 2 - amplitude, 3, amplitude * 2);
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
      if (music.playing && music.analyser && !document.hidden && !reduced.matches)
        frame = requestAnimationFrame(tick);
    };
    const resize = new ResizeObserver(() => {
      width = node.clientWidth;
      height = node.clientHeight;
      const ratio = Math.min(devicePixelRatio, 2);
      node.width = width * ratio;
      node.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      refresh();
    });
    resize.observe(node);
    document.addEventListener('visibilitychange', refresh);
    reduced.addEventListener('change', refresh);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      reduced.removeEventListener('change', refresh);
    };
  }, [music.analyser, music.playing]);
  return <canvas className="music-pulse" ref={canvas} aria-hidden="true" />;
}

const orders = [
  { id: 'list', label: '列表循环', Icon: ListMusic },
  { id: 'random', label: '随机', Icon: Shuffle },
  { id: 'repeat', label: '单曲循环', Icon: Repeat1 },
] as const;

export function MenuMusicSettings({ music }: { music: MenuMusic }) {
  return (
    <label className="field menu-music-volume">
      <span>菜单音乐音量 · {Math.round(music.volume * 100)}%</span>
      <input
        aria-label="菜单音乐音量"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={music.volume}
        onChange={(e) => music.setVolume(Number(e.target.value))}
      />
    </label>
  );
}

export function MenuMusicConsole({ music }: { music: MenuMusic }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="music-console">
      <div className="music-console-line">
        <MusicPulse music={music} />
        <button
          className="headphone-button"
          aria-label="选择主界面 BGM"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Headphones size={30} strokeWidth={2.5} />
        </button>
      </div>
      <span className="music-console-title">{music.track?.title ?? 'MENU MUSIC'}</span>
      {open && (
        <ModalBackdrop onClose={() => setOpen(false)}>
          <section
            className="modal theme-music-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="theme-music-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭主界面音乐"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            <span className="eyebrow">MENU MIX / WAIFU FIT</span>
            <h2 id="theme-music-title">主界面音乐</h2>
            <div className="music-order" aria-label="音乐播放方式">
              {orders.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  aria-pressed={music.order === id}
                  onClick={() => music.setOrder(id)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            <div className="theme-track-list">
              {music.tracks.length ? (
                music.tracks.map((track, index) => (
                  <button
                    key={track.id}
                    className="theme-track"
                    aria-pressed={music.track?.id === track.id}
                    onClick={() => music.select(track.id)}
                  >
                    <small>{String(index + 1).padStart(2, '0')}</small>
                    <span>{track.title}</span>
                    {music.track?.id === track.id && <Check size={17} />}
                  </button>
                ))
              ) : (
                <p className="music-empty">还没有主题音乐</p>
              )}
            </div>
            <MenuMusicSettings music={music} />
          </section>
        </ModalBackdrop>
      )}
    </div>
  );
}
