import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveVideo } from './local-media';
import { audioOutputErrorMessage } from './media';

const files = import.meta.glob<string>('./assets/menu-bgm/*.{mp3,ogg,wav,m4a,MP3,OGG,WAV,M4A}', {
  eager: true,
  query: '?url',
  import: 'default',
});
export const themeTracks = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, url]) => {
    const id = path.split('/').at(-1)!;
    return { id, title: id.replace(/\.[^.]+$/, ''), url };
  });
export type MusicOrder = 'list' | 'random' | 'repeat';
type Scene = 'theme' | 'preview' | null;
function preference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Session settings still work. */
  }
}

export function useMenuMusic(
  scene: Scene,
  previewAsset: string | undefined,
  notify: (s: string) => void,
  videoVolume: number,
) {
  // Keep the paused theme loaded: swapping MP3/MP4 and seeking a reloaded MP3 can
  // fail in Chromium's demuxer. Only one of these two elements plays at a time.
  const [bgm] = useState(() => new Audio());
  const [preview] = useState(() => new Audio());
  const [selected, setSelected] = useState(() => preference('waifu-menu-track', ''));
  const [order, setOrder] = useState<MusicOrder>(() => {
    const saved = preference('waifu-menu-order', 'list');
    return saved === 'random' || saved === 'repeat' ? saved : 'list';
  });
  const [volume, setVolume] = useState(() =>
    Math.max(0, Math.min(1, Number(preference('waifu-menu-volume', '0.9')) || 0)),
  );
  const [playing, setPlaying] = useState(false);
  const [quiet, setQuiet] = useState(true);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const graph = useRef<{ context: AudioContext; source: MediaElementAudioSourceNode } | null>(null);
  const active = useRef<HTMLAudioElement | null>(null);
  const manuallyPaused = useRef(false);
  const previewUrl = useRef<string | undefined>(undefined);
  const levels = useRef({ volume, videoVolume });
  levels.current = { volume, videoVolume };
  const gain = useRef(0);
  const fadeIn = useRef(false);
  const fading = useRef<{ frame: number; finish: (done: boolean) => void } | null>(null);
  const track = themeTracks.find((t) => t.id === selected) ?? themeTracks[0];
  const themeUrl = scene === 'theme' ? track?.url : undefined;
  const assetId = scene === 'preview' ? previewAsset : undefined;

  const cancelFade = useCallback(() => {
    if (!fading.current) return;
    cancelAnimationFrame(fading.current.frame);
    fading.current.finish(false);
    fading.current = null;
  }, []);
  const fade = useCallback(
    (target: number, duration: number): Promise<boolean> => {
      cancelFade();
      const audio = active.current;
      if (!audio || audio.paused || gain.current === target) {
        gain.current = target;
        return Promise.resolve(true);
      }
      const from = gain.current,
        start = performance.now();
      return new Promise((finish) => {
        const tick = (now: number) => {
          const progress = Math.max(0, Math.min(1, (now - start) / duration));
          gain.current = from + (target - from) * progress;
          audio.volume =
            gain.current * (audio === bgm ? levels.current.volume : levels.current.videoVolume);
          if (progress < 1) fading.current = { frame: requestAnimationFrame(tick), finish };
          else {
            fading.current = null;
            finish(true);
          }
        };
        fading.current = { frame: requestAnimationFrame(tick), finish };
      });
    },
    [bgm, cancelFade],
  );
  const clearPreview = useCallback(() => {
    preview.pause();
    if (preview.hasAttribute('src')) {
      preview.removeAttribute('src');
      preview.load();
    }
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = undefined;
  }, [preview]);
  const play = useCallback(() => {
    const audio = active.current;
    if (!audio?.getAttribute('src') || (audio === bgm && manuallyPaused.current)) return;
    if (audio === bgm && graph.current?.context.state === 'suspended')
      void graph.current.context.resume().catch(() => {});
    if (audio.paused)
      void audio.play().catch(() => {
        /* Wait for a user gesture if autoplay is blocked. */
      });
  }, [bgm]);

  useEffect(() => {
    const unlock = () => {
      if (active.current === bgm && manuallyPaused.current) return;
      if (active.current === bgm && !graph.current && bgm.getAttribute('src')) {
        const context = new AudioContext();
        try {
          const source = context.createMediaElementSource(bgm);
          const meter = context.createAnalyser();
          meter.fftSize = 512;
          source.connect(meter);
          meter.connect(context.destination);
          graph.current = { context, source };
          setAnalyser(meter);
        } catch {
          void context.close();
        }
      }
      play();
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    bgm.addEventListener('playing', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      bgm.removeEventListener('playing', unlock);
    };
  }, [bgm, play]);

  useEffect(() => {
    const update = () => setPlaying(!bgm.paused && !bgm.ended && bgm.readyState >= 3);
    const startFade = (event: Event) => {
      if (event.target === active.current && fadeIn.current) {
        fadeIn.current = false;
        void fade(1, 240);
      }
      update();
    };
    const error = (event: Event) => {
      const audio = event.target as HTMLAudioElement;
      if (audio === active.current)
        notify(audioOutputErrorMessage(audio.error) || '音乐无法播放，请检查音频或关联视频。');
    };
    const events = ['pause', 'waiting', 'ended'];
    events.forEach((name) => bgm.addEventListener(name, update));
    for (const audio of [bgm, preview]) {
      audio.addEventListener('playing', startFade);
      audio.addEventListener('error', error);
    }
    return () => {
      events.forEach((name) => bgm.removeEventListener(name, update));
      for (const audio of [bgm, preview]) {
        audio.removeEventListener('playing', startFade);
        audio.removeEventListener('error', error);
      }
    };
  }, [bgm, preview, fade, notify]);

  useEffect(() => {
    let cancelled = false;
    fadeIn.current = false;
    void (async () => {
      if (!(await fade(0, 160)) || cancelled) return;
      active.current?.pause();
      active.current = null;
      clearPreview();
      if (scene !== 'theme' && graph.current) await graph.current.context.suspend().catch(() => {});
      if (cancelled) return;
      setQuiet(true);
      let next: HTMLAudioElement;
      if (themeUrl) {
        next = bgm;
        if (bgm.getAttribute('src') !== themeUrl) bgm.src = themeUrl;
      } else if (assetId) {
        // The fade also lets fast carousel scrolling settle before reading a video.
        const result = await resolveVideo(assetId).catch(() => null);
        if (cancelled || !result || !('asset' in result)) return;
        next = preview;
        const { asset } = result;
        preview.src =
          asset.kind === 'demo'
            ? asset.url
            : (previewUrl.current = URL.createObjectURL(asset.file));
        preview.loop = true;
      } else return;
      next.volume = 0;
      active.current = next;
      fadeIn.current = true;
      setQuiet(false);
      play();
    })();
    return () => {
      cancelled = true;
      cancelFade();
    };
  }, [scene, themeUrl, assetId, bgm, preview, fade, clearPreview, cancelFade, play]);

  useEffect(() => {
    bgm.loop = order === 'repeat' || themeTracks.length < 2;
    const next = () => {
      if (scene !== 'theme' || !track) return;
      const index = themeTracks.indexOf(track);
      const advance =
        order === 'random' ? 1 + Math.floor(Math.random() * (themeTracks.length - 1)) : 1;
      setSelected(themeTracks[(index + advance) % themeTracks.length].id);
    };
    bgm.addEventListener('ended', next);
    return () => bgm.removeEventListener('ended', next);
  }, [scene, order, track, bgm]);
  useEffect(() => {
    bgm.volume = (active.current === bgm ? gain.current : 0) * volume;
    preview.volume = (active.current === preview ? gain.current : 0) * videoVolume;
    remember('waifu-menu-volume', String(volume));
  }, [volume, videoVolume, bgm, preview]);
  useEffect(() => remember('waifu-menu-order', order), [order]);
  useEffect(() => remember('waifu-menu-track', selected), [selected]);
  useEffect(
    () => () => {
      cancelFade();
      clearPreview();
      bgm.pause();
      bgm.removeAttribute('src');
      bgm.load();
      graph.current?.source.disconnect();
      void graph.current?.context.close();
    },
    [bgm, clearPreview, cancelFade],
  );
  return {
    tracks: themeTracks,
    track,
    order,
    setOrder,
    volume,
    setVolume,
    select: (id: string) => {
      if (id !== track?.id) manuallyPaused.current = false;
      setSelected(id);
    },
    toggle: () => {
      if (active.current !== bgm) return;
      manuallyPaused.current = !bgm.paused;
      if (manuallyPaused.current) {
        bgm.pause();
        void graph.current?.context.suspend().catch(() => {});
      } else play();
    },
    playing,
    analyser,
    quiet,
  };
}
export type MenuMusic = ReturnType<typeof useMenuMusic>;
